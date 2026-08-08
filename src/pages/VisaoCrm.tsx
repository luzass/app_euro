import { Eraser, RefreshCw, Save, UserPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../components/UI/EmptyState'
import { KpiCard } from '../components/UI/KpiCard'
import { Loading } from '../components/UI/Loading'
import { useProfile } from '../hooks/useProfile'
import { formatDateBR, formatNumberBR } from '../lib/formatters'
import { normalizeSellerValue, resolveSellerFromProfile, sellers, type Seller } from '../lib/sellers'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

const MIN_LEAD_DATE = '2026-08-06'
const SUPABASE_BATCH_SIZE = 1000
const observationOptions = [
  'Mensagem bloqueada',
  'Sem interação',
  'Abordagem - coleta de dados',
  'Abordagem - parou interação',
  'Negociação - início',
  'Negociação - aguardando documentação',
  'Negociação - parou interação',
  'Finalização - aguardando aproveitamento',
  'Finalização - aguardando pagamento',
  'Finalização - parou interação',
] as const

type SellerScope = Seller | 'Todos'

type FilterState = {
  startDate: string
  endDate: string
}

type CountDatum = {
  key: string
  label: string
  value: number
}

type ChartFilterKey =
  | 'course'
  | 'ingresso'
  | 'campus'
  | 'matriculadoCourse'
  | 'matriculadoIngresso'
  | 'matriculadoCampus'
  | 'observation'

type ChartSelections = Record<ChartFilterKey, string[]>
type CardTab = 'unassigned' | 'seller'

type GenericRow = Record<string, unknown>

type LeadPrepared = {
  id: number | string
  raw: GenericRow
  seller: Seller | null
  sellerRaw: string
  name: string
  cpf: string
  phone: string
  course: string
  ingresso: string
  campus: string
  observation: string
  createdAtKey: string
  createdAtLabel: string
  inscricaoDate: string
  matriculaDate: string
  matriculadoIngresso: string
  matriculadoCampus: string
  hasInscricao: boolean
  hasMatricula: boolean
}

const initialFilters: FilterState = {
  startDate: MIN_LEAD_DATE,
  endDate: '',
}

const initialChartSelections: ChartSelections = {
  course: [],
  ingresso: [],
  campus: [],
  matriculadoCourse: [],
  matriculadoIngresso: [],
  matriculadoCampus: [],
  observation: [],
}

function decodeMojibake(value?: string | null) {
  const text = String(value ?? '').trim()

  if (!text) {
    return ''
  }

  if (!/[ÃƒÆ’Ãƒâ€š]/.test(text)) {
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

function cleanText(value?: string | null) {
  const normalized = decodeMojibake(value).replace(/\s+/g, ' ').trim()
  return /^-\s*-\s*-$/.test(normalized) ? '' : normalized
}

function normalizeString(value?: string | null) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9@.\s/-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
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

function normalizeCpf(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '')
}

function toDateKey(value?: string | null) {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  const brDateTime = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/)
  if (brDateTime) {
    const [, day, month, year] = brDateTime
    return `${year}-${month}-${day}`
  }

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`
  }

  const parsed = new Date(text)

  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')

  return `${parsed.getFullYear()}-${month}-${day}`
}

function normalizeCampus(value?: string | null) {
  const normalized = normalizeString(value)

  if (normalized.includes('AGUAS CLARAS') || normalized.includes('GUAS CLARAS')) {
    return 'Águas Claras'
  }

  if (normalized.includes('ASA SUL')) {
    return 'Asa Sul'
  }

  return titleize(value)
}

function normalizeCourse(value?: string | null) {
  const text = cleanText(value)
  const normalized = normalizeString(value)

  if (!text) {
    return 'Não informado'
  }

  if (normalized.includes('NUTRICAO')) {
    return 'Nutrição'
  }

  return titleize(text)
}

function normalizeLeadIngresso(value?: string | null) {
  const normalized = normalizeString(value)

  if (!normalized) {
    return 'Não informado'
  }

  if (normalized.includes('PROUNI')) {
    return 'PROUNI'
  }

  if (normalized.includes('VESTIBULAR')) {
    return 'Vestibular'
  }

  if (normalized.includes('ENEM')) {
    return 'ENEM'
  }

  if (normalized.includes('GRADUADO') || normalized.includes('VAGA DE GRADUADO')) {
    return 'Graduado'
  }

  if (normalized.includes('TRANSFER')) {
    return 'Transf. Externa'
  }

  if (normalized.includes('REINGRESSO')) {
    return 'Reingresso'
  }

  if (normalized.includes('READMISSAO')) {
    return 'Readmissão'
  }

  if (normalized.includes('FIES')) {
    return 'FIES'
  }

  if (normalized.includes('EAD')) {
    return 'Ead'
  }

  if (normalized.includes('SEMIPRESENCIAL')) {
    return 'Semipresencial'
  }

  return titleize(value)
}

function normalizeObservation(value?: string | null) {
  return cleanText(value) || 'Sem observação'
}

function countByLabel<T>(
  rows: T[],
  getLabel: (row: T) => string,
  limit = 12,
  excludedLabels: string[] = [],
) {
  const counts = new Map<string, number>()
  const excluded = new Set(excludedLabels)

  rows.forEach((row) => {
    const label = getLabel(row) || 'Não informado'

    if (excluded.has(label)) {
      return
    }

    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([label, value]) => ({
      key: label,
      label,
      value,
    }))
    .sort((currentValue, nextValue) => nextValue.value - currentValue.value)
    .slice(0, limit)
}

function isMultiSelectEvent(event: unknown) {
  if (!event || typeof event !== 'object') {
    return false
  }

  const row = event as { ctrlKey?: boolean; metaKey?: boolean; nativeEvent?: { ctrlKey?: boolean; metaKey?: boolean } }
  return Boolean(
    row.ctrlKey ||
      row.metaKey ||
      row.nativeEvent?.ctrlKey ||
      row.nativeEvent?.metaKey,
  )
}

function renderSmartBarLabel(props: {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string
}) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const numericValue = Number(props.value ?? 0)

  if (!numericValue || height <= 0) {
    return null
  }

  const formattedValue = formatNumberBR(numericValue)
  const estimatedTextWidth = formattedValue.length * 8.5
  const canFitInside = width >= estimatedTextWidth + 18
  const textX = canFitInside ? x + width - 8 : x + width + 8

  return (
    <text
      x={textX}
      y={y + height / 2}
      dy={4}
      textAnchor={canFitInside ? 'end' : 'start'}
      fill={canFitInside ? '#ffffff' : '#0f172a'}
      fontSize={12}
      fontWeight={700}
    >
      {formattedValue}
    </text>
  )
}

async function fetchAllRows(tableName: string, selectClause = '*') {
  if (!supabase) {
    return { data: [] as GenericRow[], error: new Error('Supabase não configurado.') }
  }

  const allRows: GenericRow[] = []
  let start = 0

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectClause)
      .range(start, start + SUPABASE_BATCH_SIZE - 1)

    if (error) {
      return { data: [] as GenericRow[], error }
    }

    const batch = ((data ?? []) as unknown) as GenericRow[]
    allRows.push(...batch)

    if (batch.length < SUPABASE_BATCH_SIZE) {
      break
    }

    start += SUPABASE_BATCH_SIZE
  }

  return { data: allRows, error: null }
}

function buildLeadRow(row: GenericRow): LeadPrepared {
  const id = (row.id as number | string | undefined) ?? crypto.randomUUID()
  const sellerRaw = readField(row, 'vendedor_crm', 'Vendedor CRM')
  const createdAtLabel = readField(row, 'created_at', 'Data da criação', 'Data de criação')
  const inscricaoDate = readField(row, 'data_inscricao', 'Data da Inscrição')
  const matriculaDate = readField(row, 'data_matricula', 'Data da Matricula')

  return {
    id,
    raw: row,
    seller: normalizeSellerValue(sellerRaw),
    sellerRaw,
    name: titleize(
      readField(row, 'nome', 'Nome', 'name', 'Name', 'nome_completo', 'Nome completo'),
    ),
    cpf: normalizeCpf(readField(row, 'cpf', 'CPF')),
    phone: cleanText(
      readField(
        row,
        'telefone',
        'Telefone',
        'phone',
        'Phone',
        'celular',
        'Celular',
        'whatsapp',
        'WhatsApp',
      ),
    ),
    course: normalizeCourse(
      readField(
        row,
        'curso',
        'Curso',
        'curso_interesse',
        'Curso de interesse',
        'nome_curso',
      ),
    ),
    ingresso: normalizeLeadIngresso(
      readField(
        row,
        'forma_de_ingresso',
        'forma_ingresso',
        'Forma de ingresso',
        'Forma de Ingresso',
        'forma_ingresso_inscricao',
        'Forma de Ingresso Inscrição',
      ),
    ),
    campus: normalizeCampus(
      readField(row, 'campus', 'Campus', 'unidade', 'Unidade', 'local', 'Local'),
    ),
    observation: normalizeObservation(
      readField(row, 'observacao_captacao', 'Observação captação'),
    ),
    createdAtKey: toDateKey(createdAtLabel),
    createdAtLabel,
    inscricaoDate,
    matriculaDate,
    matriculadoIngresso: normalizeLeadIngresso(
      readField(row, 'forma_ingresso_matricula', 'Forma de Ingresso Matricula'),
    ),
    matriculadoCampus: normalizeCampus(
      readField(row, 'filial', 'Filial', 'campus', 'Campus', 'unidade', 'Unidade'),
    ),
    hasInscricao: Boolean(inscricaoDate),
    hasMatricula: Boolean(matriculaDate),
  }
}

function applyChartSelections(rows: LeadPrepared[], selections: ChartSelections) {
  return rows.filter((row) => {
    const values: Record<ChartFilterKey, string> = {
      course: row.course,
      ingresso: row.ingresso,
      campus: row.campus,
      matriculadoCourse: row.hasMatricula ? row.course : '__SEM_MATRICULA__',
      matriculadoIngresso: row.hasMatricula ? row.matriculadoIngresso : '__SEM_MATRICULA__',
      matriculadoCampus: row.hasMatricula ? row.matriculadoCampus : '__SEM_MATRICULA__',
      observation: row.observation,
    }

    return (Object.keys(selections) as ChartFilterKey[]).every((key) => {
      const selectedValues = selections[key]

      if (selectedValues.length === 0) {
        return true
      }

      return selectedValues.includes(values[key])
    })
  })
}

function DataFilters({
  filters,
  setFilters,
}: {
  filters: FilterState
  setFilters: Dispatch<SetStateAction<FilterState>>
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold text-slate-950">Filtro por data</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Esta visão considera apenas os leads a partir de{' '}
            <span className="font-medium text-slate-700">{formatDateBR(MIN_LEAD_DATE)}</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFilters(initialFilters)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
        >
          <Eraser className="h-4 w-4" />
          Limpar datas
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Data inicial</label>
          <input
            type="date"
            min={MIN_LEAD_DATE}
            value={filters.startDate}
            onChange={(event) =>
              setFilters((currentValue) => ({
                ...currentValue,
                startDate: event.target.value < MIN_LEAD_DATE ? MIN_LEAD_DATE : event.target.value,
              }))
            }
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-sky-400"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Data final</label>
          <input
            type="date"
            min={MIN_LEAD_DATE}
            value={filters.endDate}
            onChange={(event) =>
              setFilters((currentValue) => ({
                ...currentValue,
                endDate: event.target.value,
              }))
            }
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-sky-400"
          />
        </div>
      </div>
    </section>
  )
}

function ChartCard({
  title,
  description,
  chartKey,
  data,
  selectedValues,
  onSelect,
}: {
  title: string
  description: string
  chartKey: ChartFilterKey
  data: CountDatum[]
  selectedValues: string[]
  onSelect: (chartKey: ChartFilterKey, label: string, append: boolean) => void
}) {
  const chartHeight = Math.max(280, data.length * 46)

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>

      {data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          Nenhum dado encontrado para este recorte.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-2">
          <div style={{ height: chartHeight, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={160}
                  stroke="#64748b"
                  tickLine={false}
                  interval={0}
                />
                <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
                <Bar
                  dataKey="value"
                  radius={[0, 12, 12, 0]}
                  onClick={(dataPoint, _index, event) => {
                    const payload = dataPoint as { payload?: CountDatum }
                    const label = payload.payload?.label

                    if (!label) {
                      return
                    }

                    onSelect(chartKey, label, isMultiSelectEvent(event))
                  }}
                >
                  {data.map((entry) => {
                    const active = selectedValues.includes(entry.label)

                    return (
                      <Cell
                        key={`${chartKey}-${entry.label}`}
                        cursor="pointer"
                        fill={active ? '#020617' : '#0ea5e9'}
                      />
                    )
                  })}
                  <LabelList dataKey="value" content={renderSmartBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}

export function VisaoCrm() {
  const { profile } = useProfile()
  const resolvedProfileSeller = resolveSellerFromProfile(profile)
  const canChooseSeller =
    profile?.role === 'admin' || profile?.role === 'reitoria' || profile?.role === 'captacao_gerente'
  const canEditLeadSeller = profile?.role === 'admin' || profile?.role === 'captacao_gerente'

  const [rows, setRows] = useState<LeadPrepared[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [selectedSeller, setSelectedSeller] = useState<SellerScope>(
    resolvedProfileSeller ?? 'Todos',
  )
  const [chartSelections, setChartSelections] = useState<ChartSelections>(initialChartSelections)
  const [cardTab, setCardTab] = useState<CardTab>('seller')
  const [cardSearch, setCardSearch] = useState('')
  const [savingLeadId, setSavingLeadId] = useState<number | string | null>(null)
  const [observationDrafts, setObservationDrafts] = useState<Record<string, string>>({})
  const [sellerDrafts, setSellerDrafts] = useState<Record<string, Seller>>({})

  useEffect(() => {
    if (resolvedProfileSeller && !canChooseSeller) {
      setSelectedSeller(resolvedProfileSeller)
    }
  }, [canChooseSeller, resolvedProfileSeller])

  const loadRows = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de abrir esta visão.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)

    const { data, error: loadError } = await fetchAllRows('leads_cursos_enriquecidos')

    if (loadError) {
      setError(
        'Não foi possível carregar os leads enriquecidos. Confere se a tabela leads_cursos_enriquecidos está liberada no Supabase.',
      )
      setRows([])
      setLoading(false)
      return
    }

    const preparedRows = (data ?? [])
      .map((row) => buildLeadRow(row))
      .filter((row) => row.createdAtKey >= MIN_LEAD_DATE)

    setRows(preparedRows)
    setObservationDrafts(
      preparedRows.reduce<Record<string, string>>((accumulator, row) => {
        accumulator[String(row.id)] = row.observation === 'Sem observação' ? '' : row.observation
        return accumulator
      }, {}),
    )

    setSellerDrafts(
      preparedRows.reduce<Record<string, Seller>>((accumulator, row) => {
        accumulator[String(row.id)] =
          row.seller ??
          resolvedProfileSeller ??
          (selectedSeller !== 'Todos' ? selectedSeller : sellers[0])
        return accumulator
      }, {}),
    )

    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const sellerScopedRows = useMemo(() => {
    if (selectedSeller === 'Todos') {
      return rows
    }

    return rows.filter((row) => row.seller === selectedSeller || row.seller === null)
  }, [rows, selectedSeller])

  const dateFilteredRows = useMemo(() => {
    const effectiveStartDate = filters.startDate && filters.startDate >= MIN_LEAD_DATE
      ? filters.startDate
      : MIN_LEAD_DATE

    return sellerScopedRows.filter((row) => {
      if (!row.createdAtKey) {
        return false
      }

      const startDatePass = row.createdAtKey >= effectiveStartDate
      const endDatePass = !filters.endDate || row.createdAtKey <= filters.endDate

      return startDatePass && endDatePass
    })
  }, [filters.endDate, filters.startDate, sellerScopedRows])

  const filteredRows = useMemo(
    () => applyChartSelections(dateFilteredRows, chartSelections),
    [chartSelections, dateFilteredRows],
  )

  const kpiCards = useMemo(
    () => [
      {
        title: 'Leads totais',
        value: formatNumberBR(filteredRows.length),
        helperText: 'Todos os leads visíveis no recorte atual.',
        emphasis: 'primary' as const,
      },
      {
        title: 'Leads não se inscreveram',
        value: formatNumberBR(filteredRows.filter((row) => !row.hasInscricao).length),
        helperText: 'Leads ainda sem Data da Inscrição preenchida.',
      },
      {
        title: 'Leads inscritos',
        value: formatNumberBR(filteredRows.filter((row) => row.hasInscricao).length),
        helperText: 'Leads com Data da Inscrição preenchida.',
      },
      {
        title: 'Leads matriculados',
        value: formatNumberBR(filteredRows.filter((row) => row.hasMatricula).length),
        helperText: 'Leads com Data da Matricula preenchida.',
      },
    ],
    [filteredRows],
  )

  const chartData = useMemo(
    () => ({
      course: countByLabel(filteredRows, (row) => row.course, 12, ['Não informado']),
      ingresso: countByLabel(filteredRows, (row) => row.ingresso, 12, ['Não informado']),
      campus: countByLabel(filteredRows, (row) => row.campus, 12, ['Não informado']),
      matriculadoCourse: countByLabel(
        filteredRows.filter((row) => row.hasMatricula),
        (row) => row.course,
        12,
        ['Não informado'],
      ),
      matriculadoIngresso: countByLabel(
        filteredRows.filter((row) => row.hasMatricula),
        (row) => row.matriculadoIngresso,
        12,
        ['Não informado'],
      ),
      matriculadoCampus: countByLabel(
        filteredRows.filter((row) => row.hasMatricula),
        (row) => row.matriculadoCampus,
        12,
        ['Não informado'],
      ),
      observation: countByLabel(filteredRows, (row) => row.observation),
    }),
    [filteredRows],
  )

  const visibleCards = useMemo(
    () => [...filteredRows].sort((currentValue, nextValue) => nextValue.createdAtKey.localeCompare(currentValue.createdAtKey)),
    [filteredRows],
  )

  const unassignedCards = useMemo(
    () => visibleCards.filter((row) => row.seller === null),
    [visibleCards],
  )

  const assignedCards = useMemo(
    () => visibleCards.filter((row) => row.seller !== null),
    [visibleCards],
  )

  const activeCards = cardTab === 'unassigned' ? unassignedCards : assignedCards

  const searchedCards = useMemo(() => {
    const normalizedSearch = normalizeString(cardSearch)

    if (!normalizedSearch) {
      return activeCards
    }

    return activeCards.filter((row) => normalizeString(row.name).includes(normalizedSearch))
  }, [activeCards, cardSearch])

  const sellerTabLabel = useMemo(() => {
    if (selectedSeller !== 'Todos') {
      return `Leads de ${selectedSeller}`
    }

    if (resolvedProfileSeller) {
      return `Leads de ${resolvedProfileSeller}`
    }

    return 'Leads com vendedor'
  }, [resolvedProfileSeller, selectedSeller])

  const handleChartSelect = (chartKey: ChartFilterKey, label: string, append: boolean) => {
    setChartSelections((currentValue) => {
      const currentSelection = currentValue[chartKey]
      const alreadySelected = currentSelection.includes(label)

      if (!append) {
        return {
          ...currentValue,
          [chartKey]: alreadySelected && currentSelection.length === 1 ? [] : [label],
        }
      }

      return {
        ...currentValue,
        [chartKey]: alreadySelected
          ? currentSelection.filter((value) => value !== label)
          : [...currentSelection, label],
      }
    })
  }

  const clearChartSelections = () => {
    setChartSelections(initialChartSelections)
  }

  const handleSaveObservation = async (row: LeadPrepared) => {
    if (!supabase) {
      return
    }

    setSavingLeadId(row.id)
    setNotice(null)

    const observationValue = (observationDrafts[String(row.id)] ?? '').trim() || null

    const { error: saveError } = await supabase.rpc('atualizar_lead_captacao', {
      p_id: Number(row.id),
      p_vendedor_crm: null,
      p_observacao_captacao: observationValue,
    })

    if (saveError) {
      setNotice('Não foi possível salvar a observação deste lead.')
      setSavingLeadId(null)
      return
    }

    setRows((currentValue) =>
      currentValue.map((item) =>
        item.id === row.id
          ? {
              ...item,
              observation: observationValue ? observationValue : 'Sem observação',
            }
          : item,
      ),
    )
    setNotice('Observação salva com sucesso.')
    setSavingLeadId(null)
  }

  const handleAssignLeadToSeller = async (row: LeadPrepared, sellerOverride?: Seller) => {
    if (!supabase) {
      return
    }

    const sellerToAssign =
      sellerOverride ??
      sellerDrafts[String(row.id)] ??
      (selectedSeller !== 'Todos' ? selectedSeller : resolvedProfileSeller)

    if (!sellerToAssign) {
      setNotice('Escolha um vendedor antes de assumir este lead.')
      return
    }

    setSavingLeadId(row.id)
    setNotice(null)

    const { error: saveError } = await supabase.rpc('atualizar_lead_captacao', {
      p_id: Number(row.id),
      p_vendedor_crm: sellerToAssign,
      p_observacao_captacao: null,
    })

    if (saveError) {
      setNotice('Não foi possível atribuir este lead agora.')
      setSavingLeadId(null)
      return
    }

    setRows((currentValue) =>
      currentValue.map((item) =>
        item.id === row.id
          ? {
              ...item,
              seller: sellerToAssign,
              sellerRaw: sellerToAssign,
            }
          : item,
      ),
    )
    setNotice(`Lead atribuído para ${sellerToAssign}.`)
    setSavingLeadId(null)
  }

  if (loading) {
    return <Loading message="Carregando a nova visão de leads..." />
  }

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar a visão de leads"
        description={error}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Leads da captação
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Nova visão de leads
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              Esta leitura usa a tabela{' '}
              <span className="font-medium text-slate-700">leads_cursos_enriquecidos</span>,
              mostrando apenas os leads a partir de {formatDateBR(MIN_LEAD_DATE)}. Cada vendedor
              vê seus leads, e os sem responsável aparecem para todos.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {canChooseSeller ? (
              <select
                value={selectedSeller}
                onChange={(event) => setSelectedSeller(event.target.value as SellerScope)}
                className="h-14 min-w-[220px] rounded-2xl border border-slate-200 bg-white px-4 text-base font-medium text-slate-900 outline-none transition focus:border-sky-400"
              >
                <option value="Todos">Todos os vendedores</option>
                {sellers.map((seller) => (
                  <option key={seller} value={seller}>
                    {seller}
                  </option>
                ))}
              </select>
            ) : resolvedProfileSeller ? (
              <div className="inline-flex h-14 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-900">
                {resolvedProfileSeller}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void loadRows()}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>

        {notice ? (
          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            {notice}
          </div>
        ) : null}
      </section>

      <DataFilters filters={filters} setFilters={setFilters} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <KpiCard
            key={card.title}
            title={card.title}
            value={card.value}
            helperText={card.helperText}
            emphasis={card.emphasis}
          />
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Filtros pelos gráficos</h3>
            <p className="mt-1 text-sm text-slate-500">
              Clique em uma barra para filtrar. Use <strong>Ctrl</strong> ou <strong>Cmd</strong>{' '}
              para acumular mais de uma seleção.
            </p>
          </div>

          <button
            type="button"
            onClick={clearChartSelections}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            <Eraser className="h-4 w-4" />
            Limpar cliques
          </button>
        </div>

        {(Object.keys(chartSelections) as ChartFilterKey[]).some(
          (key) => chartSelections[key].length > 0,
        ) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(chartSelections) as ChartFilterKey[]).flatMap((key) =>
              chartSelections[key].map((value) => (
                <button
                  key={`${key}-${value}`}
                  type="button"
                  onClick={() => handleChartSelect(key, value, true)}
                  className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white"
                >
                  {value}
                </button>
              )),
            )}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Leads x curso"
          description="Distribuição dos leads visíveis por curso."
          chartKey="course"
          data={chartData.course}
          selectedValues={chartSelections.course}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Leads x forma de ingresso"
          description="Leitura da forma de ingresso registrada no lead."
          chartKey="ingresso"
          data={chartData.ingresso}
          selectedValues={chartSelections.ingresso}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Leads x campus"
          description="Distribuição dos leads por campus."
          chartKey="campus"
          data={chartData.campus}
          selectedValues={chartSelections.campus}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Leads x matriculados por curso"
          description="Somente os leads já matriculados."
          chartKey="matriculadoCourse"
          data={chartData.matriculadoCourse}
          selectedValues={chartSelections.matriculadoCourse}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Leads x matriculados por forma de ingresso"
          description="Somente os leads já matriculados."
          chartKey="matriculadoIngresso"
          data={chartData.matriculadoIngresso}
          selectedValues={chartSelections.matriculadoIngresso}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Leads x matriculados por campus"
          description="Somente os leads já matriculados."
          chartKey="matriculadoCampus"
          data={chartData.matriculadoCampus}
          selectedValues={chartSelections.matriculadoCampus}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Leads x observações"
          description="Observações preenchidas pela captação."
          chartKey="observation"
          data={chartData.observation}
          selectedValues={chartSelections.observation}
          onSelect={handleChartSelect}
        />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Cards dos leads</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Os cards abaixo respeitam o mesmo recorte de datas, vendedor e filtros aplicados pelos gráficos.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setCardTab('unassigned')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  cardTab === 'unassigned'
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                Sem vendedor ({formatNumberBR(unassignedCards.length)})
              </button>
              <button
                type="button"
                onClick={() => setCardTab('seller')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  cardTab === 'seller'
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {sellerTabLabel} ({formatNumberBR(assignedCards.length)})
              </button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              <Users className="h-4 w-4" />
              {formatNumberBR(searchedCards.length)} lead(s)
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">Buscar por nome</label>
          <input
            type="text"
            value={cardSearch}
            onChange={(event) => setCardSearch(event.target.value)}
            placeholder="Digite o nome do lead"
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400"
          />
        </div>

        {searchedCards.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="Nenhum lead encontrado"
              description={
                cardTab === 'unassigned'
                  ? 'Nenhum lead sem vendedor apareceu neste recorte. Ajuste as datas ou limpe os filtros dos gráficos.'
                  : 'Nenhum lead com vendedor apareceu neste recorte. Ajuste as datas, o vendedor selecionado ou limpe os filtros dos gráficos.'
              }
            />
          </div>
        ) : (
          <div className="mt-6 max-h-[980px] overflow-y-auto pr-2">
            <div className="grid gap-4 xl:grid-cols-2">
              {searchedCards.map((row) => {
                const isSaving = savingLeadId === row.id
                const draftObservation = observationDrafts[String(row.id)] ?? ''
                const draftSeller =
                  sellerDrafts[String(row.id)] ??
                  resolvedProfileSeller ??
                  (selectedSeller !== 'Todos' ? selectedSeller : sellers[0])
                const showManagerSellerControls = canEditLeadSeller
                const showAssignControls =
                  row.seller === null && cardTab === 'unassigned' && !canEditLeadSeller

                return (
                  <article
                    key={String(row.id)}
                    className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                          Lead
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">
                          {row.name}
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                            {row.course}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                            {row.campus}
                          </span>
                          {row.hasInscricao ? (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                              Inscrito
                            </span>
                          ) : null}
                          {row.hasMatricula ? (
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                              Matriculado
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:max-w-[220px] lg:justify-end">
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
                            row.seller
                              ? 'bg-slate-950 text-white'
                              : 'bg-amber-50 text-amber-700',
                          )}
                        >
                          {row.seller ?? 'Sem vendedor'}
                        </span>

                        {showManagerSellerControls ? (
                          <>
                            <select
                              value={draftSeller}
                              onChange={(event) =>
                                setSellerDrafts((currentValue) => ({
                                  ...currentValue,
                                  [String(row.id)]: event.target.value as Seller,
                                }))
                              }
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none transition focus:border-sky-400"
                            >
                              {sellers.map((seller) => (
                                <option key={seller} value={seller}>
                                  {seller}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleAssignLeadToSeller(row, draftSeller)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Salvar vendedor
                            </button>
                          </>
                        ) : showAssignControls ? (
                          <button
                            type="button"
                            onClick={() => void handleAssignLeadToSeller(row, draftSeller)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Assumir lead
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Telefone
                        </p>
                        <p className="mt-2 break-words text-sm font-medium text-slate-900">
                          {row.phone || 'Não informado'}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Data de entrada
                        </p>
                        <p className="mt-2 break-words text-sm font-medium text-slate-900">
                          {row.createdAtKey ? formatDateBR(row.createdAtKey) : 'Não informada'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
                      <label
                        htmlFor={`observacao-${row.id}`}
                        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                      >
                        Observação
                      </label>
                      <select
                        id={`observacao-${row.id}`}
                        value={draftObservation}
                        onChange={(event) =>
                          setObservationDrafts((currentValue) => ({
                            ...currentValue,
                            [String(row.id)]: event.target.value,
                          }))
                        }
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400"
                      >
                        <option value="">Selecione uma observação</option>
                        {observationOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                          Ingresso: <span className="font-medium text-slate-700">{row.ingresso}</span>
                        </p>

                        <button
                          type="button"
                          onClick={() => void handleSaveObservation(row)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          Salvar
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

