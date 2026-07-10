import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ClipboardList, Eraser, RefreshCw, Users } from 'lucide-react'
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
import { formatDateBR, formatNumberBR } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type Seller = 'Tony' | 'William' | 'Gustavo' | 'Jordana'

type FilterState = {
  startDate: string
  endDate: string
  course: string
  campus: string
  process: string
  status: string
  candidateName: string
}

type CountDatum = {
  key: string
  label: string
  value: number
}

type ChartFilterKey =
  | 'campus'
  | 'process'
  | 'course'
  | 'status'
  | 'activity'
  | 'objection'
  | 'lossObservation'

type ChartSelections = Record<ChartFilterKey, string[]>

type ActivityCrmPrepared = {
  id: number
  schedulingCode: string
  activity: string
  description: string
  courseLabel: string
  processLabel: string
  email: string
  personCode: string
  contactName: string
  cpf: string
  seller: Seller | null
  campusLabel: string
  dateCreatedRaw: string
  dateCreatedKey: string
}

type RegistroCrmPrepared = {
  id: number
  identifier: string
  externalCode: string
  personCode: string
  contactName: string
  seller: Seller | null
  email: string
  cpf: string
  courseLabel: string
  processLabel: string
  campusLabel: string
  statusLabel: string
  objectionLabel: string
  lossObservationLabel: string
  currentSummary: string
  dateCreatedRaw: string
  dateCreatedKey: string
}

type CandidateSummary = {
  key: string
  personCode: string
  contactName: string
  cpf: string
  email: string
  courseLabel: string
  campusLabel: string
  processLabel: string
  statusLabel: string
  objectionLabel: string
  lossObservationLabel: string
  currentSummary: string
  activityCount: number
  activities: string[]
  descriptions: string[]
  hasInscrito: boolean
  hasMatriculado: boolean
  hasRegistro: boolean
  hasActivity: boolean
  latestDateKey: string
}

type InscritoPrepared = {
  cpf: string
  name: string
}

type MatriculadoPrepared = {
  cpf: string
  name: string
}

const sellers: Seller[] = ['Tony', 'William', 'Gustavo', 'Jordana']

const initialFilters: FilterState = {
  startDate: '',
  endDate: '',
  course: '',
  campus: '',
  process: '',
  status: '',
  candidateName: '',
}

const initialChartSelections: ChartSelections = {
  campus: [],
  process: [],
  course: [],
  status: [],
  activity: [],
  objection: [],
  lossObservation: [],
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

function decodeMojibake(value?: string | null) {
  const text = String(value ?? '').trim()

  if (!text) {
    return ''
  }

  if (!/[ÃÂ]/.test(text)) {
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

function titleize(value?: string | null, fallback = 'Não informado') {
  const text = decodeMojibake(value)

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

function cleanText(value?: string | null) {
  const normalized = decodeMojibake(value).replace(/\s+/g, ' ').trim()
  return /^-\s*-\s*-$/.test(normalized) ? '' : normalized
}

function normalizeCpf(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeEmail(value?: string | null) {
  return cleanText(value).toLowerCase()
}

function toDateKey(value?: string | null) {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  const brDateTime = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
  if (brDateTime) {
    const [, day, month, year] = brDateTime
    return `${year}-${month}-${day}`
  }

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`
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

  const normalizedTargets = new Set(
    keys.map((key) => canonicalizeFieldKey(key)).filter(Boolean),
  )

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

function normalizeSeller(value?: string | null): Seller | null {
  const normalized = normalizeString(value)

  if (!normalized) {
    return null
  }

  if (normalized.includes('TONY')) {
    return 'Tony'
  }

  if (
    normalized.includes('WILLIAM') ||
    normalized.includes('WILLAM') ||
    normalized.includes('SIDOU')
  ) {
    return 'William'
  }

  if (normalized.includes('GUSTAVO')) {
    return 'Gustavo'
  }

  if (normalized.includes('JORDANA')) {
    return 'Jordana'
  }

  return null
}

function normalizeCampus(...sources: Array<string | null | undefined>) {
  const combined = normalizeString(sources.map((value) => cleanText(value)).join(' '))

  if (combined.includes('AGUAS CLARAS') || combined.includes('GUAS CLARAS')) {
    return 'Águas Claras'
  }

  if (combined.includes('ASA SUL')) {
    return 'Asa Sul'
  }

  return 'Não informado'
}

function normalizeCourseLabel(value?: string | null) {
  const decoded = cleanText(value)

  if (!decoded) {
    return 'Não informado'
  }

  const firstChunk = decoded
    .split(' - ')
    .map((part) => part.trim())
    .find(Boolean)

  return titleize(firstChunk ?? decoded)
}

function normalizeProcessLabel(value?: string | null) {
  const decoded = cleanText(value)
  const normalized = normalizeString(decoded)

  if (!normalized) {
    return 'Não informado'
  }

  if (
    ((normalized.includes('GRADUACAO') || normalized.includes('GRADUA') || normalized.includes('2A')) &&
      normalized.includes('2')) ||
    normalized.includes('SEGUNDA GRADUACAO')
  ) {
    return '2ª Graduação'
  }

  if (normalized.includes('PROUNI')) {
    return 'PROUNI'
  }

  if (normalized.includes('TRANSFERENCIA EXTERNA') || normalized.includes('TRANSFERENCIA')) {
    return 'Transf. Externa'
  }

  if (normalized.includes('REINGRESSO')) {
    return 'Reingresso'
  }

  if (normalized.includes('ENEM')) {
    return 'ENEM'
  }

  if (normalized.includes('VESTIBULAR')) {
    return 'Vestibular'
  }

  if (normalized.includes('SEMIPRESENCIAL')) {
    return 'Semipresencial'
  }

  if (normalized.includes('EAD')) {
    return 'EAD'
  }

  return titleize(decoded)
}

function normalizeStatusLabel(value?: string | null) {
  const decoded = cleanText(value)
  const normalized = normalizeString(decoded)

  if (!normalized) {
    return 'Não informado'
  }

  if (normalized.includes('PERD')) {
    return 'Perdido'
  }

  if (normalized.includes('GANH')) {
    return 'Ganho'
  }

  return 'Em andamento'
}

function normalizeObjectionLabel(value?: string | null) {
  return titleize(value, 'Não informada')
}

function normalizeLossObservationLabel(value?: string | null) {
  return cleanText(value) || 'Não informada'
}

function buildCountDataFromValues(values: string[]) {
  const map = new Map<string, CountDatum>()

  values.forEach((labelValue) => {
    const label = labelValue || 'Não informado'
    const current = map.get(label) ?? { key: label, label, value: 0 }
    current.value += 1
    map.set(label, current)
  })

  return Array.from(map.values())
    .sort(
      (currentItem, nextItem) =>
        nextItem.value - currentItem.value || currentItem.label.localeCompare(nextItem.label),
    )
    .slice(0, 10)
}

function buildCandidateKeys(candidate: {
  personCode?: string
  cpf?: string
  email?: string
  contactName?: string
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

  if (candidate.contactName) {
    keys.add(`name:${normalizeString(candidate.contactName)}`)
  }

  return Array.from(keys).filter((value) => value && !value.endsWith(':'))
}

function buildPrimaryCandidateKey(candidate: {
  personCode?: string
  cpf?: string
  email?: string
  contactName?: string
}) {
  return (
    buildCandidateKeys(candidate)[0] ||
    `fallback:${normalizeString(candidate.contactName || candidate.email || candidate.cpf || String(Math.random()))}`
  )
}

function wrapAxisLabel(label: string, maxLineLength = 18, maxLines = 3) {
  if (!label) {
    return ['']
  }

  const words = label.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (nextLine.length <= maxLineLength) {
      currentLine = nextLine
      return
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    currentLine = word
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  if (lines.length <= maxLines) {
    return lines
  }

  const visibleLines = lines.slice(0, maxLines)
  const lastLine = visibleLines[maxLines - 1] ?? ''
  visibleLines[maxLines - 1] =
    lastLine.length > maxLineLength - 3
      ? `${lastLine.slice(0, Math.max(maxLineLength - 3, 1)).trim()}...`
      : `${lastLine}...`

  return visibleLines
}

function WrappedYAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value?: string }
}) {
  const lines = wrapAxisLabel(payload?.value ?? '')

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#334155" fontSize={11}>
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function matchesFilterDate(dateKey: string, filters: FilterState) {
  if (filters.startDate && dateKey < filters.startDate) {
    return false
  }

  if (filters.endDate && dateKey > filters.endDate) {
    return false
  }

  return true
}

function applyCandidateFilters(candidate: CandidateSummary, filters: FilterState) {
  if (!matchesFilterDate(candidate.latestDateKey, filters)) {
    return false
  }

  if (filters.course && candidate.courseLabel !== filters.course) {
    return false
  }

  if (filters.campus && candidate.campusLabel !== filters.campus) {
    return false
  }

  if (filters.process && candidate.processLabel !== filters.process) {
    return false
  }

  if (filters.status && candidate.statusLabel !== filters.status) {
    return false
  }

  if (
    filters.candidateName &&
    !normalizeString(candidate.contactName).includes(normalizeString(filters.candidateName))
  ) {
    return false
  }

  return true
}

function hasActiveChartSelections(selections: ChartSelections) {
  return Object.values(selections).some((items) => items.length > 0)
}

function applyChartSelections(candidate: CandidateSummary, selections: ChartSelections) {
  if (selections.campus.length > 0 && !selections.campus.includes(candidate.campusLabel)) {
    return false
  }

  if (selections.process.length > 0 && !selections.process.includes(candidate.processLabel)) {
    return false
  }

  if (selections.course.length > 0 && !selections.course.includes(candidate.courseLabel)) {
    return false
  }

  if (selections.status.length > 0 && !selections.status.includes(candidate.statusLabel)) {
    return false
  }

  if (
    selections.objection.length > 0 &&
    !selections.objection.includes(candidate.objectionLabel)
  ) {
    return false
  }

  if (
    selections.lossObservation.length > 0 &&
    !selections.lossObservation.includes(candidate.lossObservationLabel)
  ) {
    return false
  }

  if (
    selections.activity.length > 0 &&
    !selections.activity.some((activity) => candidate.activities.includes(activity))
  ) {
    return false
  }

  return true
}

async function fetchAllRows(tableName: string, orderColumn: string, selectClause = '*') {
  if (!supabase) {
    return {
      data: null as Record<string, unknown>[] | null,
      error: new Error('Supabase indisponível.'),
    }
  }

  const pageSize = 1000
  const allRows: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const tableClient = supabase.from(tableName as never) as any
    const { data, error } = await tableClient
      .select(selectClause)
      .order(orderColumn, { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) {
      return {
        data: null as Record<string, unknown>[] | null,
        error,
      }
    }

    const batch = (data as Record<string, unknown>[] | null) ?? []
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

function ChartCard({
  title,
  description,
  data,
  chartKey,
  selectedKeys,
  onSelect,
}: {
  title: string
  description: string
  data: CountDatum[]
  chartKey: ChartFilterKey
  selectedKeys: string[]
  onSelect: (chartKey: ChartFilterKey, label: string, accumulate: boolean) => void
}) {
  const chartHeight = Math.max(320, data.length * 58)
  const viewportHeight = 420

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

      {data.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Sem dados para este gráfico no recorte atual.
        </div>
      ) : (
        <div className="mt-6 overflow-y-auto pr-2" style={{ height: viewportHeight }}>
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis type="category" dataKey="label" width={156} tick={<WrappedYAxisTick />} />
                <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
                <Bar
                  dataKey="value"
                  radius={[0, 12, 12, 0]}
                  cursor="pointer"
                  onClick={(entry: CountDatum, _index: number, event: MouseEvent | KeyboardEvent | any) =>
                    onSelect(
                      chartKey,
                      entry?.label ?? '',
                      Boolean(
                        event?.ctrlKey ||
                          event?.metaKey ||
                          event?.nativeEvent?.ctrlKey ||
                          event?.nativeEvent?.metaKey,
                      ),
                    )
                  }
                >
                  {data.map((entry) => {
                    const isActive = selectedKeys.includes(entry.label)
                    const hasSelection = selectedKeys.length > 0

                    return (
                      <Cell
                        key={`${chartKey}-${entry.key}`}
                        fill={isActive ? '#0f172a' : hasSelection ? '#7dd3fc' : '#0ea5e9'}
                      />
                    )
                  })}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                    className="fill-slate-700 text-xs font-semibold"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}

function FilterPanel({
  title,
  description,
  filters,
  setFilters,
  courseOptions,
  campusOptions,
  processOptions,
  statusOptions,
  candidateOptions,
}: {
  title: string
  description: string
  filters: FilterState
  setFilters: Dispatch<SetStateAction<FilterState>>
  courseOptions: string[]
  campusOptions: string[]
  processOptions: string[]
  statusOptions: string[]
  candidateOptions: string[]
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>

        <button
          type="button"
          onClick={() => setFilters(initialFilters)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
        >
          <Eraser className="h-4 w-4" />
          Limpar filtros
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Data inicial</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((currentValue) => ({ ...currentValue, startDate: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Data final</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((currentValue) => ({ ...currentValue, endDate: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Curso</span>
          <select
            value={filters.course}
            onChange={(event) =>
              setFilters((currentValue) => ({ ...currentValue, course: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">Todos</option>
            {courseOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Campus</span>
          <select
            value={filters.campus}
            onChange={(event) =>
              setFilters((currentValue) => ({ ...currentValue, campus: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">Todos</option>
            {campusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Processo seletivo</span>
          <select
            value={filters.process}
            onChange={(event) =>
              setFilters((currentValue) => ({ ...currentValue, process: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">Todos</option>
            {processOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((currentValue) => ({ ...currentValue, status: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">Todos</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 xl:col-span-2">
          <span className="text-sm font-medium text-slate-700">Nome do candidato</span>
          <input
            type="text"
            list={`${title}-candidates`}
            value={filters.candidateName}
            onChange={(event) =>
              setFilters((currentValue) => ({
                ...currentValue,
                candidateName: event.target.value,
              }))
            }
            placeholder="Digite para buscar"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          />
          <datalist id={`${title}-candidates`}>
            {candidateOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
      </div>
    </section>
  )
}

export function VisaoCrm() {
  const [activeSeller, setActiveSeller] = useState<Seller>('Tony')
  const [crmRows, setCrmRows] = useState<ActivityCrmPrepared[]>([])
  const [registroRows, setRegistroRows] = useState<RegistroCrmPrepared[]>([])
  const [inscritosRows, setInscritosRows] = useState<InscritoPrepared[]>([])
  const [matriculadosRows, setMatriculadosRows] = useState<MatriculadoPrepared[]>([])
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [cardFilters, setCardFilters] = useState<FilterState>(initialFilters)
  const [chartSelections, setChartSelections] = useState<ChartSelections>(initialChartSelections)
  const [candidatePage, setCandidatePage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRows = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de carregar a Visão CRM.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [crmResponse, registroResponse, inscritosResponse, matriculadosResponse] =
      await Promise.all([
        fetchAllRows('atividade_crm', 'Data de criação'),
        fetchAllRows('registro_crm', 'Data da criação'),
        fetchAllRows('inscritos_20262', 'data_inscricao', 'cpf, candidato'),
        fetchAllRows('matriculados_20262', 'data_baixa_do_pagamento', 'cpf, aluno'),
      ])

    if (
      crmResponse.error ||
      registroResponse.error ||
      inscritosResponse.error ||
      matriculadosResponse.error
    ) {
      setError(
        'Não foi possível carregar as bases de CRM, registros, inscritos e matriculados. Confira as tabelas e as permissões de leitura no Supabase.',
      )
      setLoading(false)
      return
    }

    const preparedCrmRows = (crmResponse.data ?? []).map((row) => {
      const dateCreatedRaw = readField(row, 'Data de criação', 'Data de criaÃ§Ã£o')
      const courseSource = readField(row, 'Nome - Oferta de curso')
      const localOfferSource = readField(row, 'Nome - Local de oferta')
      const unidadeSource = readField(row, 'Unidade')
      const processSource = readField(row, 'Nome - Processo seletivo')

      return {
        id: Number(row.id ?? 0),
        schedulingCode: cleanText(
          readField(row, 'Código do agendamento', 'CÃ³digo do agendamento'),
        ),
        activity: titleize(readField(row, 'Atividade')),
        description:
          cleanText(readField(row, 'Descrição', 'DescriÃ§Ã£o')) || 'Sem descrição',
        courseLabel: normalizeCourseLabel(courseSource),
        processLabel: normalizeProcessLabel(processSource),
        email: normalizeEmail(readField(row, 'E-mail')),
        personCode: cleanText(readField(row, 'Código da pessoa', 'CÃ³digo da pessoa')),
        contactName: titleize(readField(row, 'Contato')),
        cpf: normalizeCpf(readField(row, 'CPF da pessoa')),
        seller: normalizeSeller(readField(row, 'Responsável', 'ResponsÃ¡vel')),
        campusLabel: normalizeCampus(localOfferSource, unidadeSource, courseSource),
        dateCreatedRaw,
        dateCreatedKey: toDateKey(dateCreatedRaw),
      } satisfies ActivityCrmPrepared
    })

    const preparedRegistroRows = (registroResponse.data ?? []).map((row) => {
      const dateCreatedRaw = readField(row, 'Data da criação', 'Data da criaÃ§Ã£o')
      const courseSource = readField(row, 'Nome - Oferta de curso', 'Curso de interesse')
      const unidadeSource = readField(row, 'Unidade', 'Unidade de Interesse')
      const localOfferSource = readField(row, 'Local da oferta')
      const processSource = readField(row, 'Processo seletivo')
      const sellerSource = readField(
        row,
        'Vendedor',
        'Nome do responsável',
        'Nome do responsável2',
      )

      return {
        id: Number(row.id ?? 0),
        identifier: cleanText(readField(row, 'Identificador')),
        externalCode: cleanText(readField(row, 'Código externo do registro')),
        personCode: cleanText(readField(row, 'Identificador da pessoa')),
        contactName: titleize(readField(row, 'Nome da pessoa')),
        seller: normalizeSeller(sellerSource),
        email: normalizeEmail(readField(row, 'E-mail da pessoa')),
        cpf: normalizeCpf(readField(row, 'CPF')),
        courseLabel: normalizeCourseLabel(courseSource),
        processLabel: normalizeProcessLabel(processSource),
        campusLabel: normalizeCampus(unidadeSource, localOfferSource, courseSource),
        statusLabel: normalizeStatusLabel(
          readField(row, 'Status', 'Status do registro', 'Resumo atual', 'Etapa'),
        ),
        objectionLabel: normalizeObjectionLabel(readField(row, 'Objeção')),
        lossObservationLabel: normalizeLossObservationLabel(readField(row, 'Observações da perda')),
        currentSummary: cleanText(readField(row, 'Resumo atual')) || 'Sem resumo atual',
        dateCreatedRaw,
        dateCreatedKey: toDateKey(dateCreatedRaw),
      } satisfies RegistroCrmPrepared
    })

    setCrmRows(preparedCrmRows)
    setRegistroRows(preparedRegistroRows)
    setInscritosRows(
      (inscritosResponse.data ?? []).map((row) => ({
        cpf: normalizeCpf(readField(row, 'cpf')),
        name: titleize(readField(row, 'candidato')),
      })),
    )
    setMatriculadosRows(
      (matriculadosResponse.data ?? []).map((row) => ({
        cpf: normalizeCpf(readField(row, 'cpf')),
        name: titleize(readField(row, 'aluno')),
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const inscritosCpfSet = useMemo(
    () => new Set(inscritosRows.map((row) => row.cpf).filter(Boolean)),
    [inscritosRows],
  )
  const inscritosNameSet = useMemo(
    () => new Set(inscritosRows.map((row) => normalizeString(row.name)).filter(Boolean)),
    [inscritosRows],
  )
  const matriculadosCpfSet = useMemo(
    () => new Set(matriculadosRows.map((row) => row.cpf).filter(Boolean)),
    [matriculadosRows],
  )
  const matriculadosNameSet = useMemo(
    () => new Set(matriculadosRows.map((row) => normalizeString(row.name)).filter(Boolean)),
    [matriculadosRows],
  )

  const sellerActivityRows = useMemo(
    () => crmRows.filter((row) => row.seller === activeSeller),
    [activeSeller, crmRows],
  )
  const sellerRegistroRows = useMemo(
    () => registroRows.filter((row) => row.seller === activeSeller),
    [activeSeller, registroRows],
  )

  const allCandidates = useMemo(() => {
    const activityIndex = new Map<string, number[]>()

    sellerActivityRows.forEach((row, index) => {
      buildCandidateKeys(row).forEach((key) => {
        const currentItems = activityIndex.get(key) ?? []
        currentItems.push(index)
        activityIndex.set(key, currentItems)
      })
    })

    const referencedActivityIndexes = new Set<number>()
    const candidateMap = new Map<string, CandidateSummary>()

    sellerRegistroRows.forEach((row) => {
      const matchingIndexes = new Set<number>()

      buildCandidateKeys(row).forEach((key) => {
        const currentIndexes = activityIndex.get(key) ?? []
        currentIndexes.forEach((index) => matchingIndexes.add(index))
      })

      const matchingActivities = Array.from(matchingIndexes).map((index) => sellerActivityRows[index])
      matchingIndexes.forEach((index) => referencedActivityIndexes.add(index))

      const activities = Array.from(
        new Set(matchingActivities.map((item) => item.activity).filter(Boolean)),
      )
      const descriptions = Array.from(
        new Set(matchingActivities.map((item) => item.description).filter(Boolean)),
      )

      const latestActivityDate = matchingActivities.reduce(
        (latest, item) => (item.dateCreatedKey > latest ? item.dateCreatedKey : latest),
        '',
      )
      const latestDateKey =
        row.dateCreatedKey > latestActivityDate ? row.dateCreatedKey : latestActivityDate

      const hasInscrito =
        (row.cpf && inscritosCpfSet.has(row.cpf)) ||
        inscritosNameSet.has(normalizeString(row.contactName))
      const hasMatriculado =
        (row.cpf && matriculadosCpfSet.has(row.cpf)) ||
        matriculadosNameSet.has(normalizeString(row.contactName))

      const primaryKey = buildPrimaryCandidateKey({
        personCode: row.personCode,
        cpf: row.cpf,
        email: row.email,
        contactName: row.contactName,
      })

      candidateMap.set(primaryKey, {
        key: primaryKey,
        personCode: row.personCode || 'Não informado',
        contactName: row.contactName || 'Não informado',
        cpf: row.cpf,
        email: row.email,
        courseLabel:
          row.courseLabel !== 'Não informado'
            ? row.courseLabel
            : matchingActivities.find((item) => item.courseLabel !== 'Não informado')?.courseLabel ||
              'Não informado',
        campusLabel:
          row.campusLabel !== 'Não informado'
            ? row.campusLabel
            : matchingActivities.find((item) => item.campusLabel !== 'Não informado')?.campusLabel ||
              'Não informado',
        processLabel:
          row.processLabel !== 'Não informado'
            ? row.processLabel
            : matchingActivities.find((item) => item.processLabel !== 'Não informado')?.processLabel ||
              'Não informado',
        statusLabel: row.statusLabel,
        objectionLabel: row.objectionLabel,
        lossObservationLabel: row.lossObservationLabel,
        currentSummary: row.currentSummary,
        activityCount: matchingActivities.length,
        activities,
        descriptions,
        hasInscrito,
        hasMatriculado,
        hasRegistro: true,
        hasActivity: matchingActivities.length > 0,
        latestDateKey,
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
        contactName: row.contactName,
      })

      const existingCandidate = candidateMap.get(primaryKey)

      if (existingCandidate) {
        return
      }

      const hasInscrito =
        (row.cpf && inscritosCpfSet.has(row.cpf)) ||
        inscritosNameSet.has(normalizeString(row.contactName))
      const hasMatriculado =
        (row.cpf && matriculadosCpfSet.has(row.cpf)) ||
        matriculadosNameSet.has(normalizeString(row.contactName))

      candidateMap.set(primaryKey, {
        key: primaryKey,
        personCode: row.personCode || 'Não informado',
        contactName: row.contactName || 'Não informado',
        cpf: row.cpf,
        email: row.email,
        courseLabel: row.courseLabel,
        campusLabel: row.campusLabel,
        processLabel: row.processLabel,
        statusLabel: 'Não informado',
        objectionLabel: 'Não informada',
        lossObservationLabel: 'Não informada',
        currentSummary: 'Sem resumo atual',
        activityCount: 1,
        activities: row.activity ? [row.activity] : [],
        descriptions: row.description ? [row.description] : [],
        hasInscrito,
        hasMatriculado,
        hasRegistro: false,
        hasActivity: true,
        latestDateKey: row.dateCreatedKey,
      })
    })

    return Array.from(candidateMap.values()).sort((currentItem, nextItem) =>
      currentItem.contactName.localeCompare(nextItem.contactName),
    )
  }, [
    inscritosCpfSet,
    inscritosNameSet,
    matriculadosCpfSet,
    matriculadosNameSet,
    sellerActivityRows,
    sellerRegistroRows,
  ])

  const filterOptions = useMemo(() => {
    const courses = new Set<string>()
    const campuses = new Set<string>()
    const processes = new Set<string>()
    const statuses = new Set<string>()
    const candidates = new Set<string>()

    allCandidates.forEach((candidate) => {
      if (candidate.courseLabel && candidate.courseLabel !== 'Não informado') {
        courses.add(candidate.courseLabel)
      }
      if (candidate.campusLabel && candidate.campusLabel !== 'Não informado') {
        campuses.add(candidate.campusLabel)
      }
      if (candidate.processLabel && candidate.processLabel !== 'Não informado') {
        processes.add(candidate.processLabel)
      }
      if (candidate.statusLabel && candidate.statusLabel !== 'Não informado') {
        statuses.add(candidate.statusLabel)
      }
      if (candidate.contactName && candidate.contactName !== 'Não informado') {
        candidates.add(candidate.contactName)
      }
    })

    return {
      courses: Array.from(courses).sort(),
      campuses: Array.from(campuses).sort(),
      processes: Array.from(processes).sort(),
      statuses: Array.from(statuses).sort(),
      candidates: Array.from(candidates).sort(),
    }
  }, [allCandidates])

  const handleChartSelection = (
    chartKey: ChartFilterKey,
    label: string,
    accumulate: boolean,
  ) => {
    if (!label) {
      return
    }

    setChartSelections((currentValue) => {
      const currentItems = currentValue[chartKey]
      const alreadySelected = currentItems.includes(label)

      if (accumulate) {
        return {
          ...currentValue,
          [chartKey]: alreadySelected
            ? currentItems.filter((item) => item !== label)
            : [...currentItems, label],
        }
      }

      return {
        ...currentValue,
        [chartKey]: alreadySelected && currentItems.length === 1 ? [] : [label],
      }
    })
  }

  const activeChartFilters = useMemo(
    () =>
      [
        ...chartSelections.campus.map((value) => ({
          chartKey: 'campus' as const,
          label: 'Campus',
          value,
        })),
        ...chartSelections.process.map((value) => ({
          chartKey: 'process' as const,
          label: 'Processo',
          value,
        })),
        ...chartSelections.course.map((value) => ({
          chartKey: 'course' as const,
          label: 'Curso',
          value,
        })),
        ...chartSelections.status.map((value) => ({
          chartKey: 'status' as const,
          label: 'Status',
          value,
        })),
        ...chartSelections.activity.map((value) => ({
          chartKey: 'activity' as const,
          label: 'Atividade',
          value,
        })),
        ...chartSelections.objection.map((value) => ({
          chartKey: 'objection' as const,
          label: 'Objeção',
          value,
        })),
        ...chartSelections.lossObservation.map((value) => ({
          chartKey: 'lossObservation' as const,
          label: 'Perda',
          value,
        })),
      ],
    [chartSelections],
  )

  const filteredCandidates = useMemo(
    () =>
      allCandidates
        .filter((candidate) => applyCandidateFilters(candidate, filters))
        .filter((candidate) => applyChartSelections(candidate, chartSelections)),
    [allCandidates, chartSelections, filters],
  )

  const cardCandidateSummaries = useMemo(
    () => allCandidates.filter((candidate) => applyCandidateFilters(candidate, cardFilters)),
    [allCandidates, cardFilters],
  )

  const kpiCards = useMemo(
    () => [
      {
        title: 'Não inscritos e não matriculados',
        value: formatNumberBR(
          filteredCandidates.filter((candidate) => !candidate.hasInscrito && !candidate.hasMatriculado)
            .length,
        ),
        helperText:
          'Candidatos do vendedor sem correspondência nas bases de inscritos e matriculados.',
        emphasis: 'primary' as const,
      },
      {
        title: 'Inscritos',
        value: formatNumberBR(filteredCandidates.filter((candidate) => candidate.hasInscrito).length),
        helperText: 'Candidatos do recorte localizados na tabela de inscritos.',
      },
      {
        title: 'Matriculados',
        value: formatNumberBR(
          filteredCandidates.filter((candidate) => candidate.hasMatriculado).length,
        ),
        helperText: 'Candidatos do recorte localizados na tabela de matriculados.',
      },
      {
        title: 'Em andamento',
        value: formatNumberBR(
          filteredCandidates.filter((candidate) => candidate.statusLabel === 'Em andamento').length,
        ),
        helperText: 'Registros com status em andamento dentro do recorte ativo.',
      },
      {
        title: 'Perdidos',
        value: formatNumberBR(
          filteredCandidates.filter((candidate) => candidate.statusLabel === 'Perdido').length,
        ),
        helperText: 'Registros marcados como perdidos dentro do recorte ativo.',
      },
      {
        title: 'Sem atividade agendada',
        value: formatNumberBR(
          filteredCandidates.filter((candidate) => candidate.hasRegistro && !candidate.hasActivity)
            .length,
        ),
        helperText:
          'Registros presentes em registro_crm que ainda não possuem atividade correspondente.',
      },
      {
        title: 'Atividades agendadas',
        value: formatNumberBR(
          filteredCandidates.reduce(
            (total, candidate) => total + candidate.activityCount,
            0,
          ),
        ),
        helperText: 'Quantidade total de atividades vinculadas aos candidatos do recorte.',
      },
    ],
    [filteredCandidates],
  )

  const charts = useMemo(() => {
    const activityLabels = filteredCandidates.flatMap((candidate) => candidate.activities)

    return {
      campus: buildCountDataFromValues(filteredCandidates.map((candidate) => candidate.campusLabel)),
      process: buildCountDataFromValues(filteredCandidates.map((candidate) => candidate.processLabel)),
      course: buildCountDataFromValues(filteredCandidates.map((candidate) => candidate.courseLabel)),
      status: buildCountDataFromValues(filteredCandidates.map((candidate) => candidate.statusLabel)),
      activity: buildCountDataFromValues(activityLabels),
      objection: buildCountDataFromValues(
        filteredCandidates.map((candidate) => candidate.objectionLabel),
      ),
      lossObservation: buildCountDataFromValues(
        filteredCandidates.map((candidate) => candidate.lossObservationLabel),
      ),
    }
  }, [filteredCandidates])

  const candidatesPerPage = 10
  const candidatePageCount = Math.max(
    1,
    Math.ceil(cardCandidateSummaries.length / candidatesPerPage),
  )
  const paginatedCandidateSummaries = useMemo(() => {
    const startIndex = (candidatePage - 1) * candidatesPerPage
    return cardCandidateSummaries.slice(startIndex, startIndex + candidatesPerPage)
  }, [candidatePage, cardCandidateSummaries])

  useEffect(() => {
    setCandidatePage(1)
  }, [activeSeller, cardFilters])

  useEffect(() => {
    if (candidatePage > candidatePageCount) {
      setCandidatePage(candidatePageCount)
    }
  }, [candidatePage, candidatePageCount])

  if (loading) {
    return <Loading message="Carregando a Visão CRM..." />
  }

  if (error) {
    return <EmptyState title="Não foi possível carregar a Visão CRM" description={error} />
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Operação CRM
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Visão CRM
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              A leitura cruza a base de atividades com a base de registros do CRM usando
              identificador da pessoa, CPF, e-mail e nome como chaves de apoio.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar dados
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {sellers.map((seller) => (
            <button
              key={seller}
              type="button"
              onClick={() => setActiveSeller(seller)}
              className={cn(
                'rounded-2xl border px-4 py-2.5 text-sm font-semibold transition',
                activeSeller === seller
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
              )}
            >
              {seller}
            </button>
          ))}
        </div>
      </section>

      <FilterPanel
        title="Filtros operacionais"
        description="Esses filtros controlam os indicadores e os gráficos do vendedor selecionado."
        filters={filters}
        setFilters={setFilters}
        courseOptions={filterOptions.courses}
        campusOptions={filterOptions.campuses}
        processOptions={filterOptions.processes}
        statusOptions={filterOptions.statuses}
        candidateOptions={filterOptions.candidates}
      />

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
              Clique em uma barra para filtrar. Use <strong>Ctrl</strong> ou{' '}
              <strong>Cmd</strong> para acumular mais de uma seleção.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setChartSelections(initialChartSelections)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            <Eraser className="h-4 w-4" />
            Limpar cliques
          </button>
        </div>

        {hasActiveChartSelections(chartSelections) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeChartFilters.map((filterItem) => (
              <button
                key={`${filterItem.chartKey}-${filterItem.value}`}
                type="button"
                onClick={() =>
                  handleChartSelection(filterItem.chartKey, filterItem.value, true)
                }
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white"
              >
                <span>{filterItem.label}</span>
                <span className="text-white/80">{filterItem.value}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Nenhum filtro visual ativo no momento.
          </p>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Por campus"
          description="Distribuição dos registros por unidade padronizada."
          data={charts.campus}
          chartKey="campus"
          selectedKeys={chartSelections.campus}
          onSelect={handleChartSelection}
        />
        <ChartCard
          title="Por processo seletivo"
          description="Leitura dos registros pelo processo seletivo normalizado."
          data={charts.process}
          chartKey="process"
          selectedKeys={chartSelections.process}
          onSelect={handleChartSelection}
        />
        <ChartCard
          title="Por curso"
          description="Concentração dos registros por curso."
          data={charts.course}
          chartKey="course"
          selectedKeys={chartSelections.course}
          onSelect={handleChartSelection}
        />
        <ChartCard
          title="Por status"
          description="Situação atual dos registros dentro do recorte ativo."
          data={charts.status}
          chartKey="status"
          selectedKeys={chartSelections.status}
          onSelect={handleChartSelection}
        />
        <ChartCard
          title="Qual atividade"
          description="Atividades mais recorrentes entre os candidatos filtrados."
          data={charts.activity}
          chartKey="activity"
          selectedKeys={chartSelections.activity}
          onSelect={handleChartSelection}
        />
        <ChartCard
          title="Objeções"
          description="Principais objeções registradas no CRM."
          data={charts.objection}
          chartKey="objection"
          selectedKeys={chartSelections.objection}
          onSelect={handleChartSelection}
        />
        <ChartCard
          title="Observações da perda"
          description="Motivos e anotações de perda mais recorrentes."
          data={charts.lossObservation}
          chartKey="lossObservation"
          selectedKeys={chartSelections.lossObservation}
          onSelect={handleChartSelection}
        />
      </section>

      <FilterPanel
        title="Cards de candidatos"
        description="Esses filtros controlam apenas os cards abaixo e não alteram os indicadores superiores."
        filters={cardFilters}
        setFilters={setCardFilters}
        courseOptions={filterOptions.courses}
        campusOptions={filterOptions.campuses}
        processOptions={filterOptions.processes}
        statusOptions={filterOptions.statuses}
        candidateOptions={filterOptions.candidates}
      />

      {cardCandidateSummaries.length === 0 ? (
        <EmptyState
          title="Nenhum candidato para os filtros atuais"
          description="Limpe os filtros dos cards ou troque de vendedor para voltar a visualizar os candidatos desta visão."
        />
      ) : (
        <>
          <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Mostrando {formatNumberBR(paginatedCandidateSummaries.length)} de{' '}
                {formatNumberBR(cardCandidateSummaries.length)} candidatos nesta página.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCandidatePage((currentValue) => Math.max(currentValue - 1, 1))}
                  disabled={candidatePage === 1}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Anterior
                </button>

                {Array.from({ length: candidatePageCount }, (_, index) => index + 1)
                  .slice(
                    Math.max(0, candidatePage - 3),
                    Math.max(5, Math.min(candidatePageCount, candidatePage + 2)),
                  )
                  .map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCandidatePage(pageNumber)}
                      className={cn(
                        'rounded-2xl border px-3 py-2 text-sm font-semibold transition',
                        candidatePage === pageNumber
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      )}
                    >
                      {pageNumber}
                    </button>
                  ))}

                <button
                  type="button"
                  onClick={() =>
                    setCandidatePage((currentValue) =>
                      Math.min(currentValue + 1, candidatePageCount),
                    )
                  }
                  disabled={candidatePage === candidatePageCount}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Próxima
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            {paginatedCandidateSummaries.map((candidate) => (
              <article
                key={candidate.key}
                className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                        Candidato
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950">
                        {candidate.contactName}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:max-w-[240px] xl:justify-end">
                      <span className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                        {formatNumberBR(candidate.activityCount)} atividades
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {candidate.statusLabel}
                      </span>
                      {candidate.hasInscrito ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          Inscrito
                        </span>
                      ) : null}
                      {candidate.hasMatriculado ? (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                          Matriculado
                        </span>
                      ) : null}
                      {candidate.hasRegistro && !candidate.hasActivity ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                          Sem atividade
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="min-h-[92px] min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Curso
                      </p>
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                        {candidate.courseLabel}
                      </p>
                    </div>
                    <div className="min-h-[92px] min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Campus
                      </p>
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                        {candidate.campusLabel}
                      </p>
                    </div>
                    <div className="min-h-[92px] min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Processo seletivo
                      </p>
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                        {candidate.processLabel}
                      </p>
                    </div>
                    <div className="min-h-[92px] min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        ?ltima movimenta??o
                      </p>
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                        {formatDateBR(candidate.latestDateKey)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-slate-500" />
                      <p className="text-sm font-semibold text-slate-900">Atividades</p>
                    </div>
                    {candidate.activities.length > 0 ? (
                      <div className="mt-4 flex min-h-[88px] flex-wrap content-start gap-2">
                        {candidate.activities.map((activity) => (
                          <span
                            key={`${candidate.key}-${activity}`}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
                          >
                            {activity}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 min-h-[88px] text-sm leading-6 text-slate-500">
                        Nenhuma atividade agendada para este registro.
                      </p>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <p className="text-sm font-semibold text-slate-900">Resumos e descrições</p>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                      <li className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <strong>Resumo atual:</strong> {candidate.currentSummary}
                      </li>
                      {candidate.descriptions.map((description) => (
                        <li
                          key={`${candidate.key}-${description}`}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                        >
                          {description}
                        </li>
                      ))}
                      {candidate.descriptions.length === 0 ? (
                        <li className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm text-slate-500">
                          Nenhuma descrição registrada nas atividades.
                        </li>
                      ) : null}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Objeção
                    </p>
                    <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-900">
                      {candidate.objectionLabel}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Observações da perda
                    </p>
                    <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-900">
                      {candidate.lossObservationLabel}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
