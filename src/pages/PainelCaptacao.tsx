import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  RefreshCw,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../components/UI/EmptyState'
import { KpiCard } from '../components/UI/KpiCard'
import { Loading } from '../components/UI/Loading'
import { useProfile } from '../hooks/useProfile'
import {
  buildNormalStages,
  buildPayout,
  buildProuniStages,
  getCurrentGoalMonthKey,
  getDefaultActiveTeamSize,
  monthConfig,
  normalizeSellerValue,
  policyNormalTargets,
  resolveGoalStage,
  resolveSellerFromProfile,
  sellers,
  type ActiveTeamSize,
  type GoalMonthKey,
  type GoalStage,
  type Seller,
} from '../lib/sellers'
import { formatCurrencyBR, formatDateBR, formatNumberBR } from '../lib/formatters'
import { countBy, normalizeCampus, normalizeText, titleize } from '../lib/dashboardHelpers'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type CaptacaoView = 'Equipe' | Seller
type OpportunityTemperature = 'Frio' | 'Morno' | 'Quente' | 'Matriculado'

interface MatriculadoCaptacaoRow {
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

interface OpportunityRow {
  id: string
  vendedor: string | null
  nome: string | null
  curso: string | null
  forma_ingresso: string | null
  campus: string | null
  temperatura: OpportunityTemperature | string | null
  proximo_passo: string | null
  data_acao: string | null
  updated_at: string | null
}

type RegistroRow = Record<string, unknown>

interface SellerSummary {
  seller: Seller
  crmLeads: number
  opportunities: number
  normalCount: number
  prouniCount: number
  payout: number
  nextNormal: GoalStage | null
  nextProuni: GoalStage | null
}

const temperatureColumns: OpportunityTemperature[] = ['Frio', 'Morno', 'Quente', 'Matriculado']
const managerRoles = ['admin', 'reitoria', 'captacao_gerente'] as const

const excludedMetaStudentNames = new Set([
  'JONATHAN MENDES DE PAIVA',
  'ANA KAROLINA DA SILVA MORAES',
  'PEDRO ARTHUR GOMES SILVA',
])

function cleanText(value?: string | null) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function toDateKey(value?: string | null) {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const [, year, month, day] = iso
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) {
    const [, day, month, year] = br
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return ''
}

function readField(row: RegistroRow, fields: string[]) {
  const normalizedTargets = fields.map((field) =>
    normalizeText(field).replace(/[^A-Z0-9]/g, ''),
  )

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeText(key).replace(/[^A-Z0-9]/g, '')

    if (normalizedTargets.includes(normalizedKey)) {
      const text = cleanText(String(value ?? ''))

      if (text) {
        return text
      }
    }
  }

  return ''
}

function isCalouro(row: MatriculadoCaptacaoRow) {
  const normalizedStudent = normalizeText(row.aluno)
  return (
    normalizedStudent === 'JOAO VITOR RIBEIRO SOUSA DA MOTA' ||
    normalizeText(row.tipo_aluno) === 'CALOURO'
  )
}

function isExcludedFromMeta(row: MatriculadoCaptacaoRow) {
  return excludedMetaStudentNames.has(normalizeText(row.aluno))
}

function isMedicina(row: MatriculadoCaptacaoRow) {
  return normalizeText(row.curso) === 'MEDICINA'
}

function isProuni(row: MatriculadoCaptacaoRow) {
  return normalizeText(row.tipo_de_ingresso).includes('PROUNI')
}

function isExcludedIngressoFromMeta(row: MatriculadoCaptacaoRow) {
  const normalized = normalizeText(row.tipo_de_ingresso)
  const isReadmissao = normalized.includes('READMISSAO') && normalized.includes('TRANCAMENTO')
  const isFies = normalized === 'VAGAS NOVAS - ENEM - FIES'

  return isReadmissao || isFies
}

function isActiveContract(row: MatriculadoCaptacaoRow) {
  const contract = normalizeText(row.contrato)
  return !contract || contract === 'ATIVO'
}

function normalizeOpportunityTemperature(value?: string | null): OpportunityTemperature {
  const normalized = normalizeText(value)

  if (normalized.includes('MATRICULADO')) {
    return 'Matriculado'
  }

  if (normalized.includes('QUENTE')) {
    return 'Quente'
  }

  if (normalized.includes('MORNO')) {
    return 'Morno'
  }

  return 'Frio'
}

async function fetchAllRows<T>(tableName: string, selectClause: string, orderColumn = 'id') {
  if (!supabase) {
    return { data: [] as T[], error: new Error('Supabase indisponível.') }
  }

  const allRows: T[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectClause)
      .order(orderColumn, { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) {
      return { data: [] as T[], error }
    }

    const batch = (data ?? []) as T[]
    allRows.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    from += pageSize
  }

  return { data: allRows, error: null }
}

function buildTeamNormalStages(monthKey: GoalMonthKey, teamSize: ActiveTeamSize) {
  return policyNormalTargets[teamSize][monthKey].map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target,
    reward: [20, 30, 40, 60][index] ?? 0,
  }))
}

function StageProgressCard({
  stage,
  current,
}: {
  stage: GoalStage
  current: number
}) {
  const remaining = Math.max(stage.target - current, 0)
  const percentage = stage.target > 0 ? Math.min((current / stage.target) * 100, 100) : 0

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            {stage.label}
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {formatNumberBR(stage.target)}
          </p>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
          {formatCurrencyBR(stage.reward)}
        </span>
      </div>

      <div className="mt-5 h-2 rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-sky-500"
          style={{ width: `${Math.max(percentage, current > 0 ? 4 : 0)}%` }}
        />
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        {remaining === 0
          ? 'Faixa batida neste recorte.'
          : `Faltam ${formatNumberBR(remaining)} matrícula(s) para atingir esta faixa.`}
      </p>
    </article>
  )
}

function MiniBarChart({
  title,
  data,
}: {
  title: string
  data: Array<{ label: string; value: number }>
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {data.length ? (
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 16, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={132}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(value) => formatNumberBR(Number(value))} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Nenhum dado encontrado.
        </p>
      )}
    </section>
  )
}

export function PainelCaptacao() {
  const { profile } = useProfile()
  const canManage = managerRoles.includes(profile?.role as (typeof managerRoles)[number])
  const profileSeller = resolveSellerFromProfile(profile)

  const [rows, setRows] = useState<MatriculadoCaptacaoRow[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([])
  const [registroRows, setRegistroRows] = useState<RegistroRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<GoalMonthKey>(getCurrentGoalMonthKey())
  const [teamSize, setTeamSize] = useState<ActiveTeamSize>(getDefaultActiveTeamSize())
  const [selectedView, setSelectedView] = useState<CaptacaoView>(
    canManage ? 'Equipe' : profileSeller ?? 'Agestone',
  )

  useEffect(() => {
    if (!canManage && profileSeller) {
      setSelectedView(profileSeller)
    }
  }, [canManage, profileSeller])

  const loadRows = async () => {
    setLoading(true)
    setError(null)

    const [matriculadosResult, opportunitiesResult, registroResult] = await Promise.all([
      fetchAllRows<MatriculadoCaptacaoRow>(
        'matriculados_20262',
        'id, aluno, cpf, curso, filial, turno, tipo_aluno, tipo_de_ingresso, data_baixa_do_pagamento, contrato, status, vendedor',
      ),
      fetchAllRows<OpportunityRow>(
        'vendedor_oportunidades',
        'id, vendedor, nome, curso, forma_ingresso, campus, temperatura, proximo_passo, data_acao, updated_at',
        'updated_at',
      ),
      fetchAllRows<RegistroRow>('registro_crm', '*'),
    ])

    if (matriculadosResult.error || registroResult.error) {
      setError('Não foi possível carregar matrículas ou registros do CRM.')
      setRows([])
      setOpportunities([])
      setRegistroRows([])
      setLoading(false)
      return
    }

    setRows(
      matriculadosResult.data.map((row) => ({
        ...row,
        vendedor: normalizeSellerValue(row.vendedor) ?? row.vendedor ?? null,
      })),
    )
    setOpportunities(
      opportunitiesResult.error
        ? []
        : opportunitiesResult.data.map((row) => ({
            ...row,
            vendedor: normalizeSellerValue(row.vendedor) ?? row.vendedor ?? null,
          })),
    )
    setRegistroRows(registroResult.data)
    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const eligibleRows = useMemo(
    () =>
      rows
        .filter(isActiveContract)
        .filter(isCalouro)
        .filter((row) => !isExcludedFromMeta(row))
        .filter((row) => !isMedicina(row))
        .filter((row) => !isExcludedIngressoFromMeta(row)),
    [rows],
  )

  const monthRows = useMemo(
    () =>
      eligibleRows.filter((row) =>
        toDateKey(row.data_baixa_do_pagamento).startsWith(`2026-${selectedMonth}`),
      ),
    [eligibleRows, selectedMonth],
  )

  const teamProuniRows = useMemo(
    () => eligibleRows.filter((row) => isProuni(row)),
    [eligibleRows],
  )

  const viewSeller = selectedView === 'Equipe' ? null : selectedView
  const visibleNormalRows = useMemo(() => {
    const normalRows = monthRows.filter((row) => !isProuni(row))
    return viewSeller ? normalRows.filter((row) => row.vendedor === viewSeller) : normalRows
  }, [monthRows, viewSeller])

  const visibleProuniRows = useMemo(() => {
    return viewSeller
      ? teamProuniRows.filter((row) => row.vendedor === viewSeller)
      : teamProuniRows
  }, [teamProuniRows, viewSeller])

  const visibleOpportunities = useMemo(() => {
    return opportunities.filter((row) => {
      const rowSeller = normalizeSellerValue(row.vendedor)
      return viewSeller ? rowSeller === viewSeller : Boolean(rowSeller)
    })
  }, [opportunities, viewSeller])

  const sellerCrmCounts = useMemo(() => {
    const counts = new Map<Seller, number>()
    sellers.forEach((seller) => counts.set(seller, 0))

    registroRows.forEach((row) => {
      const seller = normalizeSellerValue(
        readField(row, [
          'Nome do responsável',
          'Nome do responsavel',
          'Responsável',
          'Responsavel',
          'Vendedor',
        ]),
      )

      if (seller) {
        counts.set(seller, (counts.get(seller) ?? 0) + 1)
      }
    })

    return counts
  }, [registroRows])

  const normalStages = useMemo(
    () =>
      selectedView === 'Equipe'
        ? buildTeamNormalStages(selectedMonth, teamSize)
        : buildNormalStages(selectedMonth, teamSize),
    [selectedMonth, selectedView, teamSize],
  )
  const prouniStages = useMemo(() => buildProuniStages(), [])
  const normalResolution = useMemo(
    () => resolveGoalStage(visibleNormalRows.length, normalStages),
    [normalStages, visibleNormalRows.length],
  )
  const prouniResolution = useMemo(
    () => resolveGoalStage(teamProuniRows.length, prouniStages),
    [prouniStages, teamProuniRows.length],
  )

  const payout = useMemo(() => {
    const normalPayout = buildPayout(visibleNormalRows.length, normalResolution.achieved)
    const prouniPayout = buildPayout(visibleProuniRows.length, prouniResolution.achieved)
    return normalPayout + prouniPayout
  }, [
    normalResolution.achieved,
    prouniResolution.achieved,
    visibleNormalRows.length,
    visibleProuniRows.length,
  ])

  const sellerSummaries = useMemo<SellerSummary[]>(() => {
    const teamProuniResolution = resolveGoalStage(teamProuniRows.length, prouniStages)

    return sellers.map((seller) => {
      const sellerNormalRows = monthRows.filter(
        (row) => !isProuni(row) && row.vendedor === seller,
      )
      const sellerProuniRows = teamProuniRows.filter((row) => row.vendedor === seller)
      const sellerNormalResolution = resolveGoalStage(
        sellerNormalRows.length,
        buildNormalStages(selectedMonth, teamSize),
      )

      return {
        seller,
        crmLeads: sellerCrmCounts.get(seller) ?? 0,
        opportunities: opportunities.filter((row) => normalizeSellerValue(row.vendedor) === seller)
          .length,
        normalCount: sellerNormalRows.length,
        prouniCount: sellerProuniRows.length,
        payout:
          buildPayout(sellerNormalRows.length, sellerNormalResolution.achieved) +
          buildPayout(sellerProuniRows.length, teamProuniResolution.achieved),
        nextNormal: sellerNormalResolution.next,
        nextProuni: teamProuniResolution.next,
      }
    })
  }, [
    monthRows,
    opportunities,
    prouniStages,
    selectedMonth,
    sellerCrmCounts,
    teamProuniRows,
    teamSize,
  ])

  const courseData = useMemo(
    () =>
      countBy(
        visibleNormalRows,
        (row) => titleize(cleanText(row.curso) || null),
        { limit: 10 },
      ),
    [visibleNormalRows],
  )

  const campusData = useMemo(
    () =>
      countBy(
        visibleNormalRows,
        (row) => normalizeCampus(row.filial),
        { limit: 8 },
      ),
    [visibleNormalRows],
  )

  const opportunityColumns = useMemo(() => {
    return temperatureColumns.map((temperature) => ({
      temperature,
      rows: visibleOpportunities.filter(
        (row) => normalizeOpportunityTemperature(row.temperatura) === temperature,
      ),
    }))
  }, [visibleOpportunities])

  if (loading) {
    return <Loading message="Carregando Painel de Captação..." />
  }

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar o Painel de Captação"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadRows()}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Tentar novamente
          </button>
        }
      />
    )
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-600">
              Painel de Captação
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {selectedView === 'Equipe'
                ? 'Visão gerencial da equipe'
                : `Painel do vendedor - ${selectedView}`}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            {canManage ? (
              <select
                value={selectedView}
                onChange={(event) => setSelectedView(event.target.value as CaptacaoView)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="Equipe">Equipe</option>
                {sellers.map((seller) => (
                  <option key={seller} value={seller}>
                    {seller}
                  </option>
                ))}
              </select>
            ) : null}

            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value as GoalMonthKey)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            >
              {Object.entries(monthConfig).map(([monthKey, config]) => (
                <option key={monthKey} value={monthKey}>
                  {config.label}
                </option>
              ))}
            </select>

            <select
              value={teamSize}
              onChange={(event) => setTeamSize(Number(event.target.value) as ActiveTeamSize)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value={2}>02 funcionários</option>
              <option value={3}>03 funcionários</option>
              <option value={4}>04 funcionários</option>
            </select>

            <button
              type="button"
              onClick={() => void loadRows()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Leads CRM"
          value={formatNumberBR(
            selectedView === 'Equipe'
              ? Array.from(sellerCrmCounts.values()).reduce((total, value) => total + value, 0)
              : sellerCrmCounts.get(selectedView) ?? 0,
          )}
          helperText=""
          emphasis="primary"
        />
        <KpiCard
          title="Oportunidades"
          value={formatNumberBR(visibleOpportunities.length)}
          helperText=""
        />
        <KpiCard
          title="Matrículas normais"
          value={formatNumberBR(visibleNormalRows.length)}
          helperText=""
        />
        <KpiCard
          title="PROUNI equipe"
          value={formatNumberBR(teamProuniRows.length)}
          helperText=""
        />
        <KpiCard
          title="Comissão prevista"
          value={formatCurrencyBR(payout)}
          helperText=""
        />
      </section>

      {canManage ? (
        <section className="grid gap-4 xl:grid-cols-4">
          {sellerSummaries.map((summary) => (
            <article
              key={summary.seller}
              className={cn(
                'rounded-3xl border bg-white p-5 shadow-sm',
                selectedView === summary.seller ? 'border-sky-300 bg-sky-50/40' : 'border-slate-200',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-950">{summary.seller}</h2>
                    <p className="text-xs text-slate-500">
                      {formatCurrencyBR(summary.payout)} previstos
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-slate-500">Leads</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">
                    {formatNumberBR(summary.crmLeads)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-slate-500">Matrículas</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">
                    {formatNumberBR(summary.normalCount)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-slate-500">PROUNI</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">
                    {formatNumberBR(summary.prouniCount)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-slate-500">Quadro</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">
                    {formatNumberBR(summary.opportunities)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Corrida de metas</h2>
            <p className="mt-2 text-sm text-slate-500">
              Normais seguem o mês selecionado. PROUNI é meta da equipe, sem divisão por vendedor.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">
              <Target className="h-4 w-4" />
              {normalResolution.next?.label ?? 'Meta normal batida'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {prouniResolution.next?.label ?? 'Meta PROUNI batida'}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {normalStages.map((stage) => (
            <StageProgressCard
              key={`normal-${stage.label}`}
              stage={stage}
              current={visibleNormalRows.length}
            />
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {prouniStages.map((stage) => (
            <StageProgressCard
              key={`prouni-${stage.label}`}
              stage={stage}
              current={teamProuniRows.length}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <MiniBarChart title="Matrículas por curso" data={courseData} />
        <MiniBarChart title="Matrículas por campus" data={campusData} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Quadro de oportunidades</h2>
            <p className="mt-2 text-sm text-slate-500">
              Leitura consolidada do quadro comercial do recorte selecionado.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 sm:inline-flex">
            <Users className="h-4 w-4" />
            {selectedView === 'Equipe' ? 'Equipe' : selectedView}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {opportunityColumns.map((column) => (
            <article
              key={column.temperature}
              className="min-h-[360px] rounded-3xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    {column.temperature}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">
                    {formatNumberBR(column.rows.length)}
                  </p>
                </div>
                {column.temperature === 'Matriculado' ? (
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                ) : (
                  <BarChart3 className="h-5 w-5 text-sky-500" />
                )}
              </div>

              <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {column.rows.length ? (
                  column.rows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold leading-5 text-slate-950">
                          {titleize(row.nome)}
                        </h3>
                        <Wallet className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {titleize(row.curso)} - {normalizeCampus(row.campus)}
                      </p>
                      <p className="mt-3 text-sm text-slate-700">
                        <strong>Ingresso:</strong> {titleize(row.forma_ingresso)}
                      </p>
                      {row.proximo_passo ? (
                        <p className="mt-2 text-sm text-slate-700">
                          <strong>Próximo passo:</strong> {cleanText(row.proximo_passo)}
                        </p>
                      ) : null}
                      {row.data_acao ? (
                        <p className="mt-2 text-sm text-slate-500">
                          Ação: {formatDateBR(row.data_acao)}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                    Sem oportunidades nesta coluna.
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

