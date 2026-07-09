import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Eraser, RefreshCw, Users } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  candidateName: string
}

type CountDatum = {
  key: string
  label: string
  value: number
}

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

type CandidateSummary = {
  key: string
  personCode: string
  contactName: string
  cpf: string
  email: string
  courseLabel: string
  campusLabel: string
  processLabel: string
  activityCount: number
  activities: string[]
  descriptions: string[]
  hasInscrito: boolean
  hasMatriculado: boolean
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
  candidateName: '',
}

function normalizeString(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/�/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function buildMatchString(value?: string | null) {
  return decodeMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/�/g, ' ')
    .replace(/[^A-Z0-9.]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function cleanEmptyValue(value?: string | null) {
  const normalized = normalizeString(value)

  if (!normalized || normalized === '- - -' || normalized === '--' || normalized === '-') {
    return ''
  }

  return (value ?? '').trim()
}

function decodeMojibake(value?: string | null) {
  const text = cleanEmptyValue(value)

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

function titleize(value?: string | null) {
  const text = decodeMojibake(value)

  if (!text) {
    return 'Nao informado'
  }

  return text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeCpf(value?: string | null) {
  return (value ?? '').replace(/\D/g, '')
}

function normalizeEmail(value?: string | null) {
  return cleanEmptyValue(value).toLowerCase()
}

function toDateKey(value?: string | null) {
  const text = cleanEmptyValue(value)

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

function readField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null) {
      return String(value)
    }
  }

  return ''
}

function normalizeSeller(value?: string | null): Seller | null {
  const normalized = normalizeString(decodeMojibake(value))

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
  const combined = buildMatchString(sources.map((value) => decodeMojibake(value)).join(' '))

  if (combined.includes('AGUAS CLARAS') || combined.includes('GUAS CLARAS')) {
    return 'Águas Claras'
  }

  if (combined.includes('ASA SUL')) {
    return 'Asa Sul'
  }

  return 'Nao informado'
}

function normalizeCourseLabel(value?: string | null) {
  const decoded = decodeMojibake(value)
  if (!decoded) {
    return 'Nao informado'
  }

  const firstChunk = decoded
    .split(' - ')
    .map((part) => part.trim())
    .find(Boolean)

  return titleize(firstChunk ?? decoded)
}

function normalizeProcessLabel(value?: string | null) {
  const decoded = decodeMojibake(value)
  const normalized = buildMatchString(decoded)

  if (!normalized) {
    return 'Nao informado'
  }

  const campus = normalizeCampus(decoded)
  const semester = normalized.includes('2026.2')
    ? '2026.2'
    : normalized.includes('2026.1')
      ? '2026.1'
      : normalized.includes('2025.2')
        ? '2025.2'
        : ''

  let base = titleize(decoded)

  if (
    (normalized.includes('GRADUACAO') || normalized.includes('GRADU') || normalized.includes('2A')) &&
    normalized.includes('2')
  ) {
    base = '2a Graduacao'
  } else if (normalized.includes('VESTIBULAR DIGITAL')) {
    base = 'Vestibular Digital'
  } else if (normalized.includes('NOTA ENEM')) {
    base = 'Nota ENEM'
  } else if (normalized.includes('TRANSFERENCIA EXTERNA') || normalized.includes('TRANSFERENCIA')) {
    base = 'Transferencia Externa'
  } else if (normalized.includes('REINGRESSO')) {
    base = 'Reingresso'
  } else if (normalized.includes('SEMIPRESENCIAIS') || normalized.includes('SEMIPRESENCIAL')) {
    base = 'Semipresencial'
  }

  return [base, campus !== 'Nao informado' ? campus : '', semester].filter(Boolean).join(' - ')
}

function buildCountData(rows: ActivityCrmPrepared[], getValue: (row: ActivityCrmPrepared) => string) {
  const map = new Map<string, CountDatum>()

  rows.forEach((row) => {
    const label = getValue(row) || 'Nao informado'
    const current = map.get(label) ?? { key: label, label, value: 0 }
    current.value += 1
    map.set(label, current)
  })

  return Array.from(map.values())
    .sort((currentItem, nextItem) => nextItem.value - currentItem.value || currentItem.label.localeCompare(nextItem.label))
    .slice(0, 10)
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

function applyFilters(row: ActivityCrmPrepared, filters: FilterState) {
  if (filters.startDate && row.dateCreatedKey < filters.startDate) {
    return false
  }

  if (filters.endDate && row.dateCreatedKey > filters.endDate) {
    return false
  }

  if (filters.course && row.courseLabel !== filters.course) {
    return false
  }

  if (filters.campus && row.campusLabel !== filters.campus) {
    return false
  }

  if (filters.process && row.processLabel !== filters.process) {
    return false
  }

  if (
    filters.candidateName &&
    !normalizeString(row.contactName).includes(normalizeString(filters.candidateName))
  ) {
    return false
  }

  return true
}

function buildCandidateKey(row: ActivityCrmPrepared) {
  return row.personCode || row.cpf || row.email || normalizeString(row.contactName)
}

function findFirstFilled(values: string[]) {
  return values.find((value) => value && value !== 'Nao informado') ?? 'Nao informado'
}

async function fetchAllRows(tableName: string, orderColumn: string, selectClause = '*') {
  if (!supabase) {
    return {
      data: null as Record<string, unknown>[] | null,
      error: new Error('Supabase indisponivel.'),
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
}: {
  title: string
  description: string
  data: CountDatum[]
}) {
  const chartHeight = Math.max(300, data.length * 58)

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

      {data.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Sem dados para este grafico no recorte atual.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 20, left: 12, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={156}
                tick={<WrappedYAxisTick />}
              />
              <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 12, 12, 0]}>
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
  candidateOptions,
}: {
  title: string
  description: string
  filters: FilterState
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
  courseOptions: string[]
  campusOptions: string[]
  processOptions: string[]
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

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  const [inscritosRows, setInscritosRows] = useState<InscritoPrepared[]>([])
  const [matriculadosRows, setMatriculadosRows] = useState<MatriculadoPrepared[]>([])
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [cardFilters, setCardFilters] = useState<FilterState>(initialFilters)
  const [candidatePage, setCandidatePage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRows = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de carregar a Visao CRM.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [crmResponse, inscritosResponse, matriculadosResponse] = await Promise.all([
      fetchAllRows('atividade_crm', 'Data de criação'),
      fetchAllRows('inscritos_20262', 'data_inscricao', 'cpf, candidato'),
      fetchAllRows('matriculados_20262', 'data_baixa_do_pagamento', 'cpf, aluno'),
    ])

    if (crmResponse.error || inscritosResponse.error || matriculadosResponse.error) {
      setError(
        'Nao foi possivel carregar a base de CRM, inscritos e matriculados. Confira as tabelas e as permissoes de leitura no Supabase.',
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
        schedulingCode: cleanEmptyValue(
          readField(row, 'Código do agendamento', 'CÃ³digo do agendamento'),
        ),
        activity: titleize(readField(row, 'Atividade')),
        description: decodeMojibake(readField(row, 'Descrição', 'DescriÃ§Ã£o')) || 'Sem descricao',
        courseLabel: normalizeCourseLabel(courseSource),
        processLabel: normalizeProcessLabel(processSource),
        email: normalizeEmail(readField(row, 'E-mail')),
        personCode: cleanEmptyValue(
          readField(row, 'Código da pessoa', 'CÃ³digo da pessoa'),
        ),
        contactName: titleize(readField(row, 'Contato')),
        cpf: normalizeCpf(readField(row, 'CPF da pessoa')),
        seller: normalizeSeller(readField(row, 'Responsável', 'ResponsÃ¡vel')),
        campusLabel: normalizeCampus(localOfferSource, unidadeSource, courseSource),
        dateCreatedRaw,
        dateCreatedKey: toDateKey(dateCreatedRaw),
      } satisfies ActivityCrmPrepared
    })

    setCrmRows(preparedCrmRows)
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

  const sellerRows = useMemo(
    () => crmRows.filter((row) => row.seller === activeSeller),
    [activeSeller, crmRows],
  )

  const filterOptions = useMemo(() => {
    const courses = new Set<string>()
    const campuses = new Set<string>()
    const processes = new Set<string>()
    const candidates = new Set<string>()

    sellerRows.forEach((row) => {
      if (row.courseLabel && row.courseLabel !== 'Nao informado') {
        courses.add(row.courseLabel)
      }
      if (row.campusLabel && row.campusLabel !== 'Nao informado') {
        campuses.add(row.campusLabel)
      }
      if (row.processLabel && row.processLabel !== 'Nao informado') {
        processes.add(row.processLabel)
      }
      if (row.contactName && row.contactName !== 'Nao informado') {
        candidates.add(row.contactName)
      }
    })

    return {
      courses: Array.from(courses).sort(),
      campuses: Array.from(campuses).sort(),
      processes: Array.from(processes).sort(),
      candidates: Array.from(candidates).sort(),
    }
  }, [sellerRows])

  const filteredActivityRows = useMemo(
    () => sellerRows.filter((row) => applyFilters(row, filters)),
    [filters, sellerRows],
  )

  const candidateSummaries = useMemo(() => {
    const groups = new Map<string, ActivityCrmPrepared[]>()

    filteredActivityRows.forEach((row) => {
      const key = buildCandidateKey(row)
      const currentGroup = groups.get(key) ?? []
      currentGroup.push(row)
      groups.set(key, currentGroup)
    })

    return Array.from(groups.entries())
      .map(([key, rows]) => {
        const sortedRows = [...rows].sort((currentItem, nextItem) =>
          nextItem.dateCreatedKey.localeCompare(currentItem.dateCreatedKey),
        )
        const latestRow = sortedRows[0]
        const activities = Array.from(new Set(sortedRows.map((row) => row.activity).filter(Boolean)))
        const descriptions = Array.from(
          new Set(sortedRows.map((row) => row.description).filter(Boolean)),
        )

        const hasInscrito =
          (latestRow.cpf && inscritosCpfSet.has(latestRow.cpf)) ||
          inscritosNameSet.has(normalizeString(latestRow.contactName))
        const hasMatriculado =
          (latestRow.cpf && matriculadosCpfSet.has(latestRow.cpf)) ||
          matriculadosNameSet.has(normalizeString(latestRow.contactName))

        return {
          key,
          personCode: latestRow.personCode || 'Nao informado',
          contactName: latestRow.contactName,
          cpf: latestRow.cpf,
          email: latestRow.email,
          courseLabel: findFirstFilled(sortedRows.map((row) => row.courseLabel)),
          campusLabel: findFirstFilled(sortedRows.map((row) => row.campusLabel)),
          processLabel: findFirstFilled(sortedRows.map((row) => row.processLabel)),
          activityCount: sortedRows.length,
          activities,
          descriptions,
          hasInscrito,
          hasMatriculado,
          latestDateKey: latestRow.dateCreatedKey,
        } satisfies CandidateSummary
      })
      .sort((currentItem, nextItem) => currentItem.contactName.localeCompare(nextItem.contactName))
  }, [
    filteredActivityRows,
    inscritosCpfSet,
    inscritosNameSet,
    matriculadosCpfSet,
    matriculadosNameSet,
  ])

  const cardCandidateSummaries = useMemo(() => {
    const groupedMap = new Map<string, ActivityCrmPrepared[]>()

    sellerRows
      .filter((row) => applyFilters(row, cardFilters))
      .forEach((row) => {
        const key = buildCandidateKey(row)
        const currentGroup = groupedMap.get(key) ?? []
        currentGroup.push(row)
        groupedMap.set(key, currentGroup)
      })

    return Array.from(groupedMap.entries())
      .map(([key, rows]) => {
        const sortedRows = [...rows].sort((currentItem, nextItem) =>
          nextItem.dateCreatedKey.localeCompare(currentItem.dateCreatedKey),
        )
        const latestRow = sortedRows[0]

        return {
          key,
          personCode: latestRow.personCode || 'Nao informado',
          contactName: latestRow.contactName,
          cpf: latestRow.cpf,
          email: latestRow.email,
          courseLabel: findFirstFilled(sortedRows.map((row) => row.courseLabel)),
          campusLabel: findFirstFilled(sortedRows.map((row) => row.campusLabel)),
          processLabel: findFirstFilled(sortedRows.map((row) => row.processLabel)),
          activityCount: sortedRows.length,
          activities: Array.from(new Set(sortedRows.map((row) => row.activity).filter(Boolean))),
          descriptions: Array.from(
            new Set(sortedRows.map((row) => row.description).filter(Boolean)),
          ),
          hasInscrito:
            (latestRow.cpf && inscritosCpfSet.has(latestRow.cpf)) ||
            inscritosNameSet.has(normalizeString(latestRow.contactName)),
          hasMatriculado:
            (latestRow.cpf && matriculadosCpfSet.has(latestRow.cpf)) ||
            matriculadosNameSet.has(normalizeString(latestRow.contactName)),
          latestDateKey: latestRow.dateCreatedKey,
        } satisfies CandidateSummary
      })
      .sort((currentItem, nextItem) => currentItem.contactName.localeCompare(nextItem.contactName))
  }, [
    cardFilters,
    inscritosCpfSet,
    inscritosNameSet,
    matriculadosCpfSet,
    matriculadosNameSet,
    sellerRows,
  ])

  const kpiCards = useMemo(
    () => [
      {
        title: 'Nao inscritos/matriculados',
        value: formatNumberBR(
          candidateSummaries.filter((row) => !row.hasInscrito && !row.hasMatriculado).length,
        ),
        helperText: 'Candidatos do vendedor sem match em inscritos_20262 e matriculados_20262.',
        emphasis: 'primary' as const,
      },
      {
        title: 'Inscritos',
        value: formatNumberBR(candidateSummaries.filter((row) => row.hasInscrito).length),
        helperText: 'Candidatos do recorte localizados na tabela inscritos_20262 por CPF ou nome.',
      },
      {
        title: 'Matriculados',
        value: formatNumberBR(candidateSummaries.filter((row) => row.hasMatriculado).length),
        helperText:
          'Candidatos do recorte localizados na tabela matriculados_20262 por CPF ou nome.',
      },
      {
        title: 'Atividades agendadas',
        value: formatNumberBR(filteredActivityRows.length),
        helperText: 'Volume de atividades do vendedor dentro dos filtros ativos.',
      },
    ],
    [candidateSummaries, filteredActivityRows.length],
  )

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

  const charts = useMemo(
    () => ({
      campus: buildCountData(filteredActivityRows, (row) => row.campusLabel),
      process: buildCountData(filteredActivityRows, (row) => row.processLabel),
      course: buildCountData(filteredActivityRows, (row) => row.courseLabel),
      activity: buildCountData(filteredActivityRows, (row) => row.activity),
    }),
    [filteredActivityRows],
  )

  if (loading) {
    return <Loading message="Carregando Visao CRM..." />
  }

  if (error) {
    return <EmptyState title="Nao foi possivel carregar a Visao CRM" description={error} />
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Operacao CRM
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Visao CRM
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              A leitura cruza as atividades do CRM com inscritos_20262 e matriculados_20262,
              usando CPF e nome como chaves praticas de validacao.
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
        description="Esses filtros controlam os indicadores e os graficos do vendedor selecionado."
        filters={filters}
        setFilters={setFilters}
        courseOptions={filterOptions.courses}
        campusOptions={filterOptions.campuses}
        processOptions={filterOptions.processes}
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

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Por campus"
          description="Distribuicao das atividades por unidade padronizada."
          data={charts.campus}
        />
        <ChartCard
          title="Por processo seletivo"
          description="Leitura das atividades pelo processo normalizado do CRM."
          data={charts.process}
        />
        <ChartCard
          title="Por curso"
          description="Concentracao das atividades por curso, ignorando a unidade no nome da oferta."
          data={charts.course}
        />
        <ChartCard
          title="Qual atividade"
          description="Tipos de atividade mais recorrentes no recorte atual."
          data={charts.activity}
        />
      </section>

      <FilterPanel
        title="Cards de candidatos"
        description="Esses filtros controlam apenas os cards abaixo e nao mexem nos indicadores de cima."
        filters={cardFilters}
        setFilters={setCardFilters}
        courseOptions={filterOptions.courses}
        campusOptions={filterOptions.campuses}
        processOptions={filterOptions.processes}
        candidateOptions={filterOptions.candidates}
      />

      {cardCandidateSummaries.length === 0 ? (
        <EmptyState
          title="Nenhum candidato para os filtros atuais"
          description="Limpe os filtros dos cards ou troque de vendedor para voltar a ver os candidatos desta visao."
        />
      ) : (
        <>
          <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Mostrando {formatNumberBR(paginatedCandidateSummaries.length)} de{' '}
                {formatNumberBR(cardCandidateSummaries.length)} candidatos nesta pagina.
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
                  Proxima
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
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                      Candidato
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">
                      {candidate.contactName}
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Curso
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {candidate.courseLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Campus
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {candidate.campusLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Processo seletivo
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {candidate.processLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Ultima atividade
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {formatDateBR(candidate.latestDateKey)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                    {formatNumberBR(candidate.activityCount)} atividades
                  </span>
                  {candidate.hasInscrito ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                      Inscrito
                    </span>
                  ) : null}
                  {candidate.hasMatriculado ? (
                    <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                      Matriculado
                    </span>
                  ) : null}
                  {!candidate.hasInscrito && !candidate.hasMatriculado ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                      Sem match
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-slate-500" />
                    <p className="text-sm font-semibold text-slate-900">Atividades</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {candidate.activities.map((activity) => (
                      <span
                        key={`${candidate.key}-${activity}`}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
                      >
                        {activity}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    <p className="text-sm font-semibold text-slate-900">Descricao</p>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                    {candidate.descriptions.map((description) => (
                      <li key={`${candidate.key}-${description}`} className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                        {description}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>Codigo da pessoa: {candidate.personCode}</span>
                <span>CPF: {candidate.cpf || '--'}</span>
                <span>E-mail: {candidate.email || '--'}</span>
              </div>
            </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
