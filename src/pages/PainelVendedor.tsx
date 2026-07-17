import {
  CalendarDays,
  GripVertical,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { EmptyState } from '../components/UI/EmptyState'
import { KpiCard } from '../components/UI/KpiCard'
import { Loading } from '../components/UI/Loading'
import { useProfile } from '../hooks/useProfile'
import { formatCurrencyBR, formatDateBR, formatNumberBR } from '../lib/formatters'
import {
  buildNormalStages,
  buildPayout,
  getCurrentGoalMonthKey,
  getDefaultActiveTeamSize,
  monthConfig,
  normalizeSellerValue,
  resolveGoalStage,
  resolveSellerFromProfile,
  sellers,
  type ActiveTeamSize,
  type GoalMonthKey,
  type Seller,
} from '../lib/sellers'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type RegistroRow = Record<string, unknown>

type InscritoRow = {
  cpf: string | null
  candidato: string | null
}

type MatriculadoRow = {
  id: number
  aluno: string | null
  cpf: string | null
  curso: string | null
  filial: string | null
  turno: string | null
  tipo_aluno: string | null
  tipo_de_ingresso: string | null
  data_baixa_do_pagamento: string | null
  vendedor?: string | null
}

type OpportunityTemperature = 'Frio' | 'Morno' | 'Quente'

type OpportunityAction = {
  id: string
  date: string
  step: string
  createdAt: string
}

type OpportunityRow = {
  id: string
  vendedor: string
  nome: string
  curso: string | null
  forma_ingresso: string | null
  campus: string | null
  temperatura: OpportunityTemperature
  proximo_passo: string | null
  data_acao: string | null
  historico: OpportunityAction[] | null
  created_at: string
  updated_at: string
}

type OpportunityInsertPayload = {
  vendedor: Seller
  nome: string
  curso: string | null
  forma_ingresso: string | null
  campus: string | null
  temperatura: OpportunityTemperature
  proximo_passo: string | null
  data_acao: string | null
  historico: Array<{
    id: string
    date: string
    step: string
    createdAt: string
  }>
  created_by: string | null
}

type CandidateSummary = {
  key: string
  personCode: string
  name: string
  cpf: string
  email: string
  course: string
  campus: string
  process: string
  status: 'Em andamento' | 'Perdido' | 'Ganho'
  objection: string
  lossObservation: string
  latestDateKey: string
  hasInscrito: boolean
  hasMatriculado: boolean
}

type ManualLeadFormState = {
  nome: string
  curso: string
  formaIngresso: string
  campus: string
  temperatura: OpportunityTemperature
  proximoPasso: string
  dataAcao: string
}

const leadFilterOptions = [
  { key: 'all', label: 'Todos' },
  { key: 'not-converted', label: 'Não convertidos' },
  { key: 'inscritos', label: 'Inscritos' },
  { key: 'matriculados', label: 'Matriculados' },
] as const

type LeadFilterKey = (typeof leadFilterOptions)[number]['key']

const temperatureColumns: OpportunityTemperature[] = ['Frio', 'Morno', 'Quente']

const initialManualLeadForm: ManualLeadFormState = {
  nome: '',
  curso: '',
  formaIngresso: '',
  campus: '',
  temperatura: 'Frio',
  proximoPasso: '',
  dataAcao: '',
}

function decodeMojibake(value?: string | null) {
  const text = String(value ?? '').trim()

  if (!text) {
    return ''
  }

  if (!/[ÃƒÃ‚]/.test(text)) {
    return text
  }

  try {
    const bytes = Uint8Array.from(Array.from(text).map((character) => character.charCodeAt(0)))
    const decoded = new TextDecoder('utf-8').decode(bytes).trim()
    return decoded || text
  } catch {
    return text
  }
}

function normalizeString(value?: string | null) {
  return decodeMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9@.\s/-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function cleanText(value?: string | null) {
  return decodeMojibake(value).replace(/\s+/g, ' ').trim()
}

function normalizeCpf(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeEmail(value?: string | null) {
  return cleanText(value).toLowerCase()
}

function titleize(value?: string | null, fallback = 'Não informado') {
  const text = cleanText(value)

  if (!text) {
    return fallback
  }

  return text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function toDateKey(value?: string | null) {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/')
    return `${year}-${month}-${day}`
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text)) {
    return text.slice(0, 10)
  }

  return ''
}

function canonicalizeFieldKey(value?: string | null) {
  return decodeMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
}

function readField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]

    if (value !== undefined && value !== null) {
      const textValue = cleanText(String(value))

      if (textValue) {
        return textValue
      }
    }
  }

  const normalizedTargets = new Set(keys.map((key) => canonicalizeFieldKey(key)).filter(Boolean))

  for (const [currentKey, currentValue] of Object.entries(row)) {
    if (
      currentValue !== undefined &&
      currentValue !== null &&
      normalizedTargets.has(canonicalizeFieldKey(currentKey))
    ) {
      const textValue = cleanText(String(currentValue))

      if (textValue) {
        return textValue
      }
    }
  }

  return ''
}

function normalizeCampus(...values: Array<string | null | undefined>) {
  const combined = normalizeString(values.join(' '))

  if (combined.includes('AGUAS CLARAS') || combined.includes('GUAS CLARAS')) {
    return 'Águas Claras'
  }

  if (combined.includes('ASA SUL')) {
    return 'Asa Sul'
  }

  return 'Não informado'
}

function normalizeProcess(value?: string | null) {
  const normalized = normalizeString(value)

  if (!normalized) {
    return 'Não informado'
  }

  if (normalized.includes('PROUNI')) {
    return 'PROUNI'
  }

  if (normalized.includes('ENEM')) {
    return 'ENEM'
  }

  if (normalized.includes('TRANSFERENCIA')) {
    return 'Transf. Externa'
  }

  if (
    normalized.includes('2A GRADUACAO') ||
    normalized.includes('SEGUNDA GRADUACAO') ||
    normalized.includes('GRADUACAO')
  ) {
    return '2ª Graduação'
  }

  if (normalized.includes('VESTIBULAR')) {
    return 'Vestibular'
  }

  return titleize(value)
}

function normalizeStatus(value?: string | null) {
  const normalized = normalizeString(value)

  if (normalized.includes('PERD')) {
    return 'Perdido' as const
  }

  if (normalized.includes('GANH')) {
    return 'Ganho' as const
  }

  return 'Em andamento' as const
}

function normalizeObjection(value?: string | null) {
  const text = cleanText(value)
  return !text || /^-\s*-\s*-$/.test(text) ? 'Não informada' : text
}

function normalizeLossObservation(value?: string | null) {
  const text = cleanText(value)
  return !text || /^-\s*-\s*-$/.test(text) ? 'Não informada' : text
}

function normalizeCourse(value?: string | null) {
  const text = cleanText(value)
  if (!text) {
    return 'Não informado'
  }

  return titleize(text.split(' - ')[0] ?? text)
}

function buildCandidateKeys(candidate: {
  personCode?: string
  cpf?: string
  email?: string
  name?: string
}) {
  const keys = new Set<string>()

  if (candidate.personCode) {
    keys.add(`code:${normalizeString(candidate.personCode)}`)
  }

  if (candidate.cpf) {
    keys.add(`cpf:${normalizeCpf(candidate.cpf)}`)
  }

  if (candidate.email) {
    keys.add(`email:${normalizeEmail(candidate.email)}`)
  }

  if (candidate.name) {
    keys.add(`name:${normalizeString(candidate.name)}`)
  }

  return Array.from(keys).filter((value) => !value.endsWith(':'))
}

function buildPrimaryCandidateKey(candidate: {
  personCode?: string
  cpf?: string
  email?: string
  name?: string
}) {
  return (
    buildCandidateKeys(candidate)[0] ||
    `fallback:${normalizeString(candidate.name || candidate.email || candidate.cpf || crypto.randomUUID())}`
  )
}

function isCalouro(row: MatriculadoRow) {
  return normalizeString(row.tipo_aluno) === 'CALOURO'
}

function isMedicina(row: MatriculadoRow) {
  return normalizeString(row.curso) === 'MEDICINA'
}

function uniqueCountSummary(values: string[]) {
  const counts = new Map<string, number>()

  values.forEach((value) => {
    const label = value || 'Não informado'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .sort((currentValue, nextValue) => nextValue[1] - currentValue[1])
    .slice(0, 8)
}

function parseOpportunityHistory(value: unknown): OpportunityAction[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const row = item as Record<string, unknown>

      return {
        id: String(row.id ?? crypto.randomUUID()),
        date: cleanText(String(row.date ?? '')),
        step: cleanText(String(row.step ?? '')),
        createdAt: cleanText(String(row.createdAt ?? '')),
      }
    })
    .filter((item): item is OpportunityAction => Boolean(item?.step))
}

function parseDelimitedFile(content: string) {
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalizedContent.split('\n').filter((line) => line.trim())

  if (lines.length === 0) {
    return []
  }

  const delimiter =
    (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ';' : ','

  const parseLine = (line: string) => {
    const values: string[] = []
    let currentValue = ''
    let insideQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]

      if (character === '"') {
        if (insideQuotes && line[index + 1] === '"') {
          currentValue += '"'
          index += 1
          continue
        }

        insideQuotes = !insideQuotes
        continue
      }

      if (character === delimiter && !insideQuotes) {
        values.push(currentValue.trim())
        currentValue = ''
        continue
      }

      currentValue += character
    }

    values.push(currentValue.trim())
    return values
  }

  const headers = parseLine(lines[0]).map((header) =>
    normalizeString(header)
      .replace(/\s+/g, ' ')
      .trim(),
  )

  return lines.slice(1).map((line) => {
    const values = parseLine(line)
    const row = new Map<string, string>()

    headers.forEach((header, index) => {
      row.set(header, cleanText(values[index] ?? ''))
    })

    return row
  })
}

async function fetchAllRows<T = Record<string, unknown>>(
  tableName: string,
  orderColumn: string,
  selectClause = '*',
) {
  if (!supabase) {
    return {
      data: null as T[] | null,
      error: new Error('Supabase indisponível.'),
    }
  }

  const pageSize = 1000
  const allRows: T[] = []
  let from = 0

  while (true) {
    const tableClient = supabase.from(tableName as never) as any
    const { data, error } = await tableClient
      .select(selectClause)
      .order(orderColumn, { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) {
      return {
        data: null as T[] | null,
        error,
      }
    }

    const batch = (data as T[] | null) ?? []
    allRows.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    from += pageSize
  }

  return {
    data: allRows,
    error: null,
  }
}

function StageCard({
  label,
  target,
  current,
  reward,
}: {
  label: string
  target: number
  current: number
  reward: number
}) {
  const remaining = Math.max(target - current, 0)
  const hit = current >= target

  return (
    <article
      className={cn(
        'rounded-3xl border p-5 shadow-sm transition',
        hit ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {formatNumberBR(target)}
          </p>
        </div>
        <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
          {formatCurrencyBR(reward)}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>
          Já fez <strong className="text-slate-950">{formatNumberBR(current)}</strong> matrículas.
        </p>
        <p>
          {hit
            ? 'Faixa batida neste mês.'
            : `Faltam ${formatNumberBR(remaining)} para chegar nesta faixa.`}
        </p>
      </div>
    </article>
  )
}

function OpportunityModal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm text-slate-500">
              Preencha os dados e salve para atualizar o painel do vendedor.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

export function PainelVendedor() {
  const { profile } = useProfile()
  const resolvedProfileSeller = resolveSellerFromProfile(profile)
  const canChooseSeller = profile?.role === 'admin' || profile?.role === 'reitoria' || profile?.role === 'captacao'

  const [selectedSeller, setSelectedSeller] = useState<Seller>(
    resolvedProfileSeller ?? sellers[0],
  )
  const [selectedMonth, setSelectedMonth] = useState<GoalMonthKey>(getCurrentGoalMonthKey())
  const [selectedTeamSize, setSelectedTeamSize] = useState<ActiveTeamSize>(
    getDefaultActiveTeamSize(),
  )
  const [leadFilter] = useState<LeadFilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [opportunityTableAvailable, setOpportunityTableAvailable] = useState(true)
  const [registroRows, setRegistroRows] = useState<RegistroRow[]>([])
  const [inscritosRows, setInscritosRows] = useState<InscritoRow[]>([])
  const [matriculadosRows, setMatriculadosRows] = useState<MatriculadoRow[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([])
  const [draggedOpportunityId, setDraggedOpportunityId] = useState<string | null>(null)
  const [manualLeadForm, setManualLeadForm] = useState<ManualLeadFormState>(initialManualLeadForm)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [actionModalTarget, setActionModalTarget] = useState<OpportunityRow | null>(null)
  const [actionDate, setActionDate] = useState('')
  const [actionStep, setActionStep] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (resolvedProfileSeller) {
      setSelectedSeller(resolvedProfileSeller)
    }
  }, [resolvedProfileSeller])

  const loadRows = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de abrir o painel do vendedor.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)

    const [registroResponse, inscritosResponse, matriculadosResponse, opportunitiesResponse] =
      await Promise.all([
        fetchAllRows<RegistroRow>('registro_crm', 'id'),
        fetchAllRows<InscritoRow>('inscritos_20262', 'id', 'cpf, candidato'),
        fetchAllRows<MatriculadoRow>(
          'matriculados_20262',
          'id',
          'id, aluno, cpf, curso, filial, turno, tipo_aluno, tipo_de_ingresso, data_baixa_do_pagamento, vendedor',
        ),
        fetchAllRows<OpportunityRow>(
          'vendedor_oportunidades',
          'updated_at',
          'id, vendedor, nome, curso, forma_ingresso, campus, temperatura, proximo_passo, data_acao, historico, created_at, updated_at',
        ),
      ])

    if (registroResponse.error || inscritosResponse.error || matriculadosResponse.error) {
      setError(
        'Não foi possível carregar CRM, inscritos ou matrículas. Confere se as tabelas e permissões de leitura estão liberadas no Supabase.',
      )
      setLoading(false)
      return
    }

    if (opportunitiesResponse.error) {
      setOpportunityTableAvailable(false)
      setNotice(
        'A tabela vendedor_oportunidades ainda não existe no Supabase. O painel principal já funciona, mas o quadro de oportunidades só libera depois de rodar o SQL novo.',
      )
      setOpportunities([])
    } else {
      setOpportunityTableAvailable(true)
      setOpportunities(
        ((opportunitiesResponse.data ?? []) as OpportunityRow[]).map((row) => ({
          ...row,
          vendedor: normalizeSellerValue(row.vendedor) ?? row.vendedor,
          temperatura: (cleanText(row.temperatura) as OpportunityTemperature) || 'Frio',
          historico: parseOpportunityHistory(row.historico),
        })),
      )
    }

    setRegistroRows(registroResponse.data ?? [])
    setInscritosRows(inscritosResponse.data ?? [])
    setMatriculadosRows(
      ((matriculadosResponse.data ?? []) as MatriculadoRow[]).map((row) => ({
        ...row,
        vendedor: normalizeSellerValue(row.vendedor) ?? row.vendedor ?? null,
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const sellerRegistroRows = useMemo(() => {
    return registroRows.filter((row) => {
      const seller = normalizeSellerValue(
        readField(
          row,
          'Vendedor',
          'Nome do responsável',
          'Nome do responsável2',
          'Nome do responsÃ¡vel',
          'Nome do responsÃ¡vel2',
        ),
      )

      return seller === selectedSeller
    })
  }, [registroRows, selectedSeller])

  const sellerCandidates = useMemo(() => {
    const inscritoKeys = new Set<string>()
    inscritosRows.forEach((row) => {
      buildCandidateKeys({
        cpf: row.cpf ?? '',
        name: row.candidato ?? '',
      }).forEach((key) => inscritoKeys.add(key))
    })

    const matriculadoKeys = new Set<string>()
    matriculadosRows
      .filter((row) => isCalouro(row) && !isMedicina(row))
      .forEach((row) => {
        buildCandidateKeys({
          cpf: row.cpf ?? '',
          name: row.aluno ?? '',
        }).forEach((key) => matriculadoKeys.add(key))
      })

    const map = new Map<string, CandidateSummary>()

    sellerRegistroRows.forEach((row) => {
      const personCode = cleanText(readField(row, 'Identificador da pessoa'))
      const cpf = normalizeCpf(readField(row, 'CPF'))
      const email = normalizeEmail(readField(row, 'E-mail da pessoa'))
      const name = cleanText(readField(row, 'Nome da pessoa'))
      const keys = buildCandidateKeys({ personCode, cpf, email, name })
      const primaryKey = buildPrimaryCandidateKey({ personCode, cpf, email, name })
      const dateCreatedKey =
        toDateKey(String(row['Data da criação'] ?? '')) ||
        toDateKey(String(row['Data da atividade'] ?? ''))

      const currentCandidate = map.get(primaryKey)

      const hasInscrito = keys.some((key) => inscritoKeys.has(key))
      const hasMatriculado = keys.some((key) => matriculadoKeys.has(key))

      const nextCandidate: CandidateSummary = {
        key: primaryKey,
        personCode,
        name: titleize(name),
        cpf,
        email,
        course: normalizeCourse(readField(row, 'Nome - Oferta de curso', 'Curso de interesse')),
        campus: normalizeCampus(
          String(row['Unidade'] ?? ''),
          String(row['Local da oferta'] ?? ''),
          String(row['Unidade de Interesse'] ?? ''),
        ),
        process: normalizeProcess(readField(row, 'Processo seletivo')),
        status: normalizeStatus(readField(row, 'Status', 'Resumo atual', 'Etapa')),
        objection: normalizeObjection(readField(row, 'Objeção', 'ObjeÃ§Ã£o')),
        lossObservation: normalizeLossObservation(
          readField(row, 'Observações da perda', 'ObservaÃ§Ãµes da perda'),
        ),
        latestDateKey:
          !currentCandidate || dateCreatedKey >= currentCandidate.latestDateKey
            ? dateCreatedKey
            : currentCandidate.latestDateKey,
        hasInscrito: currentCandidate?.hasInscrito || hasInscrito,
        hasMatriculado: currentCandidate?.hasMatriculado || hasMatriculado,
      }

      if (!currentCandidate) {
        map.set(primaryKey, nextCandidate)
        return
      }

      if (dateCreatedKey >= currentCandidate.latestDateKey) {
        map.set(primaryKey, nextCandidate)
        return
      }

      map.set(primaryKey, {
        ...currentCandidate,
        hasInscrito: currentCandidate.hasInscrito || hasInscrito,
        hasMatriculado: currentCandidate.hasMatriculado || hasMatriculado,
      })
    })

    return Array.from(map.values())
  }, [inscritosRows, matriculadosRows, sellerRegistroRows])

  const filteredLeadCandidates = useMemo(() => {
    switch (leadFilter) {
      case 'not-converted':
        return sellerCandidates.filter((candidate) => !candidate.hasInscrito && !candidate.hasMatriculado)
      case 'inscritos':
        return sellerCandidates.filter((candidate) => candidate.hasInscrito)
      case 'matriculados':
        return sellerCandidates.filter((candidate) => candidate.hasMatriculado)
      default:
        return sellerCandidates
    }
  }, [leadFilter, sellerCandidates])

  const leadSummary = useMemo(() => {
    const notConverted = sellerCandidates.filter(
      (candidate) => !candidate.hasInscrito && !candidate.hasMatriculado,
    ).length
    const inscritos = sellerCandidates.filter((candidate) => candidate.hasInscrito).length
    const matriculados = sellerCandidates.filter((candidate) => candidate.hasMatriculado).length
    const emAndamento = filteredLeadCandidates.filter(
      (candidate) => candidate.status === 'Em andamento',
    ).length
    const perdido = filteredLeadCandidates.filter((candidate) => candidate.status === 'Perdido').length
    const ganho = filteredLeadCandidates.filter((candidate) => candidate.status === 'Ganho').length

    return {
      total: sellerCandidates.length,
      notConverted,
      inscritos,
      matriculados,
      emAndamento,
      perdido,
      ganho,
      objections: uniqueCountSummary(filteredLeadCandidates.map((candidate) => candidate.objection)),
      lossObservations: uniqueCountSummary(
        filteredLeadCandidates.map((candidate) => candidate.lossObservation),
      ),
    }
  }, [filteredLeadCandidates, sellerCandidates])

  const sellerAllMatriculas = useMemo(() => {
    return matriculadosRows.filter(
      (row) => row.vendedor === selectedSeller && isCalouro(row) && !isMedicina(row),
    )
  }, [matriculadosRows, selectedSeller])

  const sellerMonthMatriculas = useMemo(() => {
    return sellerAllMatriculas.filter((row) =>
      toDateKey(row.data_baixa_do_pagamento).startsWith(`2026-${selectedMonth}`),
    )
  }, [selectedMonth, sellerAllMatriculas])

  const normalStages = useMemo(
    () => buildNormalStages(selectedMonth, selectedTeamSize),
    [selectedMonth, selectedTeamSize],
  )
  const monthResolution = useMemo(
    () => resolveGoalStage(sellerMonthMatriculas.length, normalStages),
    [normalStages, sellerMonthMatriculas.length],
  )
  const monthPayout = useMemo(
    () => buildPayout(sellerMonthMatriculas.length, monthResolution.achieved),
    [monthResolution.achieved, sellerMonthMatriculas.length],
  )

  const sellerOpportunities = useMemo(() => {
    return opportunities
      .filter((row) => normalizeSellerValue(row.vendedor) === selectedSeller)
      .sort((currentValue, nextValue) => nextValue.updated_at.localeCompare(currentValue.updated_at))
  }, [opportunities, selectedSeller])

  const opportunitiesByTemperature = useMemo(() => {
    return {
      Frio: sellerOpportunities.filter((row) => row.temperatura === 'Frio'),
      Morno: sellerOpportunities.filter((row) => row.temperatura === 'Morno'),
      Quente: sellerOpportunities.filter((row) => row.temperatura === 'Quente'),
    }
  }, [sellerOpportunities])

  const handleSaveManualLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !opportunityTableAvailable) {
      setNotice('Rode primeiro o SQL da tabela vendedor_oportunidades para liberar este quadro.')
      return
    }

    setSaving(true)
    setNotice(null)

    const history = manualLeadForm.proximoPasso
      ? [
          {
            id: crypto.randomUUID(),
            date: manualLeadForm.dataAcao,
            step: manualLeadForm.proximoPasso,
            createdAt: new Date().toISOString(),
          },
        ]
      : []

    const payload = {
      vendedor: selectedSeller,
      nome: manualLeadForm.nome.trim(),
      curso: cleanText(manualLeadForm.curso) || null,
      forma_ingresso: cleanText(manualLeadForm.formaIngresso) || null,
      campus: cleanText(manualLeadForm.campus) || null,
      temperatura: manualLeadForm.temperatura,
      proximo_passo: cleanText(manualLeadForm.proximoPasso) || null,
      data_acao: manualLeadForm.dataAcao || null,
      historico: history,
      created_by: profile?.id ?? null,
    }

    const { data, error: insertError } = await supabase
      .from('vendedor_oportunidades')
      .insert(payload)
      .select(
        'id, vendedor, nome, curso, forma_ingresso, campus, temperatura, proximo_passo, data_acao, historico, created_at, updated_at',
      )
      .single()

    if (insertError) {
      setNotice('Não consegui salvar este lead no quadro do vendedor.')
      setSaving(false)
      return
    }

    const nextRow = {
      ...(data as OpportunityRow),
      historico: parseOpportunityHistory((data as OpportunityRow).historico),
    }

    setOpportunities((currentValue) => [nextRow, ...currentValue])
    setManualLeadForm(initialManualLeadForm)
    setManualModalOpen(false)
    setSaving(false)
    setNotice('Lead salvo com sucesso no quadro do vendedor.')
  }

  const handleAddAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !actionModalTarget) {
      return
    }

    const currentHistory = actionModalTarget.historico ?? []
    const nextHistory: OpportunityAction[] = [
      {
        id: crypto.randomUUID(),
        date: actionDate,
        step: actionStep.trim(),
        createdAt: new Date().toISOString(),
      },
      ...currentHistory,
    ]

    setSaving(true)
    setNotice(null)

    const { data, error: updateError } = await supabase
      .from('vendedor_oportunidades')
      .update({
        proximo_passo: actionStep.trim(),
        data_acao: actionDate || null,
        historico: nextHistory,
      })
      .eq('id', actionModalTarget.id)
      .select(
        'id, vendedor, nome, curso, forma_ingresso, campus, temperatura, proximo_passo, data_acao, historico, created_at, updated_at',
      )
      .single()

    if (updateError) {
      setNotice('Não consegui registrar a nova ação deste lead.')
      setSaving(false)
      return
    }

    setOpportunities((currentValue) =>
      currentValue.map((row) =>
        row.id === actionModalTarget.id
          ? {
              ...(data as OpportunityRow),
              historico: parseOpportunityHistory((data as OpportunityRow).historico),
            }
          : row,
      ),
    )
    setActionModalTarget(null)
    setActionDate('')
    setActionStep('')
    setSaving(false)
    setNotice('Nova ação adicionada com sucesso.')
  }

  const handleDropOpportunity = async (temperature: OpportunityTemperature) => {
    if (!supabase || !draggedOpportunityId) {
      return
    }

    const currentOpportunity = opportunities.find((row) => row.id === draggedOpportunityId)

    if (!currentOpportunity || currentOpportunity.temperatura === temperature) {
      setDraggedOpportunityId(null)
      return
    }

    setOpportunities((currentValue) =>
      currentValue.map((row) =>
        row.id === draggedOpportunityId ? { ...row, temperatura: temperature } : row,
      ),
    )

    const { error: updateError } = await supabase
      .from('vendedor_oportunidades')
      .update({ temperatura: temperature })
      .eq('id', draggedOpportunityId)

    if (updateError) {
      setNotice('Não consegui mover este card agora. Tenta novamente.')
      setOpportunities((currentValue) =>
        currentValue.map((row) =>
          row.id === draggedOpportunityId ? currentOpportunity : row,
        ),
      )
    }

    setDraggedOpportunityId(null)
  }

  const handleOpenImport = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()

    if (extension === 'xls' || extension === 'xlsx') {
      setNotice('Por enquanto a importação está pronta para CSV. Se quiser, eu depois encaixo o leitor de Excel também.')
      event.target.value = ''
      return
    }

    const content = await file.text()
    const rows = parseDelimitedFile(content)

    if (rows.length === 0) {
      setNotice('A planilha veio vazia ou sem linhas válidas.')
      event.target.value = ''
      return
    }

    if (!supabase || !opportunityTableAvailable) {
      setNotice('Rode primeiro o SQL da tabela vendedor_oportunidades para liberar as importações.')
      event.target.value = ''
      return
    }

    const payload: OpportunityInsertPayload[] = []

    rows.forEach((row) => {
        const nome = cleanText(row.get('NOME') ?? row.get('CLIENTE') ?? '')

        if (!nome) {
          return
        }

        const curso = cleanText(row.get('CURSO') ?? '')
        const formaIngresso = cleanText(
          row.get('FORMA DE INGRESSO') ?? row.get('FORMA INGRESSO') ?? '',
        )
        const campus = cleanText(row.get('CAMPUS') ?? '')
        const step = cleanText(row.get('PROXIMO PASSO') ?? row.get('PRÓXIMO PASSO') ?? '')
        const date = cleanText(row.get('DATA DA ACAO') ?? row.get('DATA DA AÇÃO') ?? '')
        const rawTemperature = cleanText(
          row.get('TERMOMETRO DA OPORTUNIDADE') ?? row.get('TEMPERATURA') ?? '',
        )

        const temperature =
          rawTemperature.toLowerCase() === 'morno'
            ? 'Morno'
            : rawTemperature.toLowerCase() === 'quente'
              ? 'Quente'
              : 'Frio'

        const history = step
          ? [
              {
                id: crypto.randomUUID(),
                date,
                step,
                createdAt: new Date().toISOString(),
              },
            ]
          : []

        payload.push({
          vendedor: selectedSeller,
          nome,
          curso: curso || null,
          forma_ingresso: formaIngresso || null,
          campus: campus || null,
          temperatura: temperature as OpportunityTemperature,
          proximo_passo: step || null,
          data_acao: toDateKey(date) || date || null,
          historico: history,
          created_by: profile?.id ?? null,
      })
    })

    if (payload.length === 0) {
      setNotice('A planilha não trouxe nenhum lead válido para importar.')
      event.target.value = ''
      return
    }

    setSaving(true)

    const { data, error: importError } = await supabase
      .from('vendedor_oportunidades')
      .insert(payload)
      .select(
        'id, vendedor, nome, curso, forma_ingresso, campus, temperatura, proximo_passo, data_acao, historico, created_at, updated_at',
      )

    if (importError) {
      setNotice('Não consegui importar essa planilha agora.')
      setSaving(false)
      event.target.value = ''
      return
    }

    setOpportunities((currentValue) => [
      ...((data ?? []) as OpportunityRow[]).map((row) => ({
        ...row,
        historico: parseOpportunityHistory(row.historico),
      })),
      ...currentValue,
    ])
    setSaving(false)
    setNotice(`${payload.length} leads importados para ${selectedSeller}.`)
    event.target.value = ''
  }

  const canShowSellerPicker = canChooseSeller

  if (loading) {
    return <Loading message="Montando o painel do vendedor..." />
  }

  if (error) {
    return <EmptyState title="Não foi possível carregar o painel do vendedor" description={error} />
  }

  if (!resolvedProfileSeller && !canShowSellerPicker) {
    return (
      <EmptyState
        title="Seu acesso ainda não está ligado a um vendedor"
        description="Ajuste o nome do perfil no Supabase para Agestone, William, Gustavo ou Jordana para liberar este painel próprio."
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Painel individual
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {canShowSellerPicker ? `Painel do vendedor - ${selectedSeller}` : `Meu painel - ${selectedSeller}`}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              Aqui a gente cruza registros do CRM, inscritos, matrículas e o quadro de oportunidades
              do vendedor em uma visão só.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canShowSellerPicker ? (
              <select
                value={selectedSeller}
                onChange={(event) => setSelectedSeller(event.target.value as Seller)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                {sellers.map((seller) => (
                  <option key={seller} value={seller}>
                    {seller}
                  </option>
                ))}
              </select>
            ) : null}

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

      {notice ? (
        <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          {notice}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Leads com o vendedor"
          value={formatNumberBR(leadSummary.total)}
          helperText="Leitura única dos registros do CRM ligados a este vendedor."
          emphasis="primary"
        />
        <KpiCard
          title="Inscritos"
          value={formatNumberBR(leadSummary.inscritos)}
          helperText="Registros do CRM que batem com a base de inscritos 2026.2."
        />
        <KpiCard
          title="Matrículas do mês"
          value={formatNumberBR(sellerMonthMatriculas.length)}
          helperText="Total do vendedor no mês selecionado, usando somente calouros sem Medicina."
        />
        <KpiCard
          title="Mês selecionado"
          value={monthConfig[selectedMonth].label}
          helperText="O bloco de metas e comissão abaixo segue este recorte mensal."
        />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Meta do mês</h3>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe o mês atual ou troque o recorte para comparar a corrida de metas do vendedor.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Equipe ativa no mês</span>
              <select
                value={selectedTeamSize}
                onChange={(event) => setSelectedTeamSize(Number(event.target.value) as ActiveTeamSize)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
              >
                <option value={2}>02 funcionários</option>
                <option value={3}>03 funcionários</option>
                <option value={4}>04 funcionários</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(monthConfig) as GoalMonthKey[]).map((monthKey) => (
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
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Resumo de {monthConfig[selectedMonth].label}</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
                  {formatNumberBR(sellerMonthMatriculas.length)}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  Matrículas do vendedor no mês selecionado.
                </p>
              </div>

              <div className="rounded-3xl bg-slate-950 px-4 py-3 text-right text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                  Expectativa de ganho
                </p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrencyBR(monthPayout)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Target className="h-4 w-4" />
                  <p className="text-sm font-semibold">Faixa atual</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {monthResolution.achieved?.label ?? 'Ainda não bateu a Meta 01'}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-sm font-semibold">Próxima meta</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {monthResolution.next?.label ?? 'Última faixa já alcançada'}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Wallet className="h-4 w-4" />
                  <p className="text-sm font-semibold">Faltam</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {formatNumberBR(monthResolution.remaining)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {normalStages.map((stage) => (
              <StageCard
                key={stage.label}
                label={stage.label}
                target={stage.target}
                current={sellerMonthMatriculas.length}
                reward={stage.reward}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Quadro de oportunidades</h3>
            <p className="mt-1 text-sm text-slate-500">
              O vendedor acompanha aqui os leads em aberto e o supervisor alimenta a coluna de matrículas
              pela visão de metas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              disabled={!opportunityTableAvailable}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Novo lead
            </button>
            <button
              type="button"
              onClick={handleOpenImport}
              disabled={!opportunityTableAvailable}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              Subir planilha
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xls,.xlsx"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {temperatureColumns.map((column) => (
            <div
              key={column}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void handleDropOpportunity(column)}
              className="min-h-[320px] rounded-[28px] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {column}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {formatNumberBR(opportunitiesByTemperature[column].length)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {opportunitiesByTemperature[column].length > 0 ? (
                  opportunitiesByTemperature[column].map((row) => (
                    <article
                      key={row.id}
                      draggable
                      onDragStart={() => setDraggedOpportunityId(row.id)}
                      className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{titleize(row.nome)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {titleize(row.curso)} - {titleize(row.campus)}
                          </p>
                        </div>
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        <p>
                          <strong className="text-slate-900">Forma de ingresso:</strong>{' '}
                          {titleize(row.forma_ingresso)}
                        </p>
                        <p>
                          <strong className="text-slate-900">Próximo passo:</strong>{' '}
                          {row.proximo_passo || 'Ainda não definido'}
                        </p>
                        <p>
                          <strong className="text-slate-900">Data da ação:</strong>{' '}
                          {formatDateBR(row.data_acao)}
                        </p>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Histórico
                        </p>
                        <div className="mt-3 space-y-2">
                          {(row.historico ?? []).slice(0, 3).map((action) => (
                            <div key={action.id} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-600">
                              <p className="font-semibold text-slate-900">{formatDateBR(action.date)}</p>
                              <p className="mt-1">{action.step}</p>
                            </div>
                          ))}
                          {(row.historico ?? []).length === 0 ? (
                            <p className="text-xs text-slate-500">Nenhuma ação registrada ainda.</p>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActionModalTarget(row)
                          setActionDate('')
                          setActionStep('')
                        }}
                        className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        Nova ação
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Sem oportunidades nesta coluna.
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="min-h-[320px] rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Matriculado
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {formatNumberBR(sellerMonthMatriculas.length)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {sellerMonthMatriculas.length > 0 ? (
                sellerMonthMatriculas.map((row) => (
                  <article
                    key={`matricula-${row.id}`}
                    className="rounded-[24px] border border-emerald-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">{titleize(row.aluno)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {titleize(row.curso)} - {titleize(row.filial)}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Confirmado
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>
                        <strong className="text-slate-900">Ingresso:</strong>{' '}
                        {titleize(row.tipo_de_ingresso)}
                      </p>
                      <p>
                        <strong className="text-slate-900">Baixa:</strong>{' '}
                        {formatDateBR(row.data_baixa_do_pagamento)}
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  Ainda não há matrículas deste vendedor no mês selecionado.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-lg font-semibold text-slate-950">Resumo do quadro</h4>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <KpiCard
                title="Frio"
                value={formatNumberBR(opportunitiesByTemperature.Frio.length)}
                helperText="Oportunidades que ainda precisam ganhar tração."
              />
              <KpiCard
                title="Morno"
                value={formatNumberBR(opportunitiesByTemperature.Morno.length)}
                helperText="Oportunidades já aquecidas para avanço comercial."
              />
              <KpiCard
                title="Quente"
                value={formatNumberBR(opportunitiesByTemperature.Quente.length)}
                helperText="Oportunidades muito próximas de matrícula."
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-lg font-semibold text-slate-950">Corrida de metas</h4>
            <div className="mt-4 space-y-3">
              {normalStages.map((stage) => (
                <div
                  key={`footer-${stage.label}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                    <p className="text-xs text-slate-500">
                      Faltam {formatNumberBR(Math.max(stage.target - sellerMonthMatriculas.length, 0))} matrículas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatNumberBR(sellerMonthMatriculas.length)}/{formatNumberBR(stage.target)}
                    </p>
                    <p className="text-xs text-slate-500">{formatCurrencyBR(stage.reward)} por matrícula</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <OpportunityModal
        open={manualModalOpen}
        title="Novo lead"
        onClose={() => setManualModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSaveManualLead}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Nome</span>
              <input
                type="text"
                value={manualLeadForm.nome}
                onChange={(event) =>
                  setManualLeadForm((currentValue) => ({
                    ...currentValue,
                    nome: event.target.value,
                  }))
                }
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Curso</span>
              <input
                type="text"
                value={manualLeadForm.curso}
                onChange={(event) =>
                  setManualLeadForm((currentValue) => ({
                    ...currentValue,
                    curso: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Forma de ingresso</span>
              <input
                type="text"
                value={manualLeadForm.formaIngresso}
                onChange={(event) =>
                  setManualLeadForm((currentValue) => ({
                    ...currentValue,
                    formaIngresso: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Campus</span>
              <input
                type="text"
                value={manualLeadForm.campus}
                onChange={(event) =>
                  setManualLeadForm((currentValue) => ({
                    ...currentValue,
                    campus: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Termômetro da oportunidade</span>
              <select
                value={manualLeadForm.temperatura}
                onChange={(event) =>
                  setManualLeadForm((currentValue) => ({
                    ...currentValue,
                    temperatura: event.target.value as OpportunityTemperature,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                {temperatureColumns.map((temperature) => (
                  <option key={temperature} value={temperature}>
                    {temperature}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Data da ação</span>
              <input
                type="date"
                value={manualLeadForm.dataAcao}
                onChange={(event) =>
                  setManualLeadForm((currentValue) => ({
                    ...currentValue,
                    dataAcao: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Próximo passo</span>
            <textarea
              value={manualLeadForm.proximoPasso}
              onChange={(event) =>
                setManualLeadForm((currentValue) => ({
                  ...currentValue,
                  proximoPasso: event.target.value,
                }))
              }
              rows={4}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setManualModalOpen(false)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserRound className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </OpportunityModal>

      <OpportunityModal
        open={Boolean(actionModalTarget)}
        title={actionModalTarget ? `Nova ação - ${titleize(actionModalTarget.nome)}` : 'Nova ação'}
        onClose={() => setActionModalTarget(null)}
      >
        <form className="space-y-4" onSubmit={handleAddAction}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Data da ação</span>
              <input
                type="date"
                value={actionDate}
                onChange={(event) => setActionDate(event.target.value)}
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Próximo passo</span>
            <textarea
              value={actionStep}
              onChange={(event) => setActionStep(event.target.value)}
              rows={4}
              required
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setActionModalTarget(null)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarDays className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar ação'}
            </button>
          </div>
        </form>
      </OpportunityModal>
    </div>
  )
}
