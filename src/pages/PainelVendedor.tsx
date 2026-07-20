import {
  CalendarDays,
  GripVertical,
  Pencil,
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
  buildProuniStages,
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

type ActivityCrmRow = {
  seller: Seller | null
  personCode: string
  contactName: string
  cpf: string
  email: string
  course: string
  campus: string
  process: string
  status: 'Em andamento'
  objection: string
  lossObservation: string
  latestDateKey: string
}

type InscritoRow = {
  cpf: string | null
  candidato: string | null
  data_inscricao: string | null
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

type OpportunityTemperature = 'Frio' | 'Morno' | 'Quente' | 'Matriculado'

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
  createdDateKey: string
  inscritoDateKeys: string[]
  matriculadoDateKeys: string[]
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

type OpportunityEditFormState = {
  curso: string
  formaIngresso: string
  campus: string
  temperatura: OpportunityTemperature
}

const leadFilterOptions = [
  { key: 'all', label: 'Todos' },
  { key: 'not-converted', label: 'N\u00e3o convertidos' },
  { key: 'inscritos', label: 'Inscritos' },
  { key: 'matriculados', label: 'Matriculados' },
] as const

type LeadFilterKey = (typeof leadFilterOptions)[number]['key']

const temperatureColumns: OpportunityTemperature[] = ['Frio', 'Morno', 'Quente']
const editableOpportunityTemperatures: OpportunityTemperature[] = [
  'Frio',
  'Morno',
  'Quente',
  'Matriculado',
]

const initialManualLeadForm: ManualLeadFormState = {
  nome: '',
  curso: '',
  formaIngresso: '',
  campus: '',
  temperatura: 'Frio',
  proximoPasso: '',
  dataAcao: '',
}

const initialEditOpportunityForm: OpportunityEditFormState = {
  curso: '',
  formaIngresso: '',
  campus: '',
  temperatura: 'Frio',
}

function decodeMojibake(value?: string | null) {
  const text = String(value ?? '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .trim()

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

function titleize(value?: string | null, fallback = 'N\u00e3o informado') {
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

  const isoDateMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const brDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/)
  if (brDateMatch) {
    const [, day, month, year] = brDateMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
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
    return '\u00c1guas Claras'
  }
  if (combined.includes('ASA SUL')) {
    return 'Asa Sul'
  }
  return 'N\u00e3o informado'
}

function normalizeProcess(value?: string | null) {
  const normalized = normalizeString(value)

  if (!normalized) {
    return 'N\u00e3o informado'
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
    return '2\u00aa Gradua\u00e7\u00e3o'
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
  return !text || /^-\s*-\s*-$/.test(text) ? 'N\u00e3o informada' : text
}

function normalizeLossObservation(value?: string | null) {
  const text = cleanText(value)
  return !text || /^-\s*-\s*-$/.test(text) ? 'N\u00e3o informada' : text
}

function normalizeCourse(value?: string | null) {
  const text = cleanText(value)
  if (!text) {
    return 'N\u00e3o informado'
  }
  const normalized = normalizeString(text)
  const compact = normalized.replace(/\s+/g, '')
  if (compact.includes('EDUCA') && (compact.includes('FISICA') || compact.includes('FSICA'))) {
    return 'Educa\u00e7\u00e3o F\u00edsica'
  }
  if (compact.includes('ANALISE') && compact.includes('DESENVOLVIMENTO') && compact.includes('SISTEMAS')) {
    return 'An\u00e1lise E Desenvolvimento De Sistemas'
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

function isProuni(row: MatriculadoRow) {
  return normalizeString(row.tipo_de_ingresso).includes('PROUNI')
}

function uniqueCountSummary(values: string[]) {
  const counts = new Map<string, number>()

  values.forEach((value) => {
    const label = value || 'N\u00e3o informado'
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

function isOpportunityTemperatureConstraintError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const row = error as { message?: string; details?: string; hint?: string }
  const combined = `${row.message ?? ''} ${row.details ?? ''} ${row.hint ?? ''}`.toLowerCase()

  return (
    combined.includes('vendedor_oportunidades') &&
    (combined.includes('temperatura') || combined.includes('check constraint'))
  )
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
      error: new Error('Supabase indispon\u00edvel.'),
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
          {'Já foram realizadas '}
          <strong className="text-slate-950">{formatNumberBR(current)}</strong>
          {' matrículas.'}
        </p>
        <p>
          {hit
            ? 'Faixa batida neste mês.'
            : `Faltam ${formatNumberBR(remaining)} matrículas para atingir esta faixa.`}
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
  const canChooseSeller = profile?.role === 'admin' || profile?.role === 'reitoria' || profile?.role === 'captacao_gerente'

  const [crmRows, setCrmRows] = useState<ActivityCrmRow[]>([])
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
  const [editModalTarget, setEditModalTarget] = useState<OpportunityRow | null>(null)
  const [editOpportunityForm, setEditOpportunityForm] = useState<OpportunityEditFormState>(
    initialEditOpportunityForm,
  )
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

    const [crmResponse, registroResponse, inscritosResponse, matriculadosResponse, opportunitiesResponse] =
      await Promise.all([
        fetchAllRows<Record<string, unknown>>('atividade_crm', 'Data de criação'),
        fetchAllRows<RegistroRow>('registro_crm', 'id'),
        fetchAllRows<InscritoRow>('inscritos_20262', 'id', 'cpf, candidato, data_inscricao'),
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

    if (crmResponse.error || registroResponse.error || inscritosResponse.error || matriculadosResponse.error) {
      setError(
        'N\u00e3o foi poss\u00edvel carregar CRM, inscritos ou matr\u00edculas. Confere se as tabelas e permiss\u00f5es de leitura est\u00e3o liberadas no Supabase.',
      )
      setLoading(false)
      return
    }

    if (opportunitiesResponse.error) {
      setOpportunityTableAvailable(false)
      setNotice(
        'A tabela vendedor_oportunidades ainda n\u00e3o existe no Supabase. O painel principal j\u00e1 funciona, mas o quadro de oportunidades s\u00f3 libera depois de rodar o SQL novo.',
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

    setCrmRows(
      ((crmResponse.data ?? []) as Record<string, unknown>[]).map((row) => ({
        seller: normalizeSellerValue(
          readField(row, 'Responsável', 'Responsavel', 'ResponsÃ¡vel', 'ResponsÃƒÂ¡vel'),
        ),
        personCode: cleanText(
          readField(row, 'Código da pessoa', 'Codigo da pessoa', 'CÃ³digo da pessoa', 'CÃƒÂ³digo da pessoa'),
        ),
        contactName: titleize(readField(row, 'Contato')),
        cpf: normalizeCpf(readField(row, 'CPF da pessoa')),
        email: normalizeEmail(readField(row, 'E-mail')),
        course: normalizeCourse(readField(row, 'Nome - Oferta de curso')),
        campus: normalizeCampus(
          readField(row, 'Nome - Local de oferta'),
          readField(row, 'Unidade'),
          readField(row, 'Nome - Oferta de curso'),
        ),
        process: normalizeProcess(readField(row, 'Nome - Processo seletivo')),
        status: 'Em andamento',
        objection: 'Não informada',
        lossObservation: 'Não informada',
        latestDateKey: toDateKey(
          readField(row, 'Data de criação', 'Data de criacao', 'Data de criaÃ§Ã£o', 'Data de criaÃƒÂ§ÃƒÂ£o'),
        ),
      })),
    )
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
          'Nome do responsÃ¡vel',
          'Nome do responsÃ¡vel2',
          'Nome do responsÃƒÂ¡vel',
          'Nome do responsÃƒÂ¡vel2',
        ),
      )

      return seller === selectedSeller
    })
  }, [registroRows, selectedSeller])

  const sellerActivityRows = useMemo(() => {
    return crmRows.filter((row) => row.seller === selectedSeller)
  }, [crmRows, selectedSeller])

  const sellerCandidates = useMemo(() => {
    const inscritosKeyDates = new Map<string, string[]>()
    inscritosRows.forEach((row) => {
      const dateKey = toDateKey(row.data_inscricao)
      buildCandidateKeys({
        cpf: row.cpf ?? '',
        name: row.candidato ?? '',
      }).forEach((key) => {
        if (!key) {
          return
        }

        const currentItems = inscritosKeyDates.get(key) ?? []
        if (dateKey) {
          currentItems.push(dateKey)
        }
        inscritosKeyDates.set(key, currentItems)
      })
    })

    const matriculadosBaseRows = matriculadosRows.filter((row) => isCalouro(row) && !isMedicina(row))
    const matriculadosKeyDates = new Map<string, string[]>()
    matriculadosBaseRows.forEach((row) => {
      const dateKey = toDateKey(row.data_baixa_do_pagamento)
      buildCandidateKeys({
        cpf: row.cpf ?? '',
        name: row.aluno ?? '',
      }).forEach((key) => {
        if (!key) {
          return
        }

        const currentItems = matriculadosKeyDates.get(key) ?? []
        if (dateKey) {
          currentItems.push(dateKey)
        }
        matriculadosKeyDates.set(key, currentItems)
      })
    })

    const activityIndex = new Map<string, number[]>()

    sellerActivityRows.forEach((row, index) => {
      buildCandidateKeys({
        personCode: row.personCode,
        cpf: row.cpf,
        email: row.email,
        name: row.contactName,
      }).forEach((key) => {
        const currentItems = activityIndex.get(key) ?? []
        currentItems.push(index)
        activityIndex.set(key, currentItems)
      })
    })

    const referencedActivityIndexes = new Set<number>()
    const map = new Map<string, CandidateSummary>()

    sellerRegistroRows.forEach((row) => {
      const personCode = cleanText(readField(row, 'Identificador da pessoa'))
      const cpf = normalizeCpf(readField(row, 'CPF'))
      const email = normalizeEmail(readField(row, 'E-mail da pessoa'))
      const name = titleize(readField(row, 'Nome da pessoa'))
      const primaryKey = buildPrimaryCandidateKey({ personCode, cpf, email, name })
      const rowKeys = buildCandidateKeys({ personCode, cpf, email, name })

      const matchingIndexes = new Set<number>()
      rowKeys.forEach((key) => {
        const indexes = activityIndex.get(key) ?? []
        indexes.forEach((index) => matchingIndexes.add(index))
      })

      const matchingActivities = Array.from(matchingIndexes).map((index) => sellerActivityRows[index])
      matchingIndexes.forEach((index) => referencedActivityIndexes.add(index))

      const dateCreatedKey =
        toDateKey(readField(row, 'Data da criação', 'Data da criacao', 'Data da criaÃ§Ã£o')) ||
        toDateKey(readField(row, 'Data da atividade'))

      const latestActivityDate = matchingActivities.reduce(
        (latest, item) => (item.latestDateKey > latest ? item.latestDateKey : latest),
        '',
      )
      const earliestActivityDate = matchingActivities.reduce(
        (earliest, item) => {
          if (!item.latestDateKey) {
            return earliest
          }

          if (!earliest) {
            return item.latestDateKey
          }

          return item.latestDateKey < earliest ? item.latestDateKey : earliest
        },
        '',
      )
      const createdDateKey = dateCreatedKey || earliestActivityDate
      const latestDateKey = dateCreatedKey > latestActivityDate ? dateCreatedKey : latestActivityDate

      const inscritoDateKeys = Array.from(
        new Set(
          rowKeys.flatMap((key) => inscritosKeyDates.get(key) ?? []).filter(Boolean),
        ),
      )
      const matriculadoDateKeys = Array.from(
        new Set(
          rowKeys.flatMap((key) => matriculadosKeyDates.get(key) ?? []).filter(Boolean),
        ),
      )
      const hasInscrito = inscritoDateKeys.length > 0
      const hasMatriculado = matriculadoDateKeys.length > 0

      map.set(primaryKey, {
        key: primaryKey,
        personCode,
        name: name || 'Não informado',
        cpf,
        email,
        course:
          normalizeCourse(readField(row, 'Nome - Oferta de curso', 'Curso de interesse')) !==
          'Não informado'
            ? normalizeCourse(readField(row, 'Nome - Oferta de curso', 'Curso de interesse'))
            : matchingActivities.find((item) => item.course !== 'Não informado')?.course || 'Não informado',
        campus:
          normalizeCampus(
            readField(row, 'Unidade'),
            readField(row, 'Local da oferta'),
            readField(row, 'Unidade de Interesse'),
          ) !== 'Não informado'
            ? normalizeCampus(
                readField(row, 'Unidade'),
                readField(row, 'Local da oferta'),
                readField(row, 'Unidade de Interesse'),
              )
            : matchingActivities.find((item) => item.campus !== 'Não informado')?.campus || 'Não informado',
        process:
          normalizeProcess(readField(row, 'Processo seletivo')) !== 'Não informado'
            ? normalizeProcess(readField(row, 'Processo seletivo'))
            : matchingActivities.find((item) => item.process !== 'Não informado')?.process || 'Não informado',
        status: normalizeStatus(readField(row, 'Status', 'Status do registro', 'Resumo atual', 'Etapa')),
        objection: normalizeObjection(readField(row, 'Objeção', 'ObjeÃ§Ã£o')),
        lossObservation: normalizeLossObservation(
          readField(row, 'Observações da perda', 'ObservaÃ§Ãµes da perda'),
        ),
        createdDateKey,
        inscritoDateKeys,
        matriculadoDateKeys,
        latestDateKey,
        hasInscrito,
        hasMatriculado,
      })
    })

    sellerActivityRows.forEach((row, index) => {
      if (referencedActivityIndexes.has(index)) {
        return
      }

      const primaryKey = buildPrimaryCandidateKey({
        personCode: row.personCode,
        cpf: row.cpf,
        email: row.email,
        name: row.contactName,
      })

      if (map.has(primaryKey)) {
        return
      }

      const rowKeys = buildCandidateKeys({
        personCode: row.personCode,
        cpf: row.cpf,
        email: row.email,
        name: row.contactName,
      })
      const inscritoDateKeys = Array.from(
        new Set(
          rowKeys.flatMap((key) => inscritosKeyDates.get(key) ?? []).filter(Boolean),
        ),
      )
      const matriculadoDateKeys = Array.from(
        new Set(
          rowKeys.flatMap((key) => matriculadosKeyDates.get(key) ?? []).filter(Boolean),
        ),
      )
      const hasInscrito = inscritoDateKeys.length > 0
      const hasMatriculado = matriculadoDateKeys.length > 0

      map.set(primaryKey, {
        key: primaryKey,
        personCode: row.personCode || 'Não informado',
        name: row.contactName || 'Não informado',
        cpf: row.cpf,
        email: row.email,
        course: row.course,
        campus: row.campus,
        process: row.process,
        status: row.status,
        objection: row.objection,
        lossObservation: row.lossObservation,
        createdDateKey: row.latestDateKey,
        inscritoDateKeys,
        matriculadoDateKeys,
        latestDateKey: row.latestDateKey,
        hasInscrito,
        hasMatriculado,
      })
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [inscritosRows, matriculadosRows, sellerActivityRows, sellerRegistroRows])

  const sellerMonthCandidates = useMemo(() => {
    return sellerCandidates.filter((candidate) =>
      candidate.createdDateKey.startsWith(`2026-${selectedMonth}`),
    )
  }, [selectedMonth, sellerCandidates])

  const sellerMonthInscritos = useMemo(() => {
    return sellerCandidates.filter((candidate) =>
      candidate.inscritoDateKeys.some((dateKey) => dateKey.startsWith(`2026-${selectedMonth}`)),
    )
  }, [selectedMonth, sellerCandidates])

  const filteredLeadCandidates = useMemo(() => {
    switch (leadFilter) {
      case 'not-converted':
        return sellerMonthCandidates.filter(
          (candidate) => !candidate.hasInscrito && !candidate.hasMatriculado,
        )
      case 'inscritos':
        return sellerMonthCandidates.filter((candidate) => candidate.hasInscrito)
      case 'matriculados':
        return sellerMonthCandidates.filter((candidate) => candidate.hasMatriculado)
      default:
        return sellerMonthCandidates
    }
  }, [leadFilter, sellerMonthCandidates])

  const leadSummary = useMemo(() => {
    const notConverted = sellerMonthCandidates.filter(
      (candidate) => !candidate.hasInscrito && !candidate.hasMatriculado,
    ).length
    const inscritos = sellerMonthInscritos.length
    const matriculados = sellerMonthCandidates.filter((candidate) => candidate.hasMatriculado).length
    const emAndamento = filteredLeadCandidates.filter(
      (candidate) => candidate.status === 'Em andamento',
    ).length
    const perdido = filteredLeadCandidates.filter((candidate) => candidate.status === 'Perdido').length
    const ganho = filteredLeadCandidates.filter((candidate) => candidate.status === 'Ganho').length

    return {
      total: sellerMonthCandidates.length,
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
  }, [filteredLeadCandidates, sellerMonthCandidates, sellerMonthInscritos])

  const sellerAllEligibleMatriculas = useMemo(() => {
    return matriculadosRows.filter(
      (row) => row.vendedor === selectedSeller && isCalouro(row) && !isMedicina(row),
    )
  }, [matriculadosRows, selectedSeller])

  const teamAllProuniMatriculas = useMemo(() => {
    return matriculadosRows.filter((row) => isCalouro(row) && !isMedicina(row) && isProuni(row))
  }, [matriculadosRows])

  const sellerOwnProuniMatriculas = useMemo(() => {
    return sellerAllEligibleMatriculas.filter((row) => isProuni(row))
  }, [sellerAllEligibleMatriculas])

  const sellerAllNormalMatriculas = useMemo(() => {
    return sellerAllEligibleMatriculas.filter((row) => !isProuni(row))
  }, [sellerAllEligibleMatriculas])

  const sellerMonthNormalMatriculas = useMemo(() => {
    return sellerAllNormalMatriculas.filter((row) =>
      toDateKey(row.data_baixa_do_pagamento).startsWith(`2026-${selectedMonth}`),
    )
  }, [selectedMonth, sellerAllNormalMatriculas])

  const sellerDisplayedMatriculas = useMemo(() => {
    return [...sellerMonthNormalMatriculas, ...sellerOwnProuniMatriculas].sort((a, b) =>
      toDateKey(b.data_baixa_do_pagamento).localeCompare(toDateKey(a.data_baixa_do_pagamento)),
    )
  }, [sellerOwnProuniMatriculas, sellerMonthNormalMatriculas])

  const normalStages = useMemo(
    () => buildNormalStages(selectedMonth, selectedTeamSize),
    [selectedMonth, selectedTeamSize],
  )
  const prouniStages = useMemo(() => buildProuniStages(), [])
  const monthResolution = useMemo(
    () => resolveGoalStage(sellerMonthNormalMatriculas.length, normalStages),
    [normalStages, sellerMonthNormalMatriculas.length],
  )
  const prouniResolution = useMemo(
    () => resolveGoalStage(teamAllProuniMatriculas.length, prouniStages),
    [prouniStages, teamAllProuniMatriculas.length],
  )
  const monthNormalPayout = useMemo(
    () => buildPayout(sellerMonthNormalMatriculas.length, monthResolution.achieved),
    [monthResolution.achieved, sellerMonthNormalMatriculas.length],
  )
  const prouniPayout = useMemo(
    () => buildPayout(sellerOwnProuniMatriculas.length, prouniResolution.achieved),
    [prouniResolution.achieved, sellerOwnProuniMatriculas.length],
  )
  const totalExpectedPayout = useMemo(
    () => monthNormalPayout + prouniPayout,
    [monthNormalPayout, prouniPayout],
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
      Matriculado: sellerOpportunities.filter((row) => row.temperatura === 'Matriculado'),
    }
  }, [sellerOpportunities])

  const openEditOpportunityModal = (row: OpportunityRow) => {
    setEditModalTarget(row)
    setEditOpportunityForm({
      curso: row.curso ?? '',
      formaIngresso: row.forma_ingresso ?? '',
      campus: row.campus ?? '',
      temperatura: row.temperatura,
    })
  }

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
      setNotice(
        isOpportunityTemperatureConstraintError(insertError)
          ? 'O banco ainda não foi liberado para a coluna Matriculado no quadro. Rode o SQL novo de vendedor_oportunidades e tente novamente.'
          : 'N\u00e3o consegui salvar este lead no quadro do vendedor.',
      )
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
      setNotice('N\u00e3o consegui registrar a nova a\u00e7\u00e3o deste lead.')
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

  const handleSaveOpportunityEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !editModalTarget) {
      return
    }

    setSaving(true)
    setNotice(null)

    const { data, error: updateError } = await supabase
      .from('vendedor_oportunidades')
      .update({
        curso: cleanText(editOpportunityForm.curso) || null,
        forma_ingresso: cleanText(editOpportunityForm.formaIngresso) || null,
        campus: cleanText(editOpportunityForm.campus) || null,
        temperatura: editOpportunityForm.temperatura,
      })
      .eq('id', editModalTarget.id)
      .select(
        'id, vendedor, nome, curso, forma_ingresso, campus, temperatura, proximo_passo, data_acao, historico, created_at, updated_at',
      )
      .single()

    if (updateError) {
      setNotice(
        isOpportunityTemperatureConstraintError(updateError)
          ? 'O banco ainda não foi liberado para a coluna Matriculado no quadro. Rode o SQL novo de vendedor_oportunidades e tente novamente.'
          : 'Não consegui salvar as alterações deste lead agora.',
      )
      setSaving(false)
      return
    }

    setOpportunities((currentValue) =>
      currentValue.map((row) =>
        row.id === editModalTarget.id
          ? {
              ...(data as OpportunityRow),
              historico: parseOpportunityHistory((data as OpportunityRow).historico),
            }
          : row,
      ),
    )
    setEditModalTarget(null)
    setEditOpportunityForm(initialEditOpportunityForm)
    setSaving(false)
    setNotice('Lead atualizado com sucesso.')
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
      setNotice(
        isOpportunityTemperatureConstraintError(updateError)
          ? 'O banco ainda não foi liberado para a coluna Matriculado no quadro. Rode o SQL novo de vendedor_oportunidades e tente novamente.'
          : 'N\u00e3o consegui mover este card agora. Tenta novamente.',
      )
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
      setNotice('Por enquanto a importa\u00e7\u00e3o est\u00e1 pronta para CSV. Se quiser, eu depois encaixo o leitor de Excel tamb\u00e9m.')
      event.target.value = ''
      return
    }

    const content = await file.text()
    const rows = parseDelimitedFile(content)

    if (rows.length === 0) {
      setNotice('A planilha veio vazia ou sem linhas v\u00e1lidas.')
      event.target.value = ''
      return
    }

    if (!supabase || !opportunityTableAvailable) {
      setNotice('Rode primeiro o SQL da tabela vendedor_oportunidades para liberar as importa\u00e7\u00f5es.')
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
        const step = cleanText(row.get('PROXIMO PASSO') ?? row.get('PR\u00d3XIMO PASSO') ?? '')
        const date = cleanText(row.get('DATA DA ACAO') ?? row.get('DATA DA A\u00c7\u00c3O') ?? '')
        const rawTemperature = cleanText(
          row.get('TERMOMETRO DA OPORTUNIDADE') ?? row.get('TEMPERATURA') ?? '',
        )

        const temperature =
          rawTemperature.toLowerCase() === 'matriculado'
            ? 'Matriculado'
            : rawTemperature.toLowerCase() === 'morno'
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
      setNotice('A planilha n\u00e3o trouxe nenhum lead v\u00e1lido para importar.')
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
      setNotice('N\u00e3o consegui importar essa planilha agora.')
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
    return <EmptyState title="N\u00e3o foi poss\u00edvel carregar o painel do vendedor" description={error} />
  }

  if (!resolvedProfileSeller && !canShowSellerPicker) {
    return (
      <EmptyState
        title="Seu acesso ainda n\u00e3o est\u00e1 ligado a um vendedor"
        description="Ajuste o nome do perfil no Supabase para Agestone, William, Gustavo ou Jordana para liberar este painel pr\u00f3prio."
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              {'Visão individual'}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {canShowSellerPicker ? `Painel do vendedor - ${selectedSeller}` : `Meu painel - ${selectedSeller}`}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              {'Aqui cruzamos os registros do CRM, os inscritos, as matrículas e o quadro de oportunidades do vendedor em uma única visão.'}
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

      <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Mês selecionado
        </p>
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-3xl font-semibold tracking-tight text-slate-950">
              {monthConfig[selectedMonth].label}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              O bloco de metas e comissão abaixo segue este recorte mensal.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Leads do vendedor"
          value={formatNumberBR(leadSummary.total)}
          helperText={'Leitura consolidada dos registros do CRM vinculados a este vendedor.'}
          emphasis="primary"
        />
        <KpiCard
          title="Inscritos"
          value={formatNumberBR(leadSummary.inscritos)}
          helperText={'Registros do CRM com correspondência na base de inscritos de 2026.2.'}
        />
        <KpiCard
          title={'Matrículas normais do mês'}
          value={formatNumberBR(sellerMonthNormalMatriculas.length)}
          helperText={'Contagem mensal das matrículas normais do vendedor, considerando apenas calouros e excluindo Medicina.'}
        />
        <KpiCard
          title={'PROUNI da equipe'}
          value={formatNumberBR(teamAllProuniMatriculas.length)}
          helperText={'A meta PROUNI é da equipe inteira, sem recorte mensal, seguindo a mesma lógica da visão de metas.'}
        />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{'Meta do mês'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {'Acompanhe o mês atual ou altere o recorte para comparar o desempenho do vendedor.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">{'Equipe ativa no mês'}</span>
              <select
                value={selectedTeamSize}
                onChange={(event) => setSelectedTeamSize(Number(event.target.value) as ActiveTeamSize)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400"
              >
                <option value={2}>{'02 funcionários'}</option>
                <option value={3}>{'03 funcionários'}</option>
                <option value={4}>{'04 funcionários'}</option>
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
                  {formatNumberBR(sellerMonthNormalMatriculas.length)}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  {'Matrículas normais do vendedor no mês selecionado.'}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {`Suas matrículas PROUNI: ${formatNumberBR(sellerOwnProuniMatriculas.length)} • PROUNI da equipe: ${formatNumberBR(teamAllProuniMatriculas.length)}.`}
                </p>
              </div>

              <div className="rounded-3xl bg-slate-950 px-4 py-3 text-right text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                  Expectativa de ganho
                </p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrencyBR(totalExpectedPayout)}</p>
                <p className="mt-2 text-xs text-white/70">
                  {`Normal: ${formatCurrencyBR(monthNormalPayout)} • PROUNI: ${formatCurrencyBR(prouniPayout)}`}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Target className="h-4 w-4" />
                  <p className="text-sm font-semibold">Faixa normal</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {monthResolution.achieved?.label ?? 'Ainda não atingiu a Meta 01'}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-sm font-semibold">{'Faixa PROUNI'}</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {prouniResolution.achieved?.label ?? 'Ainda não atingiu a Meta 01'}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Wallet className="h-4 w-4" />
                  <p className="text-sm font-semibold">Faltam no normal</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {formatNumberBR(monthResolution.remaining)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {normalStages.map((stage) => (
                <StageCard
                  key={stage.label}
                  label={stage.label}
                  target={stage.target}
                  current={sellerMonthNormalMatriculas.length}
                  reward={stage.reward}
                />
              ))}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Faixas PROUNI</p>
                  <p className="mt-1 text-xs text-slate-500">
                    A meta PROUNI é da equipe inteira, sem divisão por vendedor e sem recorte mensal.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {formatNumberBR(teamAllProuniMatriculas.length)} PROUNI na equipe
                </span>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                {prouniStages.map((stage) => (
                  <StageCard
                    key={`prouni-${stage.label}`}
                    label={`${stage.label} · PROUNI`}
                    target={stage.target}
                    current={teamAllProuniMatriculas.length}
                    reward={stage.reward}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Quadro de oportunidades</h3>
            <p className="mt-1 text-sm text-slate-500">
              {'O vendedor acompanha aqui os leads em aberto, enquanto o supervisor alimenta a coluna de matrículas por meio da visão de metas.'}
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
              className="flex h-[420px] min-h-[320px] flex-col rounded-[28px] border border-slate-200 bg-slate-50 p-4 lg:h-[720px]"
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

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
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

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditOpportunityModal(row)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar lead
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionModalTarget(row)
                            setActionDate('')
                            setActionStep('')
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                          Nova ação
                        </button>
                      </div>
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

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void handleDropOpportunity('Matriculado')}
            className="flex h-[420px] min-h-[320px] flex-col rounded-[28px] border border-slate-200 bg-slate-50 p-4 lg:h-[720px]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {'Matriculados'}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {formatNumberBR(
                    sellerDisplayedMatriculas.length + opportunitiesByTemperature.Matriculado.length,
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {`${formatNumberBR(opportunitiesByTemperature.Matriculado.length)} lead(s) marcados no quadro + ${formatNumberBR(sellerDisplayedMatriculas.length)} matrícula(s) confirmada(s)`}
                </p>
              </div>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
              {opportunitiesByTemperature.Matriculado.length > 0 || sellerDisplayedMatriculas.length > 0 ? (
                <>
                  {opportunitiesByTemperature.Matriculado.length > 0 ? (
                    <>
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Marcados no quadro
                      </p>
                      {opportunitiesByTemperature.Matriculado.map((row) => (
                        <article
                          key={row.id}
                          draggable
                          onDragStart={() => setDraggedOpportunityId(row.id)}
                          className="rounded-[24px] border border-sky-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-950">{titleize(row.nome)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {titleize(row.curso)} - {titleize(row.campus)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                No quadro
                              </span>
                              <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                            </div>
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

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEditOpportunityModal(row)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar lead
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActionModalTarget(row)
                                setActionDate('')
                                setActionStep('')
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                            >
                              <CalendarDays className="h-3.5 w-3.5" />
                              Nova ação
                            </button>
                          </div>
                        </article>
                      ))}
                    </>
                  ) : null}

                  {sellerDisplayedMatriculas.length > 0 ? (
                    <>
                      <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Confirmados na base
                      </p>
                      {sellerDisplayedMatriculas.map((row) => (
                        <article
                          key={`matricula-${row.id}`}
                          className="rounded-[24px] border border-emerald-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-950">{titleize(row.aluno)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {normalizeCourse(row.curso)} - {normalizeCampus(row.filial)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                Confirmado
                              </span>
                              {isProuni(row) ? (
                                <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                  PROUNI
                                </span>
                              ) : null}
                            </div>
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
                      ))}
                    </>
                  ) : null}
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  {'Ainda não há leads marcados como matriculados nem matrículas confirmadas para este vendedor.'}
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
                helperText={'Oportunidades que ainda precisam evoluir.'}
              />
              <KpiCard
                title="Morno"
                value={formatNumberBR(opportunitiesByTemperature.Morno.length)}
                helperText={'Oportunidades já aquecidas para avanço comercial.'}
              />
              <KpiCard
                title="Quente"
                value={formatNumberBR(opportunitiesByTemperature.Quente.length)}
                helperText={'Oportunidades com maior chance de matrícula.'}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-lg font-semibold text-slate-950">Corrida de metas normais</h4>
            <div className="mt-4 space-y-3">
              {normalStages.map((stage) => (
                <div
                  key={`footer-${stage.label}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                    <p className="text-xs text-slate-500">
                      {'Faltam '}
                      {formatNumberBR(Math.max(stage.target - sellerMonthNormalMatriculas.length, 0))}
                      {' matrículas'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatNumberBR(sellerMonthNormalMatriculas.length)}/{formatNumberBR(stage.target)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCurrencyBR(stage.reward)}
                      {' por matrícula'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Faixa PROUNI atual</p>
              <p className="mt-1 text-xs text-slate-500">
                {prouniResolution.achieved?.label ?? 'Ainda não atingiu a Meta 01'} •{' '}
                {formatNumberBR(teamAllProuniMatriculas.length)} /{' '}
                {formatNumberBR(prouniResolution.next?.target ?? teamAllProuniMatriculas.length)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {`Você tem ${formatNumberBR(sellerOwnProuniMatriculas.length)} matrícula(s) PROUNI nesse acumulado da equipe.`}
              </p>
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
                {editableOpportunityTemperatures.map((temperature) => (
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

      <OpportunityModal
        open={Boolean(editModalTarget)}
        title={editModalTarget ? `Editar lead - ${titleize(editModalTarget.nome)}` : 'Editar lead'}
        onClose={() => {
          setEditModalTarget(null)
          setEditOpportunityForm(initialEditOpportunityForm)
        }}
      >
        <form className="space-y-4" onSubmit={handleSaveOpportunityEdit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Curso</span>
              <input
                type="text"
                value={editOpportunityForm.curso}
                onChange={(event) =>
                  setEditOpportunityForm((currentValue) => ({
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
                value={editOpportunityForm.formaIngresso}
                onChange={(event) =>
                  setEditOpportunityForm((currentValue) => ({
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
                value={editOpportunityForm.campus}
                onChange={(event) =>
                  setEditOpportunityForm((currentValue) => ({
                    ...currentValue,
                    campus: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Coluna do quadro</span>
              <select
                value={editOpportunityForm.temperatura}
                onChange={(event) =>
                  setEditOpportunityForm((currentValue) => ({
                    ...currentValue,
                    temperatura: event.target.value as OpportunityTemperature,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              >
                {editableOpportunityTemperatures.map((temperature) => (
                  <option key={`edit-${temperature}`} value={temperature}>
                    {temperature}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditModalTarget(null)
                setEditOpportunityForm(initialEditOpportunityForm)
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Pencil className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </OpportunityModal>
    </div>
  )
}

