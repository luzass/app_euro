import { useEffect, useMemo, useState } from 'react'
import { Eraser, RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../components/UI/KpiCard'
import { EmptyState } from '../components/UI/EmptyState'
import { Loading } from '../components/UI/Loading'
import {
  formatCompactNumberBR,
  formatDateBR,
  formatNumberBR,
  formatPercentBR,
} from '../lib/formatters'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'

type DashboardTab = 'inscritos' | 'matriculados' | 'comparativo'
type ComparativeBranchFilter = 'Todas' | 'Asa Sul' | 'Águas Claras'
type ComparativeMonthFilter = 'all' | string
type ComparativeRangeMode = 'full' | 'to-date'

interface InscritoRow {
  id: number
  created_at: string | null
  forma_de_ingresso: string | null
  campus: string | null
  curso: string | null
  turno: string | null
  candidato: string | null
  cpf: string | null
  data_de_nascimento: string | null
  data_inscricao: string | null
  etapa_atual: string | null
  bairro: string | null
  data_hora_realizacao_prova: string | null
  boleto_de_matricula: string | null
  data_da_baixa: string | null
  curva_de_conversao: string | null
  local_matricula: string | null
  ano_semestre: string | null
}

interface MatriculadoRow {
  id: number
  created_at: string | null
  filial: string | null
  curso: string | null
  turno: string | null
  aluno: string | null
  cpf: string | null
  data_de_nascimento: string | null
  data_de_matricula: string | null
  data_baixa_do_pagamento: string | null
  tipo_aluno: string | null
  tipo_de_ingresso: string | null
  status: string | null
  periodo: string | null
  local_matricula: string | null
  contrato: string | null
  escola: string | null
  tipo_escola: string | null
  semestre: string | null
}

interface LeadEnriquecidoRow {
  id?: number
  created_at?: string | null
  cpf?: string | null
  data_inscricao?: string | null
  data_matricula?: string | null
  forma_ingresso_inscricao?: string | null
  forma_ingresso_matricula?: string | null
}

interface DateRangeFilter {
  startDate: string
  endDate: string
}

interface InscritosSelections {
  campus?: string
  curso?: string
  forma?: string
  turno?: string
  etapa?: string
}

interface MatriculadosSelections {
  filial?: string
  curso?: string
  ingresso?: string
  turno?: string
  contrato?: string
  status?: string
}

interface CountDatum {
  key: string
  label: string
  value: number
}

interface FilialTableRow {
  curso: string
  turno: string
  vestibular: number
  enem: number
  prouni: number
  total: number
  manualAdjustmentCount: number
}

interface ManualMatriculadoPrepared {
  aluno: string
  dateKey: string
  filialLabel: string
  cursoLabel: string
  turnoLabel: string
  ingressoLabel: string
  statusLabel: string
  contratoLabel: string
}

interface ComparativeKpiCard {
  title: string
  previousValue: string
  currentValue: string
  helperText: string
  emphasis?: 'neutral' | 'primary'
}

const tabItems: Array<{ id: DashboardTab; label: string }> = [
  { id: 'inscritos', label: 'Inscritos' },
  { id: 'matriculados', label: 'Matriculados' },
  { id: 'comparativo', label: 'Comparativo 2025.2' },
]

const initialDateRange: DateRangeFilter = {
  startDate: '',
  endDate: '',
}

const manualTurmaRows = [
  {
    aluno: 'JULIA STEFANI SANTANA DE ARAUJO',
    filial: 'Águas Claras',
    curso: 'Biomedicina',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'YASMIN DE CARVALHO DA SILVA',
    filial: 'Águas Claras',
    curso: 'Biomedicina',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'LETICIA SANTOS DIAS',
    filial: 'Águas Claras',
    curso: 'Direito',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - DIREITO MATUTINO 02',
    filial: 'Águas Claras',
    curso: 'Direito',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'GRAZIELLE GOMES SILVA DE OLIVEIRA',
    filial: 'Águas Claras',
    curso: 'Fisioterapia',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ENFERMAGEM MATUTINO 01',
    filial: 'Águas Claras',
    curso: 'Enfermagem',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - FISIOTERAPIA NOTURNO 01',
    filial: 'Águas Claras',
    curso: 'Fisioterapia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - FISIOTERAPIA NOTURNO 02',
    filial: 'Águas Claras',
    curso: 'Fisioterapia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ODONTOLOGIA NOTURNO 01',
    filial: 'Águas Claras',
    curso: 'Odontologia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ODONTOLOGIA NOTURNO 02',
    filial: 'Águas Claras',
    curso: 'Odontologia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ODONTOLOGIA NOTURNO 03',
    filial: 'Águas Claras',
    curso: 'Odontologia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ODONTOLOGIA NOTURNO 04',
    filial: 'Águas Claras',
    curso: 'Odontologia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ODONTOLOGIA NOTURNO 05',
    filial: 'Águas Claras',
    curso: 'Odontologia',
    turno: 'Noturno',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - PSICOLOGIA MATUTINO 01',
    filial: 'Águas Claras',
    curso: 'Psicologia',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - PSICOLOGIA MATUTINO 02',
    filial: 'Águas Claras',
    curso: 'Psicologia',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - MEDICINA 01',
    filial: 'Asa Sul',
    curso: 'Medicina',
    turno: 'Integral',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - MEDICINA 02',
    filial: 'Asa Sul',
    curso: 'Medicina',
    turno: 'Integral',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - MEDICINA 03',
    filial: 'Asa Sul',
    curso: 'Medicina',
    turno: 'Integral',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - MEDICINA 04',
    filial: 'Asa Sul',
    curso: 'Medicina',
    turno: 'Integral',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - MEDICINA 05',
    filial: 'Asa Sul',
    curso: 'Medicina',
    turno: 'Integral',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ENFERMAGEM MATUTINO ASA SUL 01',
    filial: 'Asa Sul',
    curso: 'Enfermagem',
    turno: 'Matutino',
    ingresso: 'PROUNI',
  },
  {
    aluno: 'AJUSTE MANUAL PROUNI - ODONTOLOGIA INTEGRAL ASA SUL 01',
    filial: 'Asa Sul',
    curso: 'Odontologia',
    turno: 'Integral',
    ingresso: 'PROUNI',
  },
] as const

const activeBarColor = '#0f172a'
const defaultBarColor = '#0ea5e9'
const mutedBarColor = '#cbd5e1'

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
    return 'Não informado'
  }

  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeBranch(value?: string | null) {
  const normalized = normalizeString(value)

  if (normalized.includes('ASA SUL')) {
    return 'Asa Sul'
  }

  if (normalized.includes('AGUAS CLARAS') || normalized.includes('GUAS CLARAS')) {
    return '\u00C1guas Claras'
  }

  return titleize(value)
}

function normalizeMatriculaIngresso(value?: string | null) {
  const normalized = normalizeString(value)

  if (normalized.includes('PROUNI')) {
    return 'PROUNI'
  }

  if (normalized.includes('VESTIBULAR')) {
    return 'Vestibular'
  }

  if (normalized.includes('ENEM')) {
    return 'ENEM'
  }

  if (value?.includes('-')) {
    return titleize(value.split('-').pop()?.trim() ?? value)
  }

  return titleize(value)
}

function isMedicineCourse(value?: string | null) {
  return normalizeString(value) === 'MEDICINA'
}

function normalizeInscricaoStageDisplay(value?: string | null) {
  const etapaNormalizada = normalizeString(value)

  if (etapaNormalizada === 'APROVADO.MATRICULALIBERADA') {
    return 'Boleto Emitido'
  }

  if (
    etapaNormalizada === 'APROVADO.MATRICULALIBERADA **' ||
    etapaNormalizada === 'APROVADO.MATRICULALIBERADA**'
  ) {
    return 'Pré-matrícula pendente'
  }

  return titleize(value)
}

function normalizeInscricaoStage(row: Pick<InscritoRow, 'etapa_atual' | 'boleto_de_matricula'>) {
  return normalizeInscricaoStageDisplay(row.etapa_atual)

  const etapaOriginal = (row.etapa_atual ?? '').trim()

  if (etapaOriginal === 'Aprovado.MatrículaLiberada') {
    return 'Boleto Emitido'
  }

  if (
    etapaOriginal === 'Aprovado.MatrículaLiberada **' ||
    etapaOriginal === 'Aprovado.MatrículaLiberada**'
  ) {
    return 'Pré-matrícula pendente'
  }

  return titleize(row.etapa_atual)
}

function getResponsiveChartTextStyle(viewportWidth: number) {
  if (viewportWidth < 640) {
    return { fontSize: 10, offset: 6 }
  }

  if (viewportWidth < 1024) {
    return { fontSize: 11, offset: 8 }
  }

  return { fontSize: 12, offset: 10 }
}

function getSaoPauloDateParts(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(referenceDate)
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0')
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0')
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0')

  return { year, month, day }
}

function getPreviousDayDateKey(referenceDate = new Date()) {
  const { year, month, day } = getSaoPauloDateParts(referenceDate)
  const saoPauloMidnightUtc = new Date(Date.UTC(year, month - 1, day))
  saoPauloMidnightUtc.setUTCDate(saoPauloMidnightUtc.getUTCDate() - 1)

  const previousYear = saoPauloMidnightUtc.getUTCFullYear()
  const previousMonth = `${saoPauloMidnightUtc.getUTCMonth() + 1}`.padStart(2, '0')
  const previousDay = `${saoPauloMidnightUtc.getUTCDate()}`.padStart(2, '0')

  return `${previousYear}-${previousMonth}-${previousDay}`
}

function wrapChartLabel(label: string, maxLineLength = 18, maxLines = 2) {
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

function renderWrappedAxisTick(
  props: {
    x?: number
    y?: number
    payload?: { value?: string }
  },
  maxLineLength = 18,
) {
  const lines = wrapChartLabel(String(props.payload?.value ?? ''), maxLineLength)
  const x = props.x ?? 0
  const y = props.y ?? 0

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4 - ((lines.length - 1) * 7)}
        textAnchor="end"
        fill="#64748b"
        fontSize={12}
      >
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function renderBarValueLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
}: {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string
}) {
  const numericValue = Number(value ?? 0)
  const numericX = Number(x ?? 0)
  const numericY = Number(y ?? 0)
  const numericWidth = Number(width ?? 0)
  const numericHeight = Number(height ?? 0)
  const shouldRenderInside = numericWidth >= 64
  const labelX = shouldRenderInside ? numericX + numericWidth - 8 : numericX + numericWidth + 8

  return (
    <text
      x={labelX}
      y={numericY + numericHeight / 2}
      dy={4}
      textAnchor={shouldRenderInside ? 'end' : 'start'}
      fill={shouldRenderInside ? '#ffffff' : '#475569'}
      fontSize={12}
      fontWeight={600}
    >
      {formatNumberBR(numericValue)}
    </text>
  )
}

function normalizeContrato(value?: string | null) {
  const normalized = normalizeString(value)

  if (normalized.includes('CANCEL')) {
    return 'Cancelado'
  }

  if (normalized.includes('ATIVO')) {
    return 'Ativo'
  }

  return titleize(value)
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

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  const month = `${parsedDate.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsedDate.getDate()}`.padStart(2, '0')
  return `${parsedDate.getFullYear()}-${month}-${day}`
}

function applyDateRange(dateKey: string, filters: DateRangeFilter) {
  if (!filters.startDate && !filters.endDate) {
    return true
  }

  if (!dateKey) {
    return false
  }

  const startOk = !filters.startDate || dateKey >= filters.startDate
  const endOk = !filters.endDate || dateKey <= filters.endDate
  return startOk && endOk
}

function getLatestDate(rows: Array<{ dateKey: string }>) {
  return rows.reduce((latest, row) => (row.dateKey > latest ? row.dateKey : latest), '')
}

async function fetchAllRows<T>(tableName: string, orderColumn: string) {
  if (!supabase) {
    return {
      data: null as T[] | null,
      error: new Error('Supabase indisponivel.'),
    }
  }

  const pageSize = 1000
  const allRows: T[] = []
  let from = 0

  while (true) {
    const tableClient = supabase.from(tableName as never) as any

    const { data, error } = await tableClient
      .select('*')
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

function getMonthDayKey(dateKey: string) {
  if (!dateKey || dateKey.length < 10) {
    return ''
  }

  return dateKey.slice(5, 10)
}

function getMonthKey(dateKey: string) {
  if (!dateKey || dateKey.length < 7) {
    return ''
  }

  return dateKey.slice(5, 7)
}

function formatMonthDayLabel(monthDayKey: string) {
  if (!monthDayKey || monthDayKey.length !== 5) {
    return monthDayKey
  }

  const [month, day] = monthDayKey.split('-')
  return `${day}/${month}`
}

function formatMonthLabel(monthKey: string) {
  if (!monthKey) {
    return monthKey
  }

  const date = new Date(`2026-${monthKey}-01T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return monthKey
  }

  return date.toLocaleDateString('pt-BR', { month: 'long' })
}

function matchesComparativeRange(
  dateKey: string,
  rangeMode: ComparativeRangeMode,
  cutoffMonthDayKey: string,
) {
  if (rangeMode === 'full') {
    return true
  }

  const monthDayKey = getMonthDayKey(dateKey)

  if (!monthDayKey || !cutoffMonthDayKey) {
    return false
  }

  return monthDayKey <= cutoffMonthDayKey
}

function formatDeltaLabel(currentValue: number, previousValue: number) {
  const delta = currentValue - previousValue
  const direction = delta >= 0 ? '+' : '-'
  return `${direction}${formatNumberBR(Math.abs(delta))}`
}

function calculateConversionRate(totalInscritos: number, totalMatriculados: number) {
  if (!totalInscritos) {
    return 0
  }

  return (totalMatriculados / totalInscritos) * 100
}

function buildCountData<T>(
  rows: T[],
  getValue: (row: T) => string,
  minimumValue = 1,
) {
  const counts = new Map<string, number>()

  rows.forEach((row) => {
    const value = getValue(row) || 'Não informado'
    counts.set(value, (counts.get(value) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([key, value]) => ({
      key,
      label: key,
      value,
    }))
    .filter((item) => item.value >= minimumValue)
    .sort((currentItem, nextItem) => nextItem.value - currentItem.value)
}

function DashboardSection({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description: string }>) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function ComparativeSummaryCard({
  title,
  previousValue,
  currentValue,
  helperText,
  emphasis = 'neutral',
}: ComparativeKpiCard) {
  return (
    <article
      className={cn(
        'rounded-3xl border bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5',
        emphasis === 'primary'
          ? 'border-sky-200 bg-gradient-to-br from-white via-white to-sky-50'
          : 'border-slate-200',
      )}
    >
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">2025.2</p>
          <p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {previousValue}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">2026.2</p>
          <p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">
            {currentValue}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{helperText}</p>
    </article>
  )
}

function ComparativeList({
  data,
  previousLabel = '2025.2',
  currentLabel = '2026.2',
}: {
  data: Array<{
    label: string
    previousValue: number
    currentValue: number
  }>
  previousLabel?: string
  currentLabel?: string
}) {
  const maxValue = data.reduce(
    (currentMax, item) =>
      Math.max(currentMax, item.previousValue, item.currentValue),
    0,
  )

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const previousWidth = maxValue > 0 ? (item.previousValue / maxValue) * 100 : 0
        const currentWidth = maxValue > 0 ? (item.currentValue / maxValue) * 100 : 0

        return (
          <article
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-sm font-semibold leading-5 text-slate-950">{item.label}</p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {previousLabel}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {formatNumberBR(item.previousValue)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${Math.max(previousWidth, item.previousValue > 0 ? 6 : 0)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {currentLabel}
                  </span>
                  <span className="text-sm font-semibold text-slate-950">
                    {formatNumberBR(item.currentValue)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-950"
                    style={{ width: `${Math.max(currentWidth, item.currentValue > 0 ? 6 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function FilterPanel({
  title,
  filters,
  onChange,
  onReset,
}: {
  title: string
  filters: DateRangeFilter
  onChange: (nextValue: DateRangeFilter) => void
  onReset: () => void
}) {
  return (
    <DashboardSection
      title={title}
      description="Use o período para recalcular os indicadores e cruzar os gráficos dentro da aba atual."
    >
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Data inicial</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              onChange({
                ...filters,
                startDate: event.target.value,
              })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Data final</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              onChange({
                ...filters,
                endDate: event.target.value,
              })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Eraser className="h-4 w-4" />
            Limpar datas
          </button>
        </div>
      </div>
    </DashboardSection>
  )
}

function ActiveFilters({
  items,
  onClear,
}: {
  items: Array<{ label: string; value: string; onRemove: () => void }>
  onClear: () => void
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <button
          key={`${item.label}-${item.value}`}
          type="button"
          onClick={item.onRemove}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          {item.label}: {item.value}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
      >
        Limpar tudo
      </button>
    </div>
  )
}

function InteractiveDistributionChart({
  title,
  description,
  data,
  selectedKey,
  onSelect,
  viewportWidth,
  yAxisWidth = 120,
  minHeight = 320,
  minHeightPerItem = 0,
  maxHeight,
}: {
  title: string
  description: string
  data: CountDatum[]
  selectedKey?: string
  onSelect: (value: string) => void
  viewportWidth: number
  yAxisWidth?: number
  minHeight?: number
  minHeightPerItem?: number
  maxHeight?: number
}) {
  const isMobileViewport = viewportWidth < 640
  const chartHeight = Math.max(minHeight, data.length * minHeightPerItem)
  const wrapperHeight = maxHeight ? Math.min(chartHeight, maxHeight) : chartHeight

  if (isMobileViewport) {
    const maxValue = data.reduce(
      (currentMax, item) => (item.value > currentMax ? item.value : currentMax),
      0,
    )

    return (
      <DashboardSection title={title} description={description}>
        <div className="space-y-3">
          {data.map((entry) => {
            const isActive = selectedKey === entry.key
            const widthPercent = maxValue > 0 ? (entry.value / maxValue) * 100 : 0

            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => onSelect(entry.key)}
                className={cn(
                  'w-full rounded-2xl border px-4 py-3 text-left transition',
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-800',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium leading-5">{entry.label}</p>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatNumberBR(entry.value)}
                  </span>
                </div>

                <div
                  className={cn(
                    'mt-3 h-2 overflow-hidden rounded-full',
                    isActive ? 'bg-white/15' : 'bg-slate-200',
                  )}
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      isActive ? 'bg-white' : 'bg-sky-500',
                    )}
                    style={{ width: `${Math.max(widthPercent, 4)}%` }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </DashboardSection>
    )
  }

  return (
    <DashboardSection title={title} description={description}>
      <div
        className={cn(maxHeight ? 'overflow-y-auto pr-1' : undefined)}
        style={{ height: `${wrapperHeight}px` }}
      >
        <div style={{ height: `${chartHeight}px`, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                stroke="#64748b"
                tickFormatter={(value) => formatCompactNumberBR(Number(value))}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={yAxisWidth}
                interval={0}
                stroke="#64748b"
                tick={(props) =>
                  renderWrappedAxisTick(props, yAxisWidth >= 200 ? 24 : 18)
                }
              />
              <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
              <Bar dataKey="value" radius={[0, 12, 12, 0]} onClick={(entry) => onSelect(entry.key)}>
                <LabelList
                  dataKey="value"
                  content={renderBarValueLabel}
                />
                {data.map((entry) => (
                  <Cell
                    key={entry.key}
                    cursor="pointer"
                    fill={
                      selectedKey
                        ? selectedKey === entry.key
                          ? activeBarColor
                          : mutedBarColor
                        : defaultBarColor
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DashboardSection>
  )
}

function InteractivePieChart({
  title,
  description,
  data,
  selectedKey,
  onSelect,
  viewportWidth,
}: {
  title: string
  description: string
  data: CountDatum[]
  selectedKey?: string
  onSelect: (value: string) => void
  viewportWidth: number
}) {
  const isMobileViewport = viewportWidth < 640
  const chartTextStyle = getResponsiveChartTextStyle(viewportWidth)

  return (
    <DashboardSection title={title} description={description}>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-center">
        <div className={cn(isMobileViewport ? 'h-[220px]' : 'h-[280px]')}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={isMobileViewport ? 46 : 62}
                outerRadius={isMobileViewport ? 78 : 104}
                paddingAngle={3}
                labelLine={false}
                label={
                  isMobileViewport
                    ? false
                    : ({ value, percent }) =>
                  `${formatNumberBR(Number(value ?? 0))} • ${formatNumberBR(
                    Number((percent ?? 0) * 100),
                    { maximumFractionDigits: 0 },
                  )}%`
                }
                style={{
                  fontSize: chartTextStyle.fontSize,
                  fontWeight: 600,
                }}
                onClick={(entry) => onSelect(entry.key)}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.key}
                    cursor="pointer"
                    fill={
                      selectedKey
                        ? selectedKey === entry.key
                          ? activeBarColor
                          : mutedBarColor
                        : entry.key === 'Ativo'
                          ? '#0ea5e9'
                          : '#f97316'
                    }
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3">
          {data.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelect(entry.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition',
                selectedKey === entry.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
              )}
            >
              <span className="text-sm font-medium">{entry.label}</span>
              <span className="text-lg font-semibold">{formatNumberBR(entry.value)}</span>
            </button>
          ))}
        </div>
      </div>
    </DashboardSection>
  )
}

export function DashboardEuro() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('inscritos')
  const [inscritosRows, setInscritosRows] = useState<InscritoRow[]>([])
  const [leadsEnriquecidosRows, setLeadsEnriquecidosRows] = useState<LeadEnriquecidoRow[]>([])
  const [matriculadosRows, setMatriculadosRows] = useState<MatriculadoRow[]>([])
  const [inscritos20252Rows, setInscritos20252Rows] = useState<InscritoRow[]>([])
  const [matriculados20252Rows, setMatriculados20252Rows] = useState<MatriculadoRow[]>([])
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inscritosDateRange, setInscritosDateRange] =
    useState<DateRangeFilter>(initialDateRange)
  const [matriculadosDateRange, setMatriculadosDateRange] =
    useState<DateRangeFilter>(initialDateRange)
  const [comparativoBranchFilter, setComparativoBranchFilter] =
    useState<ComparativeBranchFilter>('Todas')
  const [comparativoRangeMode, setComparativoRangeMode] =
    useState<ComparativeRangeMode>('full')
  const [comparativoMonthFilter, setComparativoMonthFilter] = useState<ComparativeMonthFilter>(
    `${new Date().getMonth() + 1}`.padStart(2, '0'),
  )
  const [inscritosSelections, setInscritosSelections] = useState<InscritosSelections>({})
  const [matriculadosSelections, setMatriculadosSelections] =
    useState<MatriculadosSelections>({})

  const loadDashboardData = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de carregar o Dashboard Euro.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [
      inscritosResponse,
      leadsEnriquecidosResponse,
      matriculadosResponse,
      inscritos20252Response,
      matriculados20252Response,
    ] = await Promise.all([
      fetchAllRows<InscritoRow>('inscritos_20262', 'data_inscricao'),
      fetchAllRows<LeadEnriquecidoRow>('leads_cursos_enriquecidos', 'created_at'),
      fetchAllRows<MatriculadoRow>('matriculados_20262', 'data_baixa_do_pagamento'),
      fetchAllRows<InscritoRow>('inscritos_20252', 'data_inscricao'),
      fetchAllRows<MatriculadoRow>('matriculados_20252', 'data_baixa_do_pagamento'),
    ])

    if (
      inscritosResponse.error ||
      inscritos20252Response.error ||
      matriculadosResponse.error ||
      matriculados20252Response.error
    ) {
      setError(
        'Não foi possível carregar as tabelas de inscritos ou matriculados de 2025.2 e 2026.2. Confira se as tabelas existem e se as permissões de leitura no Supabase estão liberadas.',
      )
      setLoading(false)
      return
    }

    setInscritosRows((inscritosResponse.data as InscritoRow[]) ?? [])
    setLeadsEnriquecidosRows((leadsEnriquecidosResponse.data as LeadEnriquecidoRow[]) ?? [])
    setMatriculadosRows((matriculadosResponse.data as MatriculadoRow[]) ?? [])
    setInscritos20252Rows((inscritos20252Response.data as InscritoRow[]) ?? [])
    setMatriculados20252Rows((matriculados20252Response.data as MatriculadoRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadDashboardData()
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const inscritosPrepared = useMemo(
    () =>
      inscritosRows.map((row) => ({
        ...row,
        dateKey: toDateKey(row.data_inscricao),
        campusLabel: normalizeBranch(row.campus),
        cursoLabel: titleize(row.curso),
        formaLabel: titleize(row.forma_de_ingresso),
        turnoLabel: titleize(row.turno),
        etapaLabel: normalizeInscricaoStage(row),
      })),
    [inscritosRows],
  )

  const matriculadosPrepared = useMemo(
    () =>
      matriculadosRows
        .filter((row) => normalizeString(row.tipo_aluno) === 'CALOURO')
        .map((row) => ({
          ...row,
          dateKey: toDateKey(row.data_baixa_do_pagamento),
          filialLabel: normalizeBranch(row.filial),
          cursoLabel: titleize(row.curso),
          turnoLabel: titleize(row.turno),
          ingressoLabel: normalizeMatriculaIngresso(row.tipo_de_ingresso),
          statusLabel: titleize(row.status),
          contratoLabel: normalizeContrato(row.contrato),
        })),
    [matriculadosRows],
  )

  const inscritos20252Prepared = useMemo(
    () =>
      inscritos20252Rows.map((row) => ({
        ...row,
        dateKey: toDateKey(row.data_inscricao),
        campusLabel: normalizeBranch(row.campus),
        cursoLabel: titleize(row.curso),
        formaLabel: titleize(row.forma_de_ingresso),
        turnoLabel: titleize(row.turno),
        etapaLabel: normalizeInscricaoStage(row),
      })),
    [inscritos20252Rows],
  )

  const matriculados20252Prepared = useMemo(
    () =>
      matriculados20252Rows
        .filter((row) => normalizeString(row.tipo_aluno) === 'CALOURO')
        .map((row) => ({
          ...row,
          dateKey: toDateKey(row.data_baixa_do_pagamento),
          filialLabel: normalizeBranch(row.filial),
          cursoLabel: titleize(row.curso),
          turnoLabel: titleize(row.turno),
          ingressoLabel: normalizeMatriculaIngresso(row.tipo_de_ingresso),
          statusLabel: titleize(row.status),
          contratoLabel: normalizeContrato(row.contrato),
        })),
    [matriculados20252Rows],
  )

  const manualMatriculadosPrepared = useMemo<ManualMatriculadoPrepared[]>(
    () =>
      manualTurmaRows.map((row) => ({
        aluno: row.aluno,
        dateKey: '',
        filialLabel: normalizeBranch(row.filial),
        cursoLabel: titleize(row.curso),
        turnoLabel: titleize(row.turno),
        ingressoLabel: row.ingresso,
        statusLabel: 'Não informado',
        contratoLabel: 'Ativo',
      })),
    [],
  )

  const inscritosFiltered = useMemo(
    () =>
      inscritosPrepared.filter((row) => {
        if (!applyDateRange(row.dateKey, inscritosDateRange)) {
          return false
        }

        if (inscritosSelections.campus && row.campusLabel !== inscritosSelections.campus) {
          return false
        }

        if (inscritosSelections.curso && row.cursoLabel !== inscritosSelections.curso) {
          return false
        }

        if (inscritosSelections.forma && row.formaLabel !== inscritosSelections.forma) {
          return false
        }

        if (inscritosSelections.turno && row.turnoLabel !== inscritosSelections.turno) {
          return false
        }

        if (inscritosSelections.etapa && row.etapaLabel !== inscritosSelections.etapa) {
          return false
        }

        return true
      }),
    [inscritosDateRange, inscritosPrepared, inscritosSelections],
  )

  const spikeLeadCpfSet = useMemo(
    () =>
      new Set(
        leadsEnriquecidosRows
          .map((row) => normalizeCpf(row.cpf))
          .filter((cpf): cpf is string => Boolean(cpf)),
      ),
    [leadsEnriquecidosRows],
  )

  const inscritosOrigemComparativo = useMemo(() => {
    const rowsMap = new Map<
      string,
      {
        label: string
        spike: number
        normal: number
        total: number
      }
    >()

    inscritosFiltered.forEach((row) => {
      const label = row.formaLabel
      const currentRow = rowsMap.get(label) ?? {
        label,
        spike: 0,
        normal: 0,
        total: 0,
      }

      const cpf = normalizeCpf(row.cpf)
      const isSpike = Boolean(cpf) && spikeLeadCpfSet.has(cpf)

      currentRow.total += 1

      if (isSpike) {
        currentRow.spike += 1
      } else {
        currentRow.normal += 1
      }

      rowsMap.set(label, currentRow)
    })

    const totals = Array.from(rowsMap.values()).reduce(
      (accumulator, row) => ({
        spike: accumulator.spike + row.spike,
        normal: accumulator.normal + row.normal,
        total: accumulator.total + row.total,
      }),
      { spike: 0, normal: 0, total: 0 },
    )

    return Array.from(rowsMap.values())
      .map((row) => ({
        ...row,
        spikeShareOfSpike: totals.spike > 0 ? (row.spike / totals.spike) * 100 : 0,
        normalShareOfNormal: totals.normal > 0 ? (row.normal / totals.normal) * 100 : 0,
        spikeShareOfRow: row.total > 0 ? (row.spike / row.total) * 100 : 0,
        normalShareOfRow: row.total > 0 ? (row.normal / row.total) * 100 : 0,
      }))
      .sort((currentRow, nextRow) => nextRow.total - currentRow.total)
  }, [inscritosFiltered, spikeLeadCpfSet])

  const inscritosOrigemTotais = useMemo(
    () =>
      inscritosOrigemComparativo.reduce(
        (accumulator, row) => ({
          spike: accumulator.spike + row.spike,
          normal: accumulator.normal + row.normal,
          total: accumulator.total + row.total,
        }),
        { spike: 0, normal: 0, total: 0 },
      ),
    [inscritosOrigemComparativo],
  )

  const matriculadosFiltered = useMemo(
    () =>
      matriculadosPrepared.filter((row) => {
        if (!applyDateRange(row.dateKey, matriculadosDateRange)) {
          return false
        }

        if (matriculadosSelections.filial && row.filialLabel !== matriculadosSelections.filial) {
          return false
        }

        if (matriculadosSelections.curso && row.cursoLabel !== matriculadosSelections.curso) {
          return false
        }

        if (matriculadosSelections.ingresso && row.ingressoLabel !== matriculadosSelections.ingresso) {
          return false
        }

        if (matriculadosSelections.turno && row.turnoLabel !== matriculadosSelections.turno) {
          return false
        }

        if (matriculadosSelections.contrato && row.contratoLabel !== matriculadosSelections.contrato) {
          return false
        }

        if (matriculadosSelections.status && row.statusLabel !== matriculadosSelections.status) {
          return false
        }

        return true
      }),
    [matriculadosDateRange, matriculadosPrepared, matriculadosSelections],
  )

  const manualMatriculadosFiltered = useMemo(
    () =>
      manualMatriculadosPrepared.filter((row) => {
        if (!applyDateRange(row.dateKey, matriculadosDateRange)) {
          return false
        }

        if (matriculadosSelections.filial && row.filialLabel !== matriculadosSelections.filial) {
          return false
        }

        if (matriculadosSelections.curso && row.cursoLabel !== matriculadosSelections.curso) {
          return false
        }

        if (matriculadosSelections.ingresso && row.ingressoLabel !== matriculadosSelections.ingresso) {
          return false
        }

        if (matriculadosSelections.turno && row.turnoLabel !== matriculadosSelections.turno) {
          return false
        }

        if (matriculadosSelections.contrato && row.contratoLabel !== matriculadosSelections.contrato) {
          return false
        }

        if (matriculadosSelections.status && row.statusLabel !== matriculadosSelections.status) {
          return false
        }

        return true
      }),
    [manualMatriculadosPrepared, matriculadosDateRange, matriculadosSelections],
  )

  const inscritosReferenceDate = useMemo(() => getLatestDate(inscritosFiltered), [inscritosFiltered])
  const matriculadosReferenceDate = useMemo(() => getPreviousDayDateKey(), [])

  const inscritosTodayRows = useMemo(
    () => inscritosFiltered.filter((row) => row.dateKey === inscritosReferenceDate),
    [inscritosFiltered, inscritosReferenceDate],
  )

  const matriculadosTodayRows = useMemo(
    () =>
      matriculadosFiltered.filter(
        (row) => row.dateKey === matriculadosReferenceDate && row.contratoLabel === 'Ativo',
      ),
    [matriculadosFiltered, matriculadosReferenceDate],
  )

  const matriculadosAtivosFiltered = useMemo(
    () => matriculadosFiltered.filter((row) => row.contratoLabel === 'Ativo'),
    [matriculadosFiltered],
  )

  const manualMatriculadosAtivosFiltered = useMemo(
    () => manualMatriculadosFiltered.filter((row) => row.contratoLabel === 'Ativo'),
    [manualMatriculadosFiltered],
  )

  const matriculadosGeraisComAjustes = useMemo(
    () => [...matriculadosAtivosFiltered, ...manualMatriculadosAtivosFiltered],
    [manualMatriculadosAtivosFiltered, matriculadosAtivosFiltered],
  )

  const matriculadosGerais20262 = useMemo(
    () => matriculadosAtivosFiltered.filter((row) => !isMedicineCourse(row.cursoLabel)),
    [matriculadosAtivosFiltered],
  )

  const matriculadosGeraisComMedicina = useMemo(
    () => [
      ...matriculadosAtivosFiltered.filter((row) => isMedicineCourse(row.cursoLabel)),
      ...manualMatriculadosAtivosFiltered.filter((row) => isMedicineCourse(row.cursoLabel)),
    ],
    [manualMatriculadosAtivosFiltered, matriculadosAtivosFiltered],
  )

  const matriculadosGeraisComReadmissao = useMemo(
    () => manualMatriculadosAtivosFiltered.filter((row) => !isMedicineCourse(row.cursoLabel)),
    [manualMatriculadosAtivosFiltered],
  )

  const inscritosCards = useMemo(
    () => [
      {
        title: 'Inscritos do dia',
        value: formatNumberBR(inscritosTodayRows.length),
        helperText: `Base em ${formatDateBR(inscritosReferenceDate)}.`,
        emphasis: 'primary' as const,
      },
      {
        title: 'Inscritos do dia - Asa Sul',
        value: formatNumberBR(
          inscritosTodayRows.filter((row) => row.campusLabel === 'Asa Sul').length,
        ),
        helperText: 'Recorte diário da filial Asa Sul.',
      },
      {
        title: 'Inscritos do dia - Águas Claras',
        value: formatNumberBR(
          inscritosTodayRows.filter((row) => row.campusLabel === 'Águas Claras').length,
        ),
        helperText: 'Recorte diário da filial Águas Claras.',
      },
      {
        title: 'Inscritos no geral',
        value: formatNumberBR(inscritosFiltered.length),
        helperText: 'Total dentro dos filtros ativos.',
      },
      {
        title: 'Inscritos gerais - Asa Sul',
        value: formatNumberBR(
          inscritosFiltered.filter((row) => row.campusLabel === 'Asa Sul').length,
        ),
        helperText: 'Volume acumulado da filial Asa Sul.',
      },
      {
        title: 'Inscritos gerais - Águas Claras',
        value: formatNumberBR(
          inscritosFiltered.filter((row) => row.campusLabel === 'Águas Claras').length,
        ),
        helperText: 'Volume acumulado da filial Águas Claras.',
      },
    ],
    [inscritosFiltered, inscritosReferenceDate, inscritosTodayRows],
  )

  const matriculadosCards = useMemo(
    () => [
      {
        title: 'Matrículas do dia',
        value: formatNumberBR(matriculadosTodayRows.length),
        helperText: `Base em ${formatDateBR(matriculadosReferenceDate)} pela data da baixa do pagamento.`,
        emphasis: 'primary' as const,
      },
      {
        title: 'Matrículas do dia - Asa Sul',
        value: formatNumberBR(
          matriculadosTodayRows.filter((row) => row.filialLabel === 'Asa Sul').length,
        ),
        helperText: 'Somente calouros com contrato ativo.',
      },
      {
        title: 'Matrículas do dia - Águas Claras',
        value: formatNumberBR(
          matriculadosTodayRows.filter((row) => row.filialLabel === 'Águas Claras').length,
        ),
        helperText: 'Somente calouros com contrato ativo.',
      },
      {
        title: 'Matrículas no geral',
        value: formatNumberBR(matriculadosGeraisComAjustes.length),
        helperText: `${formatNumberBR(matriculadosGeraisComMedicina.length)} matriculados Medicina com contrato ativo.`,
      },
      {
        title: 'Matrículas gerais - Asa Sul',
        value: formatNumberBR(
          matriculadosGeraisComAjustes.filter((row) => row.filialLabel === 'Asa Sul').length,
        ),
        helperText: `${formatNumberBR(
          matriculadosGeraisComMedicina.filter((row) => row.filialLabel === 'Asa Sul').length,
        )} matriculados Medicina com contrato ativo.`,
      },
      {
        title: 'Matrículas gerais - Águas Claras',
        value: formatNumberBR(
          matriculadosGeraisComAjustes.filter((row) => row.filialLabel === 'Águas Claras').length,
        ),
        helperText: `${formatNumberBR(
          matriculadosGeraisComMedicina.filter((row) => row.filialLabel === 'Águas Claras').length,
        )} matriculados Medicina com contrato ativo.`,
      },
      {
        title: 'Matriculados 26.2',
        value: formatNumberBR(matriculadosGerais20262.length),
        helperText: 'Base 26.2 com contrato ativo, sem Medicina e sem os ajustes manuais de PROUNI 26.1.',
      },
      {
        title: 'Matriculados 26.2 - Asa Sul',
        value: formatNumberBR(
          matriculadosGerais20262.filter((row) => row.filialLabel === 'Asa Sul').length,
        ),
        helperText: 'Base 26.2 da filial Asa Sul com contrato ativo, sem Medicina e sem os ajustes manuais.',
      },
      {
        title: 'Matriculados 26.2 - Águas Claras',
        value: formatNumberBR(
          matriculadosGerais20262.filter((row) => row.filialLabel === 'Águas Claras').length,
        ),
        helperText: 'Base 26.2 da filial Águas Claras com contrato ativo, sem Medicina e sem os ajustes manuais.',
      },
      {
        title: 'Matriculados + PROUNI 26.1 (Readmissão)',
        value: formatNumberBR(matriculadosGeraisComReadmissao.length),
        helperText: 'Somente os ajustes manuais de PROUNI 26.1 com contrato ativo.',
      },
      {
        title: 'Matriculados + PROUNI 26.1 - Asa Sul',
        value: formatNumberBR(
          matriculadosGeraisComReadmissao.filter((row) => row.filialLabel === 'Asa Sul').length,
        ),
        helperText: 'Somente os ajustes manuais de PROUNI 26.1 com contrato ativo na filial Asa Sul.',
      },
      {
        title: 'Matriculados + PROUNI 26.1 - Águas Claras',
        value: formatNumberBR(
          matriculadosGeraisComReadmissao.filter((row) => row.filialLabel === 'Águas Claras').length,
        ),
        helperText: 'Somente os ajustes manuais de PROUNI 26.1 com contrato ativo na filial Águas Claras.',
      },
    ],
    [
      matriculadosGeraisComAjustes,
      matriculadosGerais20262,
      matriculadosGeraisComMedicina,
      matriculadosGeraisComReadmissao,
      matriculadosReferenceDate,
      matriculadosTodayRows,
    ],
  )

  const inscritosCharts = useMemo(
    () => ({
      campus: buildCountData(inscritosFiltered, (row) => row.campusLabel),
      cursos: buildCountData(inscritosFiltered, (row) => row.cursoLabel),
      formas: buildCountData(inscritosFiltered, (row) => row.formaLabel),
      turnos: buildCountData(inscritosFiltered, (row) => row.turnoLabel),
      etapas: buildCountData(inscritosFiltered, (row) => row.etapaLabel),
    }),
    [inscritosFiltered],
  )

  const matriculadosCharts = useMemo(
    () => ({
      filial: buildCountData(matriculadosFiltered, (row) => row.filialLabel),
      cursos: buildCountData(matriculadosFiltered, (row) => row.cursoLabel),
      ingresso: buildCountData(matriculadosFiltered, (row) => row.ingressoLabel),
      turnos: buildCountData(matriculadosFiltered, (row) => row.turnoLabel),
      contratos: buildCountData(matriculadosFiltered, (row) => row.contratoLabel),
      status: buildCountData(matriculadosFiltered, (row) => row.statusLabel),
    }),
    [matriculadosFiltered],
  )

  const comparativoTodayMonthDayKey = useMemo(() => {
    const today = new Date()
    const month = `${today.getMonth() + 1}`.padStart(2, '0')
    const day = `${today.getDate()}`.padStart(2, '0')
    return `${month}-${day}`
  }, [])

  const comparativoInscritos20252 = useMemo(
    () =>
      comparativoBranchFilter === 'Todas'
        ? inscritos20252Prepared
        : inscritos20252Prepared.filter((row) => row.campusLabel === comparativoBranchFilter),
    [comparativoBranchFilter, inscritos20252Prepared],
  )

  const comparativoInscritos20262 = useMemo(
    () =>
      comparativoBranchFilter === 'Todas'
        ? inscritosPrepared
        : inscritosPrepared.filter((row) => row.campusLabel === comparativoBranchFilter),
    [comparativoBranchFilter, inscritosPrepared],
  )

  const comparativoMatriculados20252 = useMemo(
    () =>
      comparativoBranchFilter === 'Todas'
        ? matriculados20252Prepared.filter((row) => !isMedicineCourse(row.cursoLabel))
        : matriculados20252Prepared.filter(
            (row) =>
              row.filialLabel === comparativoBranchFilter && !isMedicineCourse(row.cursoLabel),
          ),
    [comparativoBranchFilter, matriculados20252Prepared],
  )

  const comparativoMatriculados20262 = useMemo(
    () =>
      comparativoBranchFilter === 'Todas'
        ? matriculadosPrepared.filter((row) => !isMedicineCourse(row.cursoLabel))
        : matriculadosPrepared.filter(
            (row) =>
              row.filialLabel === comparativoBranchFilter && !isMedicineCourse(row.cursoLabel),
          ),
    [comparativoBranchFilter, matriculadosPrepared],
  )

  const comparativoInscritos20252Recorte = useMemo(
    () =>
      comparativoInscritos20252.filter((row) =>
        matchesComparativeRange(row.dateKey, comparativoRangeMode, comparativoTodayMonthDayKey),
      ),
    [comparativoInscritos20252, comparativoRangeMode, comparativoTodayMonthDayKey],
  )

  const comparativoInscritos20262Recorte = useMemo(
    () =>
      comparativoInscritos20262.filter((row) =>
        matchesComparativeRange(row.dateKey, comparativoRangeMode, comparativoTodayMonthDayKey),
      ),
    [comparativoInscritos20262, comparativoRangeMode, comparativoTodayMonthDayKey],
  )

  const comparativoMatriculados20252Recorte = useMemo(
    () =>
      comparativoMatriculados20252.filter((row) =>
        matchesComparativeRange(row.dateKey, comparativoRangeMode, comparativoTodayMonthDayKey),
      ),
    [comparativoMatriculados20252, comparativoRangeMode, comparativoTodayMonthDayKey],
  )

  const comparativoMatriculados20262Recorte = useMemo(
    () =>
      comparativoMatriculados20262.filter((row) =>
        matchesComparativeRange(row.dateKey, comparativoRangeMode, comparativoTodayMonthDayKey),
      ),
    [comparativoMatriculados20262, comparativoRangeMode, comparativoTodayMonthDayKey],
  )

  const comparativoSemestre = useMemo(
    () => [
      {
        semestre: '2025.2',
        inscritos: comparativoInscritos20252Recorte.length,
        matriculados: comparativoMatriculados20252Recorte.length,
      },
      {
        semestre: '2026.2',
        inscritos: comparativoInscritos20262Recorte.length,
        matriculados: comparativoMatriculados20262Recorte.length,
      },
    ],
    [
      comparativoInscritos20252Recorte,
      comparativoInscritos20262Recorte,
      comparativoMatriculados20252Recorte,
      comparativoMatriculados20262Recorte,
    ],
  )

  const comparativoCampus = useMemo(() => {
    const branches =
      comparativoBranchFilter === 'Todas'
        ? ['Asa Sul', 'Águas Claras']
        : [comparativoBranchFilter]

    return branches.map((branch) => ({
      unidade: branch,
      inscritos_20252: comparativoInscritos20252Recorte.filter(
        (row) => row.campusLabel === branch,
      ).length,
      inscritos_20262: comparativoInscritos20262Recorte.filter(
        (row) => row.campusLabel === branch,
      ).length,
      matriculados_20252: comparativoMatriculados20252Recorte.filter(
        (row) => row.filialLabel === branch,
      ).length,
      matriculados_20262: comparativoMatriculados20262Recorte.filter(
        (row) => row.filialLabel === branch,
      ).length,
    }))
  }, [
    comparativoBranchFilter,
    comparativoInscritos20252Recorte,
    comparativoInscritos20262Recorte,
    comparativoMatriculados20252Recorte,
    comparativoMatriculados20262Recorte,
  ])

  const comparativoContratos = useMemo(
    () => [
      {
        semestre: '2025.2',
        ativos: comparativoMatriculados20252Recorte.filter((row) => row.contratoLabel === 'Ativo')
          .length,
        cancelados: comparativoMatriculados20252Recorte.filter(
          (row) => row.contratoLabel === 'Cancelado',
        ).length,
      },
      {
        semestre: '2026.2',
        ativos: comparativoMatriculados20262Recorte.filter((row) => row.contratoLabel === 'Ativo')
          .length,
        cancelados: comparativoMatriculados20262Recorte.filter(
          (row) => row.contratoLabel === 'Cancelado',
        ).length,
      },
    ],
    [comparativoMatriculados20252Recorte, comparativoMatriculados20262Recorte],
  )

  const comparativoFormasIngresso = useMemo(() => {
    const labels = Array.from(
      new Set([
        ...comparativoInscritos20252Recorte.map((row) => row.formaLabel),
        ...comparativoInscritos20262Recorte.map((row) => row.formaLabel),
      ]),
    )

    return labels
      .map((label) => ({
        label,
        inscritos_20252: comparativoInscritos20252Recorte.filter((row) => row.formaLabel === label)
          .length,
        inscritos_20262: comparativoInscritos20262Recorte.filter((row) => row.formaLabel === label)
          .length,
      }))
      .sort(
        (currentItem, nextItem) =>
          nextItem.inscritos_20252 +
          nextItem.inscritos_20262 -
          (currentItem.inscritos_20252 + currentItem.inscritos_20262),
      )
      .slice(0, 8)
  }, [comparativoInscritos20252Recorte, comparativoInscritos20262Recorte])

  const comparativoCursos = useMemo(() => {
    const labels = Array.from(
      new Set([
        ...comparativoMatriculados20252Recorte.map((row) => row.cursoLabel),
        ...comparativoMatriculados20262Recorte.map((row) => row.cursoLabel),
      ]),
    )

    return labels
      .map((label) => ({
        label,
        matriculados_20252: comparativoMatriculados20252Recorte.filter(
          (row) => row.cursoLabel === label,
        ).length,
        matriculados_20262: comparativoMatriculados20262Recorte.filter(
          (row) => row.cursoLabel === label,
        ).length,
      }))
      .sort(
        (currentItem, nextItem) =>
          nextItem.matriculados_20252 +
          nextItem.matriculados_20262 -
          (currentItem.matriculados_20252 + currentItem.matriculados_20262),
      )
      .slice(0, 10)
  }, [comparativoMatriculados20252Recorte, comparativoMatriculados20262Recorte])

  const comparativoCards = useMemo<ComparativeKpiCard[]>(() => {
    const inscritos2025 = comparativoInscritos20252Recorte.length
    const inscritos2026 = comparativoInscritos20262Recorte.length
    const matriculados2025 = comparativoMatriculados20252Recorte.length
    const matriculados2026 = comparativoMatriculados20262Recorte.length
    const conversao2025 = calculateConversionRate(inscritos2025, matriculados2025)
    const conversao2026 = calculateConversionRate(inscritos2026, matriculados2026)

    return [
      {
        title: 'Inscritos',
        previousValue: formatNumberBR(inscritos2025),
        currentValue: formatNumberBR(inscritos2026),
        helperText: `${formatDeltaLabel(inscritos2026, inscritos2025)} vs 2025.2.`,
        emphasis: 'primary',
      },
      {
        title: 'Matriculados',
        previousValue: formatNumberBR(matriculados2025),
        currentValue: formatNumberBR(matriculados2026),
        helperText: `${formatDeltaLabel(matriculados2026, matriculados2025)} vs 2025.2. Somente calouros, exceto Medicina.`,
      },
      {
        title: 'Conversao',
        previousValue: formatPercentBR(conversao2025, 1),
        currentValue: formatPercentBR(conversao2026, 1),
        helperText: `${formatDeltaLabel(conversao2026, conversao2025)} p.p. vs 2025.2.`,
      },
    ]
  }, [
    comparativoInscritos20252Recorte,
    comparativoInscritos20262Recorte,
    comparativoMatriculados20252Recorte,
    comparativoMatriculados20262Recorte,
  ])

  const comparativoContratosCards = useMemo(
    () => [
      {
        title: 'Contratos Ativos',
        previousValue: formatNumberBR(comparativoContratos[0]?.ativos ?? 0),
        currentValue: formatNumberBR(comparativoContratos[1]?.ativos ?? 0),
        helperText: 'Somente calouros, exceto Medicina.',
      },
      {
        title: 'Contratos Cancelados',
        previousValue: formatNumberBR(comparativoContratos[0]?.cancelados ?? 0),
        currentValue: formatNumberBR(comparativoContratos[1]?.cancelados ?? 0),
        helperText: 'Somente calouros, exceto Medicina.',
      },
    ],
    [comparativoContratos],
  )

  const comparativoAvailableMonths = useMemo(() => {
    const monthKeys = new Set<string>()

    ;[
      ...comparativoInscritos20262Recorte,
      ...comparativoMatriculados20262Recorte,
    ].forEach((row) => {
      const monthKey = getMonthKey(row.dateKey)

      if (monthKey) {
        monthKeys.add(monthKey)
      }
    })

    return Array.from(monthKeys).sort()
  }, [
    comparativoInscritos20262Recorte,
    comparativoMatriculados20262Recorte,
  ])

  const comparativoDiaADia = useMemo(() => {
    const inscritos2025ByDay = new Map<string, number>()
    const inscritos2026ByDay = new Map<string, number>()
    const matriculados2025ByDay = new Map<string, number>()
    const matriculados2026ByDay = new Map<string, number>()

    comparativoInscritos20252Recorte.forEach((row) => {
      const monthDayKey = getMonthDayKey(row.dateKey)
      if (!monthDayKey) {
        return
      }

      inscritos2025ByDay.set(monthDayKey, (inscritos2025ByDay.get(monthDayKey) ?? 0) + 1)
    })

    comparativoInscritos20262Recorte.forEach((row) => {
      const monthDayKey = getMonthDayKey(row.dateKey)
      if (!monthDayKey) {
        return
      }

      inscritos2026ByDay.set(monthDayKey, (inscritos2026ByDay.get(monthDayKey) ?? 0) + 1)
    })

    comparativoMatriculados20252Recorte.forEach((row) => {
      const monthDayKey = getMonthDayKey(row.dateKey)
      if (!monthDayKey) {
        return
      }

      matriculados2025ByDay.set(monthDayKey, (matriculados2025ByDay.get(monthDayKey) ?? 0) + 1)
    })

    comparativoMatriculados20262Recorte.forEach((row) => {
      const monthDayKey = getMonthDayKey(row.dateKey)
      if (!monthDayKey) {
        return
      }

      matriculados2026ByDay.set(monthDayKey, (matriculados2026ByDay.get(monthDayKey) ?? 0) + 1)
    })

    const allKeys = Array.from(
      new Set([
        ...inscritos2025ByDay.keys(),
        ...inscritos2026ByDay.keys(),
        ...matriculados2025ByDay.keys(),
        ...matriculados2026ByDay.keys(),
      ]),
    ).sort()

    return allKeys.map((monthDayKey) => ({
      monthDayKey,
      monthKey: getMonthKey(`2026-${monthDayKey}`),
      label: formatMonthDayLabel(monthDayKey),
      inscritos_20252: inscritos2025ByDay.get(monthDayKey) ?? 0,
      inscritos_20262: inscritos2026ByDay.get(monthDayKey) ?? 0,
      matriculados_20252: matriculados2025ByDay.get(monthDayKey) ?? 0,
      matriculados_20262: matriculados2026ByDay.get(monthDayKey) ?? 0,
    }))
  }, [
    comparativoInscritos20252Recorte,
    comparativoInscritos20262Recorte,
    comparativoMatriculados20252Recorte,
    comparativoMatriculados20262Recorte,
  ])

  const comparativoDiaADiaFiltrado = useMemo(
    () =>
      comparativoMonthFilter === 'all'
        ? comparativoDiaADia
        : comparativoDiaADia.filter((row) => row.monthKey === comparativoMonthFilter),
    [comparativoDiaADia, comparativoMonthFilter],
  )

  const comparativoDiaADiaTotais = useMemo(
    () =>
      comparativoDiaADiaFiltrado.reduce(
        (accumulator, row) => ({
          inscritos_20252: accumulator.inscritos_20252 + row.inscritos_20252,
          inscritos_20262: accumulator.inscritos_20262 + row.inscritos_20262,
          matriculados_20252: accumulator.matriculados_20252 + row.matriculados_20252,
          matriculados_20262: accumulator.matriculados_20262 + row.matriculados_20262,
        }),
        {
          inscritos_20252: 0,
          inscritos_20262: 0,
          matriculados_20252: 0,
          matriculados_20262: 0,
        },
      ),
    [comparativoDiaADiaFiltrado],
  )

  useEffect(() => {
    if (comparativoMonthFilter === 'all') {
      return
    }

    if (
      comparativoAvailableMonths.length > 0 &&
      !comparativoAvailableMonths.includes(comparativoMonthFilter)
    ) {
      setComparativoMonthFilter(comparativoAvailableMonths[0] ?? 'all')
    }
  }, [comparativoAvailableMonths, comparativoMonthFilter])

  const matriculadosTablesByFilial = useMemo(() => {
    const aggregateByFilial = (filial: 'Asa Sul' | 'Águas Claras') => {
      const rowsMap = new Map<string, FilialTableRow>()

      matriculadosAtivosFiltered.forEach((row) => {
        if (row.filialLabel !== filial) {
          return
        }

        const ingresso = row.ingressoLabel
        if (!['Vestibular', 'ENEM', 'PROUNI'].includes(ingresso)) {
          return
        }

        const mapKey = `${row.cursoLabel}-${row.turnoLabel}`
        const currentRow =
          rowsMap.get(mapKey) ??
          {
            curso: row.cursoLabel,
            turno: row.turnoLabel,
            vestibular: 0,
            enem: 0,
            prouni: 0,
            total: 0,
            manualAdjustmentCount: 0,
          }

        if (ingresso === 'Vestibular') {
          currentRow.vestibular += 1
        } else if (ingresso === 'ENEM') {
          currentRow.enem += 1
        } else if (ingresso === 'PROUNI') {
          currentRow.prouni += 1
        }

        currentRow.total = currentRow.vestibular + currentRow.enem + currentRow.prouni
        rowsMap.set(mapKey, currentRow)
      })

      manualMatriculadosAtivosFiltered.forEach((manualRow) => {
        if (manualRow.filialLabel !== filial) {
          return
        }

        const mapKey = `${manualRow.cursoLabel}-${manualRow.turnoLabel}`
        const currentRow =
          rowsMap.get(mapKey) ??
          {
            curso: manualRow.cursoLabel,
            turno: manualRow.turnoLabel,
            vestibular: 0,
            enem: 0,
            prouni: 0,
            total: 0,
            manualAdjustmentCount: 0,
          }

        currentRow.prouni += 1

        currentRow.manualAdjustmentCount += 1
        currentRow.total = currentRow.vestibular + currentRow.enem + currentRow.prouni
        rowsMap.set(mapKey, currentRow)
      })

      return Array.from(rowsMap.values()).sort((currentItem, nextItem) => {
        if (currentItem.total !== nextItem.total) {
          return nextItem.total - currentItem.total
        }

        return currentItem.curso.localeCompare(nextItem.curso)
      })
    }

    return {
      asaSul: aggregateByFilial('Asa Sul'),
      aguasClaras: aggregateByFilial('Águas Claras'),
    }
  }, [manualMatriculadosAtivosFiltered, matriculadosAtivosFiltered])

  const inscritosActiveFilters = useMemo(
    () =>
      [
        inscritosSelections.campus
          ? {
              label: 'Campus',
              value: inscritosSelections.campus,
              onRemove: () =>
                setInscritosSelections((currentValue) => ({ ...currentValue, campus: undefined })),
            }
          : null,
        inscritosSelections.curso
          ? {
              label: 'Curso',
              value: inscritosSelections.curso,
              onRemove: () =>
                setInscritosSelections((currentValue) => ({ ...currentValue, curso: undefined })),
            }
          : null,
        inscritosSelections.forma
          ? {
              label: 'Ingresso',
              value: inscritosSelections.forma,
              onRemove: () =>
                setInscritosSelections((currentValue) => ({ ...currentValue, forma: undefined })),
            }
          : null,
        inscritosSelections.turno
          ? {
              label: 'Turno',
              value: inscritosSelections.turno,
              onRemove: () =>
                setInscritosSelections((currentValue) => ({ ...currentValue, turno: undefined })),
            }
          : null,
        inscritosSelections.etapa
          ? {
              label: 'Etapa',
              value: inscritosSelections.etapa,
              onRemove: () =>
                setInscritosSelections((currentValue) => ({ ...currentValue, etapa: undefined })),
            }
          : null,
      ].filter(Boolean) as Array<{ label: string; value: string; onRemove: () => void }>,
    [inscritosSelections],
  )

  const matriculadosActiveFilters = useMemo(
    () =>
      [
        matriculadosSelections.filial
          ? {
              label: 'Filial',
              value: matriculadosSelections.filial,
              onRemove: () =>
                setMatriculadosSelections((currentValue) => ({
                  ...currentValue,
                  filial: undefined,
                })),
            }
          : null,
        matriculadosSelections.curso
          ? {
              label: 'Curso',
              value: matriculadosSelections.curso,
              onRemove: () =>
                setMatriculadosSelections((currentValue) => ({
                  ...currentValue,
                  curso: undefined,
                })),
            }
          : null,
        matriculadosSelections.ingresso
          ? {
              label: 'Ingresso',
              value: matriculadosSelections.ingresso,
              onRemove: () =>
                setMatriculadosSelections((currentValue) => ({
                  ...currentValue,
                  ingresso: undefined,
                })),
            }
          : null,
        matriculadosSelections.turno
          ? {
              label: 'Turno',
              value: matriculadosSelections.turno,
              onRemove: () =>
                setMatriculadosSelections((currentValue) => ({
                  ...currentValue,
                  turno: undefined,
                })),
            }
          : null,
        matriculadosSelections.contrato
          ? {
              label: 'Contrato',
              value: matriculadosSelections.contrato,
              onRemove: () =>
                setMatriculadosSelections((currentValue) => ({
                  ...currentValue,
                  contrato: undefined,
                })),
            }
          : null,
        matriculadosSelections.status
          ? {
              label: 'Status',
              value: matriculadosSelections.status,
              onRemove: () =>
                setMatriculadosSelections((currentValue) => ({
                  ...currentValue,
                  status: undefined,
                })),
            }
          : null,
      ].filter(Boolean) as Array<{ label: string; value: string; onRemove: () => void }>,
    [matriculadosSelections],
  )

  if (loading) {
    return <Loading message="Carregando Dashboard Euro..." />
  }

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar o Dashboard Euro"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadDashboardData()}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Dashboard Euro
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Visão de inscritos e matriculados
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              Os gráficos funcionam como filtros clicáveis. Clique em um curso, turno, ingresso ou etapa para recalcular o restante da aba automaticamente.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadDashboardData()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar dados
          </button>
        </div>

        <div className="mt-6 grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:inline-flex sm:w-auto sm:grid-cols-none">
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition sm:w-auto sm:text-center',
                activeTab === tab.id
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-950',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'inscritos' ? (
        <>
          <FilterPanel
            title="Filtro de inscritos"
            filters={inscritosDateRange}
            onChange={setInscritosDateRange}
            onReset={() => setInscritosDateRange(initialDateRange)}
          />

          <ActiveFilters
            items={inscritosActiveFilters}
            onClear={() => setInscritosSelections({})}
          />

          {inscritosFiltered.length === 0 ? (
            <EmptyState
              title="Nenhum inscrito para os filtros atuais"
              description="Limpe as datas ou os filtros clicados para voltar a visualizar os gráficos desta aba."
            />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {inscritosCards.map((card) => (
                  <KpiCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    helperText={card.helperText}
                    emphasis={card.emphasis}
                  />
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <InteractiveDistributionChart
                  title="Inscritos por campus"
                  description="Distribuição das inscrições entre Asa Sul e Águas Claras."
                  data={inscritosCharts.campus}
                  selectedKey={inscritosSelections.campus}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setInscritosSelections((currentValue) => ({
                      ...currentValue,
                      campus: currentValue.campus === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Inscritos por curso"
                  description="Clique em um curso para recalcular os demais cortes."
                  data={inscritosCharts.cursos}
                  selectedKey={inscritosSelections.curso}
                  viewportWidth={viewportWidth}
                  yAxisWidth={180}
                  minHeight={360}
                  minHeightPerItem={42}
                  maxHeight={360}
                  onSelect={(value) =>
                    setInscritosSelections((currentValue) => ({
                      ...currentValue,
                      curso: currentValue.curso === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Formas de ingresso"
                  description="Recorte de vestibular, graduado e demais portas de entrada."
                  data={inscritosCharts.formas}
                  selectedKey={inscritosSelections.forma}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setInscritosSelections((currentValue) => ({
                      ...currentValue,
                      forma: currentValue.forma === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Turnos"
                  description="Leitura dos turnos com cross-filter ativo."
                  data={inscritosCharts.turnos}
                  selectedKey={inscritosSelections.turno}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setInscritosSelections((currentValue) => ({
                      ...currentValue,
                      turno: currentValue.turno === value ? undefined : value,
                    }))
                  }
                />
              </section>

              <DashboardSection
                title="Spike x Normal por forma de ingresso"
                description="Classificacao dos inscritos filtrados cruzando o CPF da base inscritos_20262 com a base de leads. Se o CPF estiver na base de leads, entra como Spike; o restante entra como Normal."
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  <article className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                      Spike
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                      {formatNumberBR(inscritosOrigemTotais.spike)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {formatPercentBR(
                        inscritosOrigemTotais.total > 0
                          ? (inscritosOrigemTotais.spike / inscritosOrigemTotais.total) * 100
                          : 0,
                        0,
                      )}{' '}
                      do total filtrado.
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Normal
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                      {formatNumberBR(inscritosOrigemTotais.normal)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {formatPercentBR(
                        inscritosOrigemTotais.total > 0
                          ? (inscritosOrigemTotais.normal / inscritosOrigemTotais.total) * 100
                          : 0,
                        0,
                      )}{' '}
                      do total filtrado.
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Total comparado
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                      {formatNumberBR(inscritosOrigemTotais.total)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      CPFs duplicados na base de leads nao aumentam a contagem.
                    </p>
                  </article>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold">
                          Forma de ingresso
                        </th>
                        <th className="px-4 py-3 font-semibold">Spike</th>
                        <th className="px-4 py-3 font-semibold">% no Spike</th>
                        <th className="px-4 py-3 font-semibold">Normal</th>
                        <th className="px-4 py-3 font-semibold">% no Normal</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">% Spike na forma</th>
                        <th className="px-4 py-3 font-semibold">% Normal na forma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inscritosOrigemComparativo.map((row) => (
                        <tr key={row.label} className="border-t border-slate-100">
                          <td className="sticky left-0 z-10 bg-white px-4 py-4 font-semibold text-slate-950">
                            {row.label}
                          </td>
                          <td className="px-4 py-4 text-slate-800">{formatNumberBR(row.spike)}</td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatPercentBR(row.spikeShareOfSpike, 0)}
                          </td>
                          <td className="px-4 py-4 text-slate-800">{formatNumberBR(row.normal)}</td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatPercentBR(row.normalShareOfNormal, 0)}
                          </td>
                          <td className="px-4 py-4 font-semibold text-slate-950">
                            {formatNumberBR(row.total)}
                          </td>
                          <td className="px-4 py-4 text-sky-700">
                            {formatPercentBR(row.spikeShareOfRow, 0)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatPercentBR(row.normalShareOfRow, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td className="sticky left-0 z-10 bg-slate-50 px-4 py-4 font-semibold text-slate-950">
                          Total
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {formatNumberBR(inscritosOrigemTotais.spike)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-700">
                          {formatPercentBR(100, 0)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {formatNumberBR(inscritosOrigemTotais.normal)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-700">
                          {formatPercentBR(100, 0)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {formatNumberBR(inscritosOrigemTotais.total)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-sky-700">
                          {formatPercentBR(
                            inscritosOrigemTotais.total > 0
                              ? (inscritosOrigemTotais.spike / inscritosOrigemTotais.total) * 100
                              : 0,
                            0,
                          )}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-700">
                          {formatPercentBR(
                            inscritosOrigemTotais.total > 0
                              ? (inscritosOrigemTotais.normal / inscritosOrigemTotais.total) * 100
                              : 0,
                            0,
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </DashboardSection>

              <InteractiveDistributionChart
                title="Etapa atual"
                description="Panorama do funil atual de inscricao."
                data={inscritosCharts.etapas}
                selectedKey={inscritosSelections.etapa}
                viewportWidth={viewportWidth}
                onSelect={(value) =>
                  setInscritosSelections((currentValue) => ({
                    ...currentValue,
                    etapa: currentValue.etapa === value ? undefined : value,
                  }))
                }
              />
            </>
          )}
        </>
      ) : null}

      {activeTab === 'matriculados' ? (
        <>
          <FilterPanel
            title="Filtro de matriculados"
            filters={matriculadosDateRange}
            onChange={setMatriculadosDateRange}
            onReset={() => setMatriculadosDateRange(initialDateRange)}
          />

          <ActiveFilters
            items={matriculadosActiveFilters}
            onClear={() => setMatriculadosSelections({})}
          />

          {matriculadosFiltered.length === 0 ? (
            <EmptyState
              title="Nenhum matriculado para os filtros atuais"
              description="Pode ser que a data da baixa esteja vazia em parte da base ou que algum filtro clicado tenha restringido demais o recorte."
            />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {matriculadosCards.map((card) => (
                  <KpiCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    helperText={card.helperText}
                    emphasis={card.emphasis}
                  />
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <InteractiveDistributionChart
                  title="Matrículas por filial"
                  description="Somente calouros, usando data_baixa_do_pagamento como referência."
                  data={matriculadosCharts.filial}
                  selectedKey={matriculadosSelections.filial}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setMatriculadosSelections((currentValue) => ({
                      ...currentValue,
                      filial: currentValue.filial === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Matriculas por curso"
                  description="Clique para focar em um curso e recalcular os demais gráficos."
                  data={matriculadosCharts.cursos}
                  selectedKey={matriculadosSelections.curso}
                  viewportWidth={viewportWidth}
                  yAxisWidth={180}
                  minHeight={360}
                  minHeightPerItem={42}
                  maxHeight={360}
                  onSelect={(value) =>
                    setMatriculadosSelections((currentValue) => ({
                      ...currentValue,
                      curso: currentValue.curso === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Tipos de ingresso"
                  description="Normalizados para leituras como Vestibular e ENEM."
                  data={matriculadosCharts.ingresso}
                  selectedKey={matriculadosSelections.ingresso}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setMatriculadosSelections((currentValue) => ({
                      ...currentValue,
                      ingresso: currentValue.ingresso === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Turnos"
                  description="Distribuicao dos calouros por turno."
                  data={matriculadosCharts.turnos}
                  selectedKey={matriculadosSelections.turno}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setMatriculadosSelections((currentValue) => ({
                      ...currentValue,
                      turno: currentValue.turno === value ? undefined : value,
                    }))
                  }
                />
                <InteractivePieChart
                  title="Contratos ativos x cancelados"
                  description="Leitura visual da coluna contrato para os calouros filtrados."
                  data={matriculadosCharts.contratos}
                  selectedKey={matriculadosSelections.contrato}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setMatriculadosSelections((currentValue) => ({
                      ...currentValue,
                      contrato: currentValue.contrato === value ? undefined : value,
                    }))
                  }
                />
                <InteractiveDistributionChart
                  title="Status academico"
                  description="Leitura da coluna status para os calouros filtrados."
                  data={matriculadosCharts.status}
                  selectedKey={matriculadosSelections.status}
                  viewportWidth={viewportWidth}
                  onSelect={(value) =>
                    setMatriculadosSelections((currentValue) => ({
                      ...currentValue,
                      status: currentValue.status === value ? undefined : value,
                    }))
                  }
                />
              </section>

              <DashboardSection
                title="Tabela por filial"
                description="Duas visoes separadas por filial, contando apenas Vestibular, ENEM e PROUNI para os calouros com contrato ativo."
              >
                <div className="space-y-6">
                  {[
                    { title: 'Asa Sul', rows: matriculadosTablesByFilial.asaSul },
                    { title: 'Águas Claras', rows: matriculadosTablesByFilial.aguasClaras },
                  ].map((table) => (
                    <div key={table.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-base font-semibold text-slate-950">{table.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Cursos e turnos com foco em abertura de novas turmas.
                      </p>

                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr>
                              {['Curso', 'Turno', 'Vestibular', 'ENEM', 'PROUNI', 'Total'].map(
                                (header) => (
                                  <th
                                    key={header}
                                    className="sticky top-0 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-600"
                                  >
                                    {header}
                                  </th>
                                ),
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row) => (
                              <tr
                                key={`${table.title}-${row.curso}-${row.turno}`}
                                className="odd:bg-white/80"
                              >
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-700">
                                  {row.curso}
                                  {row.manualAdjustmentCount > 0 ? ' *' : ''}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-700">
                                  {row.turno}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-medium text-slate-900">
                                  {formatNumberBR(row.vestibular)}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-medium text-slate-900">
                                  {formatNumberBR(row.enem)}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-medium text-slate-900">
                                  {formatNumberBR(row.prouni)}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-semibold text-slate-950">
                                  {formatNumberBR(row.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-950 text-white">
                              <td className="whitespace-nowrap px-4 py-3 font-semibold">Total</td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold">-</td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold">
                                {formatNumberBR(
                                  table.rows.reduce(
                                    (accumulator, row) => accumulator + row.vestibular,
                                    0,
                                  ),
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold">
                                {formatNumberBR(
                                  table.rows.reduce((accumulator, row) => accumulator + row.enem, 0),
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold">
                                {formatNumberBR(
                                  table.rows.reduce(
                                    (accumulator, row) => accumulator + row.prouni,
                                    0,
                                  ),
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold">
                                {formatNumberBR(
                                  table.rows.reduce((accumulator, row) => accumulator + row.total, 0),
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {table.rows.some((row) => row.manualAdjustmentCount > 0) ? (
                        <p className="mt-4 text-xs leading-5 text-slate-500">
                          * Inclui ajustes manuais fora da meta de vendedores. PROUNI referente a
                          2026.1 com matrícula realizada apenas em 2026.2.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </DashboardSection>
            </>
          )}
        </>
      ) : null}

      {activeTab === 'comparativo' ? (
        <>
          <DashboardSection
            title="Visao por filial"
            description="Escolha se voce quer olhar o comparativo consolidado ou focar Asa Sul e Águas Claras separadamente."
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                {(['Todas', 'Asa Sul', 'Águas Claras'] as ComparativeBranchFilter[]).map((branch) => (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => setComparativoBranchFilter(branch)}
                    className={cn(
                      'rounded-2xl px-4 py-2.5 text-sm font-semibold transition',
                      comparativoBranchFilter === branch
                        ? 'bg-slate-950 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-950',
                    )}
                  >
                    {branch}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {([
                    { key: 'full', label: 'Semestre inteiro' },
                    { key: 'to-date', label: 'Até hoje' },
                  ] as Array<{ key: ComparativeRangeMode; label: string }>).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setComparativoRangeMode(option.key)}
                      className={cn(
                        'rounded-2xl px-4 py-2.5 text-sm font-semibold transition',
                        comparativoRangeMode === option.key
                          ? 'bg-slate-950 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-950',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-slate-500">
                  {comparativoRangeMode === 'to-date'
                    ? `Comparando os semestres só até ${formatMonthDayLabel(comparativoTodayMonthDayKey)} em cada ano.`
                    : 'Comparando o semestre inteiro de 2025.2 e 2026.2.'}
                </p>
              </div>
            </div>
          </DashboardSection>

          {comparativoInscritos20252.length === 0 && comparativoMatriculados20252.length === 0 ? (
            <EmptyState
              title={
                comparativoBranchFilter === 'Todas'
                  ? 'Base 2025.2 ainda vazia'
                  : `Sem dados de 2025.2 para ${comparativoBranchFilter}`
              }
              description={
                comparativoBranchFilter === 'Todas'
                  ? 'Assim que as tabelas inscritos_20252 e matriculados_20252 receberem dados, esta aba montará o comparativo automaticamente.'
                  : 'Pode ser que essa filial ainda não tenha registros publicados nas tabelas de 2025.2.'
              }
            />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {comparativoCards.map((card) => (
                  <ComparativeSummaryCard
                    key={card.title}
                    {...card}
                  />
                ))}
              </section>

              <DashboardSection
                title="Comparativo por semestre"
                description="Leitura direta de 2025.2 vs 2026.2 entre inscritos e matriculados, usando somente calouros e excluindo Medicina."
              >
                {viewportWidth < 640 ? (
                  <ComparativeList
                    previousLabel="Inscritos"
                    currentLabel="Matriculados"
                    data={comparativoSemestre.map((item) => ({
                      label: item.semestre,
                      previousValue: item.inscritos,
                      currentValue: item.matriculados,
                    }))}
                  />
                ) : (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparativoSemestre}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="semestre" stroke="#64748b" />
                        <YAxis
                          stroke="#64748b"
                          tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                        />
                        <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
                        <Legend />
                        <Bar
                          dataKey="inscritos"
                          name="Inscritos"
                          fill="#0ea5e9"
                          radius={[8, 8, 0, 0]}
                        >
                          <LabelList
                            dataKey="inscritos"
                            position="top"
                            formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                            style={{
                              fill: '#475569',
                              fontSize: getResponsiveChartTextStyle(viewportWidth).fontSize,
                              fontWeight: 600,
                            }}
                          />
                        </Bar>
                        <Bar
                          dataKey="matriculados"
                          name="Matriculados"
                          fill="#0f172a"
                          radius={[8, 8, 0, 0]}
                        >
                          <LabelList
                            dataKey="matriculados"
                            position="top"
                            formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                            style={{
                              fill: '#475569',
                              fontSize: getResponsiveChartTextStyle(viewportWidth).fontSize,
                              fontWeight: 600,
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </DashboardSection>

              <section className="grid gap-4 sm:grid-cols-2">
                {comparativoContratosCards.map((card) => (
                  <ComparativeSummaryCard
                    key={card.title}
                    {...card}
                  />
                ))}
              </section>

              <DashboardSection
                title="Comparativo por unidade"
                description="Asa Sul e Águas Claras, separando inscritos e matriculados por semestre."
              >
                {viewportWidth < 640 ? (
                  <div className="space-y-4">
                    <ComparativeList
                      previousLabel="Inscritos 2025.2"
                      currentLabel="Inscritos 2026.2"
                      data={comparativoCampus.map((item) => ({
                        label: item.unidade,
                        previousValue: item.inscritos_20252,
                        currentValue: item.inscritos_20262,
                      }))}
                    />
                    <ComparativeList
                      previousLabel="Matriculados 2025.2"
                      currentLabel="Matriculados 2026.2"
                      data={comparativoCampus.map((item) => ({
                        label: `${item.unidade} - Matrículas`,
                        previousValue: item.matriculados_20252,
                        currentValue: item.matriculados_20262,
                      }))}
                    />
                  </div>
                ) : (
                  <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparativoCampus}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="unidade" stroke="#64748b" />
                      <YAxis
                        stroke="#64748b"
                        tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                      />
                      <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
                      <Legend />
                      <Bar dataKey="inscritos_20252" name="Inscritos 2025.2" fill="#38bdf8">
                        <LabelList
                          dataKey="inscritos_20252"
                          position="top"
                          formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                          style={{
                            fill: '#475569',
                            fontSize: getResponsiveChartTextStyle(viewportWidth).fontSize,
                            fontWeight: 600,
                          }}
                        />
                      </Bar>
                      <Bar dataKey="inscritos_20262" name="Inscritos 2026.2" fill="#0284c7">
                        <LabelList
                          dataKey="inscritos_20262"
                          position="top"
                          formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                          style={{
                            fill: '#475569',
                            fontSize: getResponsiveChartTextStyle(viewportWidth).fontSize,
                            fontWeight: 600,
                          }}
                        />
                      </Bar>
                      <Bar dataKey="matriculados_20252" name="Matriculados 2025.2" fill="#94a3b8">
                        <LabelList
                          dataKey="matriculados_20252"
                          position="top"
                          formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                          style={{
                            fill: '#475569',
                            fontSize: getResponsiveChartTextStyle(viewportWidth).fontSize,
                            fontWeight: 600,
                          }}
                        />
                      </Bar>
                      <Bar dataKey="matriculados_20262" name="Matriculados 2026.2" fill="#0f172a">
                        <LabelList
                          dataKey="matriculados_20262"
                          position="top"
                          formatter={(value: number) => formatNumberBR(Number(value ?? 0))}
                          style={{
                            fill: '#475569',
                            fontSize: getResponsiveChartTextStyle(viewportWidth).fontSize,
                            fontWeight: 600,
                          }}
                        />
                      </Bar>
                    </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </DashboardSection>

              <section className="grid gap-6 xl:grid-cols-2">
                <DashboardSection
                  title="Formas de ingresso"
                  description="Top entradas de inscritos comparando as duas captações."
                >
                  {viewportWidth < 640 ? (
                    <ComparativeList
                      data={comparativoFormasIngresso.map((item) => ({
                        label: item.label,
                        previousValue: item.inscritos_20252,
                        currentValue: item.inscritos_20262,
                      }))}
                    />
                  ) : (
                    <div className="h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparativoFormasIngresso} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          type="number"
                          stroke="#64748b"
                          tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={140}
                          stroke="#64748b"
                          tick={(props) => renderWrappedAxisTick(props, 18)}
                        />
                        <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
                        <Legend />
                        <Bar dataKey="inscritos_20252" name="2025.2" fill="#38bdf8" radius={[0, 10, 10, 0]}>
                          <LabelList
                            dataKey="inscritos_20252"
                            content={renderBarValueLabel}
                          />
                        </Bar>
                        <Bar dataKey="inscritos_20262" name="2026.2" fill="#0f172a" radius={[0, 10, 10, 0]}>
                          <LabelList
                            dataKey="inscritos_20262"
                            content={renderBarValueLabel}
                          />
                        </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </DashboardSection>

                <DashboardSection
                  title="Cursos com mais matrículas"
                  description="Top cursos de calouros para comparar a forca de fechamento entre 2025.2 e 2026.2, exceto Medicina."
                >
                  {viewportWidth < 640 ? (
                    <ComparativeList
                      data={comparativoCursos.map((item) => ({
                        label: item.label,
                        previousValue: item.matriculados_20252,
                        currentValue: item.matriculados_20262,
                      }))}
                    />
                  ) : (
                    <div className="h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparativoCursos} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          type="number"
                          stroke="#64748b"
                          tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={150}
                          stroke="#64748b"
                          tick={(props) => renderWrappedAxisTick(props, 18)}
                        />
                        <Tooltip formatter={(value) => formatNumberBR(Number(value ?? 0))} />
                        <Legend />
                        <Bar dataKey="matriculados_20252" name="2025.2" fill="#94a3b8" radius={[0, 10, 10, 0]}>
                          <LabelList
                            dataKey="matriculados_20252"
                            content={renderBarValueLabel}
                          />
                        </Bar>
                        <Bar dataKey="matriculados_20262" name="2026.2" fill="#0f172a" radius={[0, 10, 10, 0]}>
                          <LabelList
                            dataKey="matriculados_20262"
                            content={renderBarValueLabel}
                          />
                        </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </DashboardSection>
              </section>

              <DashboardSection
                title="Dia a dia alinhado"
                description="Compara a mesma data do calendario entre 2025 e 2026, como 01/05/2025 contra 01/05/2026."
              >
                <div className="mb-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <div className="space-y-3">
                      <p className="max-w-2xl text-sm leading-6 text-slate-500">
                        Por padrão mostramos o mês atual de 2026.2. Troque o recorte para ver o
                        acumulado completo ou focar um mesmo momento do calendario entre os dois
                        semestres.
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                          Base de navegacao: 2026.2
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                          {comparativoRangeMode === 'to-date'
                            ? `Mesmo ponto do ano até ${formatMonthDayLabel(comparativoTodayMonthDayKey)}`
                            : 'Semestre completo'}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[auto_auto]">
                      <div className="space-y-2">
                        <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Recorte
                        </span>
                        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                          {([
                            { key: 'full', label: 'Semestre inteiro' },
                            { key: 'to-date', label: 'Até hoje' },
                          ] as Array<{ key: ComparativeRangeMode; label: string }>).map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setComparativoRangeMode(option.key)}
                              className={cn(
                                'rounded-2xl px-4 py-2.5 text-sm font-semibold transition',
                                comparativoRangeMode === option.key
                                  ? 'bg-slate-950 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-950',
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Mês de 2026.2
                        </span>
                        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                          <div className="overflow-x-auto pb-1">
                            <div className="inline-flex min-w-full gap-2 pr-1 xl:min-w-0 xl:justify-end">
                              <button
                                type="button"
                                onClick={() => setComparativoMonthFilter('all')}
                                className={cn(
                                  'shrink-0 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition',
                                  comparativoMonthFilter === 'all'
                                    ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950',
                                )}
                              >
                                Todos
                              </button>

                              {comparativoAvailableMonths.map((monthKey) => (
                                <button
                                  key={monthKey}
                                  type="button"
                                  onClick={() => setComparativoMonthFilter(monthKey)}
                                  className={cn(
                                    'shrink-0 rounded-2xl border px-4 py-2.5 text-sm font-semibold capitalize transition',
                                    comparativoMonthFilter === monthKey
                                      ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950',
                                  )}
                                >
                                  {formatMonthLabel(monthKey)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {comparativoDiaADiaFiltrado.length === 0 ? (
                  <EmptyState
                    title="Sem movimentos nesse recorte mensal"
                    description="Troque o mês no filtro acima para ver outro período ou volte para todos os meses."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr>
                          {[
                            'Dia',
                            'Inscritos 2025.2',
                            'Inscritos 2026.2',
                            'Delta inscritos',
                            'Matriculados 2025.2',
                            'Matriculados 2026.2',
                            'Delta matriculados',
                          ].map((header) => (
                            <th
                              key={header}
                              className="sticky top-0 whitespace-nowrap border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-600"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparativoDiaADiaFiltrado.map((row) => (
                          <tr key={row.monthDayKey} className="odd:bg-slate-50/70">
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-medium text-slate-700">
                              {row.label}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-900">
                              {formatNumberBR(row.inscritos_20252)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-900">
                              {formatNumberBR(row.inscritos_20262)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-medium text-slate-900">
                              {formatDeltaLabel(row.inscritos_20262, row.inscritos_20252)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-900">
                              {formatNumberBR(row.matriculados_20252)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-900">
                              {formatNumberBR(row.matriculados_20262)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 font-medium text-slate-900">
                              {formatDeltaLabel(row.matriculados_20262, row.matriculados_20252)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-950 text-white">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">Total</td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatNumberBR(comparativoDiaADiaTotais.inscritos_20252)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatNumberBR(comparativoDiaADiaTotais.inscritos_20262)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatDeltaLabel(
                              comparativoDiaADiaTotais.inscritos_20262,
                              comparativoDiaADiaTotais.inscritos_20252,
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatNumberBR(comparativoDiaADiaTotais.matriculados_20252)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatNumberBR(comparativoDiaADiaTotais.matriculados_20262)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatDeltaLabel(
                              comparativoDiaADiaTotais.matriculados_20262,
                              comparativoDiaADiaTotais.matriculados_20252,
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </DashboardSection>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
