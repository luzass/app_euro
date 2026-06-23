import { useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw, Target, Users, Wallet } from 'lucide-react'
import { EmptyState } from '../components/UI/EmptyState'
import { Loading } from '../components/UI/Loading'
import {
  formatCurrencyBR,
  formatDateBR,
  formatNumberBR,
} from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

interface MatriculadoMetaRow {
  id: number
  aluno: string | null
  cpf: string | null
  curso: string | null
  filial: string | null
  turno: string | null
  tipo_aluno: string | null
  tipo_de_ingresso: string | null
  data_baixa_do_pagamento: string | null
  contrato: string | null
  status: string | null
  vendedor?: string | null
}

type Seller = 'Tony' | 'William' | 'Gustavo' | 'Jordana'
type MonthKey = '05' | '06' | '07' | '08' | '09'

interface GoalStage {
  label: string
  target: number
  reward: number
}

interface SellerCardData {
  seller: Seller
  normalCount: number
  prouniCount: number
  totalCount: number
  normalStage: GoalStage | null
  prouniStage: GoalStage | null
  payout: number
  remainingNormal: number
  remainingProuni: number
  nextNormalLabel: string | null
  nextProuniLabel: string | null
  normalGateReached: boolean
  normalGateTarget: number
  normalGateCurrent: number
}

const sellers: Seller[] = ['Tony', 'William', 'Gustavo', 'Jordana']

const monthConfig: Record<
  MonthKey,
  {
    label: string
    normalTargets: number[]
  }
> = {
  '05': { label: 'Maio', normalTargets: [14, 15, 16, 18] },
  '06': { label: 'Junho', normalTargets: [21, 22, 23, 27] },
  '07': { label: 'Julho', normalTargets: [47, 49, 52, 60] },
  '08': { label: 'Agosto', normalTargets: [106, 110, 115, 134] },
  '09': { label: 'Setembro', normalTargets: [35, 36, 38, 44] },
}

const prouniTargets = [138, 150, 156]
const normalRewards = [20, 30, 40, 60]
const prouniRewards = [20, 30, 40]

function normalizeString(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function normalizeCpf(value?: string | null) {
  return (value ?? '').replace(/\D/g, '')
}

function titleize(value?: string | null) {
  if (!value) {
    return 'Nao informado'
  }

  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function toDateKey(value?: string | null) {
  if (!value) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/')
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

function getCurrentSaoPauloMonthKey(): MonthKey {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    month: '2-digit',
  })
  const month = formatter.format(new Date()) as MonthKey
  return month in monthConfig ? month : '06'
}

function isCalouro(row: MatriculadoMetaRow) {
  return normalizeString(row.tipo_aluno) === 'CALOURO'
}

function isProuni(row: MatriculadoMetaRow) {
  return normalizeString(row.tipo_de_ingresso).includes('PROUNI')
}

function isMedicina(row: MatriculadoMetaRow) {
  return normalizeString(row.curso) === 'MEDICINA'
}

function getVendorThresholds(targets: number[]) {
  return targets.map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target: Math.ceil(target / sellers.length),
  }))
}

function resolveStage(count: number, stages: GoalStage[]) {
  let achieved: GoalStage | null = null
  let next: GoalStage | null = null

  for (const stage of stages) {
    if (count >= stage.target) {
      achieved = stage
      continue
    }

    next = stage
    break
  }

  return {
    achieved,
    next,
    remaining: next ? Math.max(next.target - count, 0) : 0,
  }
}

function buildNormalStages(monthKey: MonthKey): GoalStage[] {
  const vendorTargets = getVendorThresholds(monthConfig[monthKey].normalTargets)
  return vendorTargets.map((item, index) => ({
    label: item.label,
    target: item.target,
    reward: normalRewards[index] ?? 0,
  }))
}

function buildProuniStages(): GoalStage[] {
  const vendorTargets = getVendorThresholds(prouniTargets)
  return vendorTargets.map((item, index) => ({
    label: item.label,
    target: item.target,
    reward: prouniRewards[index] ?? 0,
  }))
}

function buildGeneralNormalStages(monthKey: MonthKey): GoalStage[] {
  return monthConfig[monthKey].normalTargets.map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target,
    reward: normalRewards[index] ?? 0,
  }))
}

function buildGeneralProuniStages(): GoalStage[] {
  return prouniTargets.map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target,
    reward: prouniRewards[index] ?? 0,
  }))
}

function buildPayout(count: number, stage: GoalStage | null) {
  if (!stage || count <= 0) {
    return 0
  }

  return count * stage.reward
}

export function Metas() {
  const [rows, setRows] = useState<MatriculadoMetaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(getCurrentSaoPauloMonthKey())
  const [listNameFilter, setListNameFilter] = useState('')
  const [draftAssignments, setDraftAssignments] = useState<Record<number, Seller | ''>>({})
  const [savingRowId, setSavingRowId] = useState<number | null>(null)
  const [vendorColumnAvailable, setVendorColumnAvailable] = useState(true)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const loadRows = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de carregar as metas.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: loadError } = await supabase
      .from('matriculados_20262')
      .select(
        'id, aluno, cpf, curso, filial, turno, tipo_aluno, tipo_de_ingresso, data_baixa_do_pagamento, contrato, status, vendedor',
      )
      .order('data_baixa_do_pagamento', { ascending: false })

    if (loadError) {
      const fallback = await supabase
        .from('matriculados_20262')
        .select(
          'id, aluno, cpf, curso, filial, turno, tipo_aluno, tipo_de_ingresso, data_baixa_do_pagamento, contrato, status',
        )
        .order('data_baixa_do_pagamento', { ascending: false })

      if (fallback.error) {
        setError(
          'Nao foi possivel carregar a base de matriculados_20262 para a visao de metas.',
        )
        setRows([])
        setLoading(false)
        return
      }

      setVendorColumnAvailable(false)
      setRows((fallback.data as MatriculadoMetaRow[]) ?? [])
      setLoading(false)
      return
    }

    setVendorColumnAvailable(
      Boolean(data && data.length > 0 ? Object.prototype.hasOwnProperty.call(data[0], 'vendedor') : true),
    )
    setRows((data as MatriculadoMetaRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const monthRows = useMemo(() => {
    return rows
      .filter((row) => isCalouro(row))
      .filter((row) => !isMedicina(row))
      .filter((row) => {
        const dateKey = toDateKey(row.data_baixa_do_pagamento)
        return dateKey.startsWith(`2026-${selectedMonth}`)
      })
  }, [rows, selectedMonth])

  const allCalouroRows = useMemo(
    () => rows.filter((row) => isCalouro(row)).filter((row) => !isMedicina(row)),
    [rows],
  )

  const normalRows = useMemo(
    () => monthRows.filter((row) => !isProuni(row)),
    [monthRows],
  )

  const prouniRows = useMemo(
    () => allCalouroRows.filter((row) => isProuni(row)),
    [allCalouroRows],
  )

  const normalStages = useMemo(() => buildNormalStages(selectedMonth), [selectedMonth])
  const prouniStages = useMemo(() => buildProuniStages(), [])
  const generalNormalStages = useMemo(
    () => buildGeneralNormalStages(selectedMonth),
    [selectedMonth],
  )
  const generalProuniStages = useMemo(() => buildGeneralProuniStages(), [])

  const normalGeneralCards = useMemo(
    () =>
      generalNormalStages.map((stage) => ({
        ...stage,
        current: normalRows.length,
        remaining: Math.max(stage.target - normalRows.length, 0),
        hit: normalRows.length >= stage.target,
      })),
    [generalNormalStages, normalRows.length],
  )

  const generalNormalGateTarget = normalGeneralCards[0]?.target ?? 0
  const generalNormalGateReached =
    generalNormalGateTarget > 0 ? normalRows.length >= generalNormalGateTarget : true

  const prouniGeneralCards = useMemo(
    () =>
      generalProuniStages.map((stage) => ({
        ...stage,
        current: prouniRows.length,
        remaining: Math.max(stage.target - prouniRows.length, 0),
        hit: prouniRows.length >= stage.target,
      })),
    [generalProuniStages, prouniRows.length],
  )

  const sellerCards = useMemo<SellerCardData[]>(() => {
    return sellers.map((seller) => {
      const sellerNormalRows = normalRows.filter((row) => row.vendedor === seller)
      const sellerProuniRows = prouniRows.filter((row) => row.vendedor === seller)
      const totalCount = sellerNormalRows.length + sellerProuniRows.length

      const normalResolution = generalNormalGateReached
        ? resolveStage(sellerNormalRows.length, normalStages)
        : {
            achieved: null,
            next: null,
            remaining: Math.max(generalNormalGateTarget - normalRows.length, 0),
          }
      const prouniResolution = resolveStage(sellerProuniRows.length, prouniStages)
      const payout =
        (generalNormalGateReached
          ? buildPayout(sellerNormalRows.length, normalResolution.achieved)
          : 0) +
        buildPayout(sellerProuniRows.length, prouniResolution.achieved)

      return {
        seller,
        normalCount: sellerNormalRows.length,
        prouniCount: sellerProuniRows.length,
        totalCount,
        normalStage: normalResolution.achieved,
        prouniStage: prouniResolution.achieved,
        payout,
        remainingNormal: normalResolution.remaining,
        remainingProuni: prouniResolution.remaining,
        nextNormalLabel: generalNormalGateReached
          ? normalResolution.next?.label ?? null
          : 'Meta 01 geral',
        nextProuniLabel: prouniResolution.next?.label ?? null,
        normalGateReached: generalNormalGateReached,
        normalGateTarget: generalNormalGateTarget,
        normalGateCurrent: normalRows.length,
      }
    })
  }, [
    generalNormalGateReached,
    generalNormalGateTarget,
    normalRows,
    prouniRows,
    normalStages,
    prouniStages,
  ])

  const assignmentBaseRows = useMemo(() => {
    const mergedRows = new Map<number, MatriculadoMetaRow>()

    normalRows.forEach((row) => {
      mergedRows.set(row.id, row)
    })

    prouniRows.forEach((row) => {
      mergedRows.set(row.id, row)
    })

    return Array.from(mergedRows.values())
  }, [normalRows, prouniRows])

  const normalizedListNameFilter = useMemo(
    () => normalizeString(listNameFilter),
    [listNameFilter],
  )

  const filteredAssignmentRows = useMemo(() => {
    if (!normalizedListNameFilter) {
      return assignmentBaseRows
    }

    return assignmentBaseRows.filter((row) =>
      normalizeString(row.aluno).includes(normalizedListNameFilter),
    )
  }, [assignmentBaseRows, normalizedListNameFilter])

  const unassignedRows = useMemo(
    () => filteredAssignmentRows.filter((row) => !(row.vendedor && row.vendedor.trim())),
    [filteredAssignmentRows],
  )

  const assignedRows = useMemo(
    () => filteredAssignmentRows.filter((row) => row.vendedor && row.vendedor.trim()),
    [filteredAssignmentRows],
  )

  const handleAssignSeller = async (rowId: number, fallbackSeller?: string | null) => {
    if (!supabase || !vendorColumnAvailable) {
      return
    }

    const row = rows.find((item) => item.id === rowId)

    if (!row) {
      setSaveMessage('Nao encontramos esta matricula para salvar o vendedor.')
      return
    }

    const selectedSeller = draftAssignments[rowId] || (fallbackSeller as Seller | '') || ''
    if (!selectedSeller) {
      setSaveMessage('Escolha um vendedor antes de salvar a atribuicao.')
      return
    }

    const cpf = normalizeCpf(row.cpf)

    if (!cpf) {
      setSaveMessage('Esta matricula nao possui CPF valido para salvar o vendedor.')
      return
    }

    setSavingRowId(rowId)
    setSaveMessage(null)

    const { data: updatedRows, error: updateError } = await supabase
      .from('matriculados_20262')
      .update({ vendedor: selectedSeller })
      .eq('cpf', row.cpf ?? cpf)
      .select('id, cpf, vendedor')

    if (updateError) {
      setSaveMessage('Nao foi possivel salvar o vendedor desta matricula.')
      setSavingRowId(null)
      return
    }

    if (!updatedRows || updatedRows.length === 0) {
      setSaveMessage('O Supabase nao encontrou nenhuma linha para atualizar com este CPF.')
      setSavingRowId(null)
      return
    }

    setRows((currentValue) =>
      currentValue.map((currentRow) =>
        normalizeCpf(currentRow.cpf) === cpf
          ? { ...currentRow, vendedor: selectedSeller }
          : currentRow,
      ),
    )
    setDraftAssignments((currentValue) => ({
      ...currentValue,
      [rowId]: selectedSeller,
    }))
    setSavingRowId(null)
    setSaveMessage('Vendedor salvo com sucesso.')
  }

  const monthLabel = monthConfig[selectedMonth].label

  if (loading) {
    return <Loading message="Carregando metas e atribuicoes..." />
  }

  if (error) {
    return <EmptyState title="Nao foi possivel carregar as metas" description={error} />
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Operacao comercial
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Metas de captacao
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              A leitura considera somente calouros, usando a data da baixa do
              pagamento para definir o mes. PROUNI roda separado das metas normais.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(monthConfig) as MonthKey[]).map((monthKey) => (
              <button
                key={monthKey}
                type="button"
                onClick={() => setSelectedMonth(monthKey)}
                className={cn(
                  'rounded-2xl border px-4 py-2.5 text-sm font-semibold transition',
                  selectedMonth === monthKey
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                )}
              >
                {monthConfig[monthKey].label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadRows()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      {!vendorColumnAvailable ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          A coluna <strong>vendedor</strong> ainda nao existe em <strong>matriculados_20262</strong>.
          As metas aparecem normalmente, mas a atribuicao fica bloqueada ate rodar o SQL em{' '}
          <code>supabase/metas_vendedor.sql</code>.
        </section>
      ) : null}

      {saveMessage ? (
        <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          {saveMessage}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Meta geral de {monthLabel}</h3>
              <p className="text-sm text-slate-500">
                Normal e PROUNI acompanhados separadamente.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Matriculas normais</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {formatNumberBR(normalRows.length)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Calouros do mes fora do recorte PROUNI.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Matriculas PROUNI</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {formatNumberBR(prouniRows.length)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Calouros com tipo de ingresso PROUNI.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Sem vendedor</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {formatNumberBR(unassignedRows.length)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Matriculas que ainda precisam de atribuicao.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Com vendedor</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">
                {formatNumberBR(assignedRows.length)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Matriculas ja distribuidas entre o time.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Faixas do mes</h3>
          <div className="mt-4 space-y-3">
            {normalGeneralCards.map((stage) => (
              <div
                key={stage.label}
                className={cn(
                  'rounded-3xl border p-4',
                  stage.hit ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Meta geral normal: {formatNumberBR(stage.target)}
                    </p>
                  </div>
                  <p className="text-xl font-semibold text-slate-950">
                    {formatNumberBR(stage.current)}
                  </p>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  {stage.hit
                    ? 'Faixa ja atingida no recorte atual.'
                    : `Faltam ${formatNumberBR(stage.remaining)} matriculas para bater esta faixa.`}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Meta normal</h3>
              <p className="text-sm text-slate-500">Faixas gerais do mes selecionado.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {normalGeneralCards.map((stage) => (
              <article key={`normal-${stage.label}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">{stage.label}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">
                  {formatNumberBR(stage.target)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {stage.hit
                    ? 'Meta geral batida.'
                    : `Faltam ${formatNumberBR(stage.remaining)} para a meta geral.`}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#BA9008] text-[#02162d]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Meta PROUNI</h3>
              <p className="text-sm text-slate-500">Faixas separadas para o recorte PROUNI.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {prouniGeneralCards.map((stage) => (
              <article key={`prouni-${stage.label}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">{stage.label}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">
                  {formatNumberBR(stage.target)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {stage.hit
                    ? 'Meta PROUNI batida.'
                    : `Faltam ${formatNumberBR(stage.remaining)} para esta faixa.`}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Progresso por vendedor</h3>
          <p className="mt-1 text-sm text-slate-500">
            A meta individual usa a divisao da meta geral entre os quatro vendedores.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
          {sellerCards.map((card) => (
            <article key={card.seller} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-semibold text-slate-950">{card.seller}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatNumberBR(card.totalCount)} matriculas no ciclo atual
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                  {formatCurrencyBR(card.payout)}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Normal
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {formatNumberBR(card.normalCount)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {!card.normalGateReached
                      ? `Liberamos a meta individual quando a Meta 01 geral chegar em ${formatNumberBR(card.normalGateTarget)}. Hoje estamos em ${formatNumberBR(card.normalGateCurrent)}.`
                      : card.normalStage
                      ? `${card.normalStage.label} ativa - ${formatCurrencyBR(card.normalStage.reward)} por matricula`
                      : card.nextNormalLabel
                        ? `Faltam ${formatNumberBR(card.remainingNormal)} para ${card.nextNormalLabel}`
                        : 'Sem faixa ativa.'}
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    PROUNI
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {formatNumberBR(card.prouniCount)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {card.prouniStage
                      ? `${card.prouniStage.label} ativa - ${formatCurrencyBR(card.prouniStage.reward)} por matricula`
                      : card.nextProuniLabel
                        ? `Faltam ${formatNumberBR(card.remainingProuni)} para ${card.nextProuniLabel}`
                        : 'Sem faixa ativa.'}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-950">Sem vendedor</h3>
              <p className="mt-1 text-sm text-slate-500">
                Matriculas do mes atual que ainda precisam de atribuicao.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
              <label className="block w-full sm:min-w-[260px]">
                <span className="mb-2 block text-sm font-medium text-slate-700">Nome do aluno</span>
                <input
                  type="text"
                  value={listNameFilter}
                  onChange={(event) => setListNameFilter(event.target.value)}
                  placeholder="Ex.: Ana Claudia"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <span className="inline-flex h-[50px] items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {formatNumberBR(unassignedRows.length)}
              </span>
            </div>
          </div>

          {unassignedRows.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Nenhuma matricula pendente"
                description="As matriculas do recorte atual ja possuem vendedor atribuido."
              />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {unassignedRows.map((row) => (
                <div key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-950">{titleize(row.aluno)}</p>
                      <p className="text-sm text-slate-500">
                        {titleize(row.curso)} - {titleize(row.filial)} - {formatDateBR(row.data_baixa_do_pagamento)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isProuni(row) ? 'PROUNI' : 'Normal'} - {titleize(row.tipo_de_ingresso)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={draftAssignments[row.id] ?? ''}
                        onChange={(event) =>
                          setDraftAssignments((currentValue) => ({
                            ...currentValue,
                            [row.id]: event.target.value as Seller,
                          }))
                        }
                        disabled={!vendorColumnAvailable || savingRowId === row.id}
                        className="min-w-[170px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      >
                        <option value="">Escolher vendedor</option>
                        {sellers.map((seller) => (
                          <option key={`${row.id}-${seller}`} value={seller}>
                            {seller}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void handleAssignSeller(row.id)}
                        disabled={!vendorColumnAvailable || savingRowId === row.id}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        {savingRowId === row.id ? 'Salvando...' : 'Atribuir'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-950">Com vendedor</h3>
              <p className="mt-1 text-sm text-slate-500">
                Matriculas ja distribuidas, com possibilidade de ajuste.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
              <label className="block w-full sm:min-w-[260px]">
                <span className="mb-2 block text-sm font-medium text-slate-700">Nome do aluno</span>
                <input
                  type="text"
                  value={listNameFilter}
                  onChange={(event) => setListNameFilter(event.target.value)}
                  placeholder="Ex.: Ana Claudia"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <span className="inline-flex h-[50px] items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {formatNumberBR(assignedRows.length)}
              </span>
            </div>
          </div>

          {assignedRows.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Nenhuma matricula atribuida ainda"
                description="Quando os vendedores forem definidos, elas passam a aparecer aqui."
              />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {assignedRows.map((row) => (
                <div key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-950">{titleize(row.aluno)}</p>
                      <p className="text-sm text-slate-500">
                        {titleize(row.curso)} - {titleize(row.filial)} - {formatDateBR(row.data_baixa_do_pagamento)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {titleize(row.vendedor)} - {isProuni(row) ? 'PROUNI' : 'Normal'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={draftAssignments[row.id] ?? (row.vendedor as Seller | '') ?? ''}
                        onChange={(event) =>
                          setDraftAssignments((currentValue) => ({
                            ...currentValue,
                            [row.id]: event.target.value as Seller,
                          }))
                        }
                        disabled={!vendorColumnAvailable || savingRowId === row.id}
                        className="min-w-[170px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      >
                        {sellers.map((seller) => (
                          <option key={`${row.id}-${seller}`} value={seller}>
                            {seller}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void handleAssignSeller(row.id, row.vendedor)}
                        disabled={!vendorColumnAvailable || savingRowId === row.id}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        {savingRowId === row.id ? 'Salvando...' : 'Atualizar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
