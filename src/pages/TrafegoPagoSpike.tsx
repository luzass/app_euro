import { Fragment, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { CalendarRange, Eraser, RefreshCw, Sparkles } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  agruparPorData,
  calcularKPIsCampanha,
  expandCampaignKpis,
  safeDivide,
  type CampaignRow,
  type ExtendedCampaignKpis,
  toNumber,
} from '../lib/calculations'
import {
  formatCompactNumberBR,
  formatCurrencyBR,
  formatDateBR,
  formatDateShortBR,
  formatDecimalBR,
  formatNumberBR,
  formatPercentBR,
} from '../lib/formatters'
import { supabase } from '../lib/supabase'

interface FilterState {
  startDate: string
  endDate: string
}

interface InscritoAnalysisRow {
  cpf: string | null
  campus: string | null
  curso: string | null
  turno: string | null
  forma_de_ingresso: string | null
  etapa_atual: string | null
  data_inscricao: string | null
}

interface MatriculadoAnalysisRow {
  filial: string | null
  curso: string | null
  turno: string | null
  tipo_aluno: string | null
  tipo_de_ingresso: string | null
  contrato: string | null
  status: string | null
  data_baixa_do_pagamento: string | null
}

interface ClarityResumoRow {
  id: number
  created_at: string
  data_referencia: string
  periodo: string | null
  sessions: string | number | null
  bot_sessions: string | number | null
  total_sessions_incluindo_bots: string | number | null
  unique_users: string | number | null
  pages_per_session: string | number | null
  scroll_depth_percentage: string | number | null
  active_time_spent_seconds: string | number | null
  total_time_spent_seconds: string | number | null
}

interface ClarityDeviceRow {
  id: number
  created_at: string
  data_referencia: string
  periodo: string | null
  device: string | null
  sessions: string | number | null
  bot_sessions: string | number | null
  total_sessions_incluindo_bots: string | number | null
  unique_users: string | number | null
  pages_per_session: string | number | null
  session_percentage: string | number | null
}

type ReportType = 'semanal' | 'mensal'

interface ReportRange {
  type: ReportType
  label: string
  startDate: string
  endDate: string
  referenceDate: string
}

interface AnalysisState {
  loading: boolean
  error: string | null
  content: string | null
  reportType: ReportType | null
  lastRangeLabel: string | null
  lastGeneratedAt: string | null
}

interface StoredReport {
  id: string
  dashboard: string
  periodicidade: ReportType
  referencia: string
  periodo_inicio: string
  periodo_fim: string
  conteudo: string
  gerado_por: string | null
  created_at: string
}

type GenericRow = Record<string, unknown>

interface FunilGeralRow {
  impressoes: string | number | null
  alcance: string | number | null
  cliques_link: string | number | null
  landing_page_views: string | number | null
  leads: string | number | null
  inscritos: string | number | null
  matriculas: string | number | null
}

const initialFilters: FilterState = {
  startDate: '',
  endDate: '',
}

const cpfFieldCandidates = [
  'cpf',
  'CPF',
  'cpf_cliente',
  'cpf_aluno',
  'cpf_lead',
  'documento',
  'document',
]

const dateFieldCandidates = [
  'data_inscricao',
  'created_at',
  'createdAt',
  'data_cadastro',
  'data',
  'dt_cadastro',
  'date',
]

const funnelAccentClasses = [
  'from-sky-600 to-sky-500',
  'from-cyan-600 to-cyan-500',
  'from-violet-600 to-violet-500',
  'from-indigo-600 to-indigo-500',
  'from-emerald-600 to-emerald-500',
  'from-amber-500 to-orange-500',
]

const analysisWebhookUrl =
  'https://casa-oceano-n8n.cj1us3.easypanel.host/webhook/gerar_relatorio'

function getDateKey(value?: string | null) {
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
    return value
  }

  const month = `${parsedDate.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsedDate.getDate()}`.padStart(2, '0')
  return `${parsedDate.getFullYear()}-${month}-${day}`
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function atStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

function getPreviousClosedWeekRange(referenceDate = new Date()): ReportRange {
  const normalizedDate = atStartOfDay(referenceDate)
  const mondayOffset = (normalizedDate.getDay() + 6) % 7
  const currentWeekMonday = addDays(normalizedDate, -mondayOffset)
  const periodEnd = addDays(currentWeekMonday, -1)
  const periodStart = addDays(periodEnd, -6)

  return {
    type: 'semanal',
    label: `Semanal • ${formatDateBR(formatDateInput(periodStart))} a ${formatDateBR(formatDateInput(periodEnd))}`,
    startDate: formatDateInput(periodStart),
    endDate: formatDateInput(periodEnd),
    referenceDate: formatDateInput(normalizedDate),
  }
}

function getPreviousMonthRange(referenceDate = new Date()): ReportRange {
  const normalizedDate = atStartOfDay(referenceDate)
  const firstDayOfCurrentMonth = new Date(normalizedDate.getFullYear(), normalizedDate.getMonth(), 1)
  const periodEnd = addDays(firstDayOfCurrentMonth, -1)
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1)

  return {
    type: 'mensal',
    label: `Mensal • ${formatDateBR(formatDateInput(periodStart))} a ${formatDateBR(formatDateInput(periodEnd))}`,
    startDate: formatDateInput(periodStart),
    endDate: formatDateInput(periodEnd),
    referenceDate: formatDateInput(normalizedDate),
  }
}

function titleizeText(value?: string | null) {
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

function formatDurationMinutes(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0 min'
  }

  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60

  if (minutes === 0) {
    return `${remainingSeconds}s`
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`
  }

  return `${minutes} min ${remainingSeconds}s`
}

function normalizeText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function normalizeBranch(value?: string | null) {
  const normalizedValue = normalizeText(value)

  if (normalizedValue.includes('ASA SUL')) {
    return 'Asa Sul'
  }

  if (normalizedValue.includes('AGUAS CLARAS')) {
    return 'Aguas Claras'
  }

  return titleizeText(value)
}

function normalizeIngresso(value?: string | null) {
  const normalizedValue = normalizeText(value)

  if (normalizedValue.includes('PROUNI')) {
    return 'PROUNI'
  }

  if (normalizedValue.includes('VESTIBULAR')) {
    return 'Vestibular'
  }

  if (normalizedValue.includes('ENEM')) {
    return 'ENEM'
  }

  return titleizeText(value)
}

function countByLabel<T>(rows: T[], getLabel: (row: T) => string, limit = 8) {
  const counts = new Map<string, number>()

  rows.forEach((row) => {
    const label = getLabel(row) || 'Não informado'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((currentItem, nextItem) => nextItem.value - currentItem.value)
    .slice(0, limit)
}

function extractAnalysisText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim()
  }

  if (Array.isArray(payload)) {
    const textCandidate = payload
      .map((item) => extractAnalysisText(item))
      .find((value) => value.length > 0)

    return textCandidate ?? JSON.stringify(payload, null, 2)
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const candidateKeys = [
      'analise',
      'analysis',
      'text',
      'message',
      'content',
      'output',
      'result',
      'response',
      'relatorio',
    ]

    for (const key of candidateKeys) {
      const extractedText = extractAnalysisText(record[key])

      if (extractedText) {
        return extractedText
      }
    }

    return JSON.stringify(payload, null, 2)
  }

  return ''
}

function renderAnalysisLine(line: string) {
  const parts = line.split(/(\*[^*]+\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 1) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-slate-950">
          {part.slice(1, -1)}
        </strong>
      )
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>
  })
}

function renderAnalysisContent(content: string) {
  return content.split('\n').map((line, index) => {
    if (!line.trim()) {
      return <div key={`empty-${index}`} className="h-4" />
    }

    return (
      <p key={`line-${index}`} className="text-sm leading-7 text-slate-700">
        {renderAnalysisLine(line)}
      </p>
    )
  })
}

function normalizeCpf(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  const digits = String(value).replace(/\D/g, '')
  return digits.length >= 11 ? digits : null
}

function extractCpfSet(rows: GenericRow[]) {
  const cpfs = new Set<string>()

  for (const row of rows) {
    for (const fieldName of cpfFieldCandidates) {
      const normalizedCpf = normalizeCpf(row[fieldName])

      if (normalizedCpf) {
        cpfs.add(normalizedCpf)
        break
      }
    }
  }

  return cpfs
}

function getGenericRowDateKey(row: GenericRow) {
  for (const fieldName of dateFieldCandidates) {
    const value = row[fieldName]

    if (value !== null && value !== undefined && value !== '') {
      return getDateKey(String(value))
    }
  }

  return ''
}

function applyGenericDateFilter(rows: GenericRow[], filters: FilterState) {
  return rows.filter((row) => {
    const dateKey = getGenericRowDateKey(row)

    if (!filters.startDate && !filters.endDate) {
      return true
    }

    if (!dateKey) {
      return false
    }

    const startDatePass = !filters.startDate || dateKey >= filters.startDate
    const endDatePass = !filters.endDate || dateKey <= filters.endDate

    return startDatePass && endDatePass
  })
}

function countIntersectedCpfs(leadsRows: GenericRow[], matriculadosRows: GenericRow[]) {
  const leadsCpfs = extractCpfSet(leadsRows)
  const matriculadosCpfs = extractCpfSet(matriculadosRows)

  let intersectionCount = 0

  leadsCpfs.forEach((cpf) => {
    if (matriculadosCpfs.has(cpf)) {
      intersectionCount += 1
    }
  })

  return intersectionCount
}

function ChartContainer({
  title,
  description,
  children,
}: PropsWithChildren<{
  title: string
  description: string
}>) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="h-[280px] sm:h-[320px]">{children}</div>
    </section>
  )
}

export function TrafegoPagoSpike() {
  const { profile } = useProfile()
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [leadRows, setLeadRows] = useState<GenericRow[]>([])
  const [inscritoRows, setInscritoRows] = useState<GenericRow[]>([])
  const [matriculados, setMatriculados] = useState(0)
  const [funilGeralRow, setFunilGeralRow] = useState<FunilGeralRow | null>(null)
  const [clarityResumoRows, setClarityResumoRows] = useState<ClarityResumoRow[]>([])
  const [clarityDeviceRows, setClarityDeviceRows] = useState<ClarityDeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    loading: false,
    error: null,
    content: null,
    reportType: null,
    lastRangeLabel: null,
    lastGeneratedAt: null,
  })
  const [storedReports, setStoredReports] = useState<Partial<Record<ReportType, StoredReport>>>({})
  const [reportsLoading, setReportsLoading] = useState(true)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('semanal')

  const loadRows = async () => {
    if (!supabase) {
      setError('Configure o Supabase antes de carregar os dados da campanha.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [
      campaignResponse,
      leadsResponse,
      inscritosResponse,
      matriculadosResponse,
      funilGeralResponse,
      clarityResumoResponse,
      clarityDevicesResponse,
    ] = await Promise.all([
      supabase
        .from('campanha_euro_20262')
        .select('*')
        .order('data_inicio', { ascending: true }),
      supabase.from('leads_cursos').select('*'),
      supabase.from('inscritos_20262').select('cpf, data_inscricao'),
      supabase.from('matriculados_20262').select('*'),
      supabase
        .from('funil_euro_20262_geral')
        .select(
          'impressoes, alcance, cliques_link, landing_page_views, leads, inscritos, matriculas',
        )
        .limit(1)
        .maybeSingle(),
      supabase
        .from('clarity_resumo_diario')
        .select(
          'id, created_at, data_referencia, periodo, sessions, bot_sessions, total_sessions_incluindo_bots, unique_users, pages_per_session, scroll_depth_percentage, active_time_spent_seconds, total_time_spent_seconds',
        )
        .order('data_referencia', { ascending: true }),
      supabase
        .from('clarity_devices_diario')
        .select(
          'id, created_at, data_referencia, periodo, device, sessions, bot_sessions, total_sessions_incluindo_bots, unique_users, pages_per_session, session_percentage',
        )
        .order('data_referencia', { ascending: true }),
    ])

    if (campaignResponse.error) {
      setError(
        'Não conseguimos buscar a tabela campanha_euro_20262. Confira o nome da tabela e as permissões no Supabase.',
      )
      setRows([])
      setMatriculados(0)
      setLoading(false)
      return
    }

    setRows((campaignResponse.data as CampaignRow[]) ?? [])
    setLeadRows((leadsResponse.data as GenericRow[]) ?? [])
    setInscritoRows((inscritosResponse.data as GenericRow[]) ?? [])
    setFunilGeralRow((funilGeralResponse.data as FunilGeralRow | null) ?? null)
    setClarityResumoRows((clarityResumoResponse.data as ClarityResumoRow[]) ?? [])
    setClarityDeviceRows((clarityDevicesResponse.data as ClarityDeviceRow[]) ?? [])

    if (!leadsResponse.error && !inscritosResponse.error && !matriculadosResponse.error) {
      setMatriculados(
        countIntersectedCpfs(
          (leadsResponse.data as GenericRow[]) ?? [],
          (matriculadosResponse.data as GenericRow[]) ?? [],
        ),
      )
    } else {
      console.warn('Não foi possível calcular matriculados a partir das tabelas extras.', {
        leadsError: leadsResponse.error,
        inscritosError: inscritosResponse.error,
        matriculadosError: matriculadosResponse.error,
      })
      setMatriculados(0)
    }

    if (clarityResumoResponse.error || clarityDevicesResponse.error) {
      console.warn('Não foi possível carregar as tabelas do Clarity.', {
        clarityResumoError: clarityResumoResponse.error,
        clarityDevicesError: clarityDevicesResponse.error,
      })
    }

    if (funilGeralResponse.error) {
      console.warn('Não foi possível carregar a tabela funil_euro_20262_geral.', {
        funilGeralError: funilGeralResponse.error,
      })
    }

    setLoading(false)
  }

  const loadStoredReports = async () => {
    if (!supabase) {
      setReportsLoading(false)
      return
    }

    setReportsLoading(true)

    const { data, error: reportsLoadError } = await supabase
      .from('relatorios_ia')
      .select(
        'id, dashboard, periodicidade, referencia, periodo_inicio, periodo_fim, conteudo, gerado_por, created_at',
      )
      .ilike('dashboard', 'spike')
      .in('periodicidade', ['semanal', 'mensal'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (reportsLoadError) {
      setReportsError(
        'Não foi possível carregar os relatórios salvos. Confira as permissões de leitura da tabela relatorios_ia.',
      )
      setReportsLoading(false)
      return
    }

    const latestReports = (((data as StoredReport[]) ?? []).reduce(
      (accumulator, report) => {
        if (!accumulator[report.periodicidade]) {
          accumulator[report.periodicidade] = report
        }

        return accumulator
      },
      {} as Partial<Record<ReportType, StoredReport>>,
    ))

    setStoredReports(latestReports)
    setReportsError(null)
    setReportsLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    void loadStoredReports()
  }, [])

  useEffect(() => {
    if (storedReports[selectedReportType]) {
      return
    }

    if (storedReports.semanal) {
      setSelectedReportType('semanal')
      return
    }

    if (storedReports.mensal) {
      setSelectedReportType('mensal')
    }
  }, [selectedReportType, storedReports])

  const buildReportPayload = async (range: ReportRange) => {
    if (!supabase) {
      throw new Error('Configure o Supabase antes de gerar o relatório.')
    }

    const campaignRowsForRange = rows.filter((row) => {
      const dateKey = getDateKey(row.data_inicio)
      return dateKey >= range.startDate && dateKey <= range.endDate
    })

    if (campaignRowsForRange.length === 0) {
      throw new Error(
        'Não encontramos dados da campanha para esse período. Ajuste o client_id ou aguarde novos registros.',
      )
    }

    const groupedCampaignRows = agruparPorData(campaignRowsForRange)

    const [
      { data: leadsData, error: leadsError },
      { data: inscritosData, error: inscritosError },
      { data: matriculadosData, error: matriculadosError },
    ] =
      await Promise.all([
        supabase.from('leads_cursos').select('*'),
        supabase
          .from('inscritos_20262')
          .select('cpf, campus, curso, turno, forma_de_ingresso, etapa_atual, data_inscricao'),
        supabase
          .from('matriculados_20262')
          .select(
            'filial, curso, turno, tipo_aluno, tipo_de_ingresso, contrato, status, data_baixa_do_pagamento',
          ),
      ])

    if (leadsError || inscritosError || matriculadosError) {
      throw new Error(
        'Não foi possível buscar leads_cursos, inscritos_20262 ou matriculados_20262 para montar o relatório.',
      )
    }

    const leadsRows = applyGenericDateFilter((leadsData as GenericRow[]) ?? [], {
      startDate: range.startDate,
      endDate: range.endDate,
    })

    const inscritosRows = ((inscritosData as InscritoAnalysisRow[]) ?? []).filter((row) => {
      const dateKey = getDateKey(row.data_inscricao)
      return dateKey >= range.startDate && dateKey <= range.endDate
    })

    const matriculadosRows = ((matriculadosData as MatriculadoAnalysisRow[]) ?? []).filter((row) => {
      const dateKey = getDateKey(row.data_baixa_do_pagamento)
      const isCalouro = normalizeText(row.tipo_aluno) === 'CALOURO'
      return isCalouro && dateKey >= range.startDate && dateKey <= range.endDate
    })

    const baseCampaignKpis = expandCampaignKpis(
      calcularKPIsCampanha(campaignRowsForRange),
      matriculadosRows.length,
    )
    const inscritosFromLeads = countIntersectedCpfs(
      leadsRows,
      inscritosRows as unknown as GenericRow[],
    )
    const campaignKpis = baseCampaignKpis

    return {
      dashboard: 'spike',
      periodicidade: range.type,
      referencia_execucao: range.referenceDate,
      periodo: {
        inicio: range.startDate,
        fim: range.endDate,
        label: range.label,
      },
      filtros: {
        client_id: null,
      },
      campaign: {
        registros: campaignRowsForRange.length,
        client_ids: Array.from(
          new Set(
            campaignRowsForRange
              .map((row) => row.client_id?.toString().trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ),
        kpis: campaignKpis,
        funil: [
          { label: 'Impressoes', value: Math.round(campaignKpis.impressoes) },
          { label: 'Alcance', value: Math.round(campaignKpis.alcance) },
          { label: 'Cliques no link', value: Math.round(campaignKpis.cliques_no_link) },
          { label: 'LP Views', value: Math.round(campaignKpis.lp_views) },
          { label: 'Leads', value: Math.round(campaignKpis.lead) },
          { label: 'Inscritos', value: Math.round(inscritosFromLeads) },
          { label: 'Matriculados', value: Math.round(campaignKpis.matriculados) },
        ],
        serie_diaria: groupedCampaignRows,
        tabela_detalhada: campaignRowsForRange.map((row) => ({
          data_inicio: row.data_inicio,
          data_fim: row.data_fim,
          client_id: row.client_id,
          valor_usado: toNumber(row.valor_usado),
          impressoes: toNumber(row.impressoes),
          alcance: toNumber(row.alcance),
          cliques_no_link: toNumber(row.cliques_no_link),
          lp_views: toNumber(row.lp_views),
          mensagens: toNumber(row.mensagens),
          lead: toNumber(row.lead),
        })),
      },
      euro: {
        inscritos: {
          total: inscritosRows.length,
          por_campus: countByLabel(inscritosRows, (row) => normalizeBranch(row.campus), 10),
          por_curso: countByLabel(inscritosRows, (row) => titleizeText(row.curso), 10),
          por_forma_ingresso: countByLabel(
            inscritosRows,
            (row) => titleizeText(row.forma_de_ingresso),
            10,
          ),
          por_etapa: countByLabel(inscritosRows, (row) => titleizeText(row.etapa_atual), 10),
        },
        matriculados: {
          total: matriculadosRows.length,
          por_filial: countByLabel(matriculadosRows, (row) => normalizeBranch(row.filial), 10),
          por_curso: countByLabel(matriculadosRows, (row) => titleizeText(row.curso), 10),
          por_ingresso: countByLabel(
            matriculadosRows,
            (row) => normalizeIngresso(row.tipo_de_ingresso),
            10,
          ),
          contratos: countByLabel(matriculadosRows, (row) => titleizeText(row.contrato), 10),
          status: countByLabel(matriculadosRows, (row) => titleizeText(row.status), 10),
        },
      },
    }
  }

  const handleGenerateAnalysis = async (reportType: ReportType) => {
    const reportRange =
      reportType === 'semanal' ? getPreviousClosedWeekRange() : getPreviousMonthRange()

    setSelectedReportType(reportType)
    setAnalysisState({
      loading: true,
      error: null,
      content: null,
      reportType,
      lastRangeLabel: reportRange.label,
      lastGeneratedAt: null,
    })

    try {
      const payload = await buildReportPayload(reportRange)

      const response = await fetch(analysisWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Webhook retornou ${response.status}.`)
      }

      const contentType = response.headers.get('content-type') ?? ''
      const responsePayload = contentType.includes('application/json')
        ? await response.json()
        : await response.text()

      const analysisText = extractAnalysisText(responsePayload)

      const generatedAt = new Date().toISOString()

      if (analysisText && supabase) {
        const { data: insertedReports, error: reportInsertError } = await supabase
          .from('relatorios_ia')
          .insert({
            dashboard: 'spike',
            periodicidade: reportRange.type,
            referencia: reportRange.referenceDate,
            periodo_inicio: reportRange.startDate,
            periodo_fim: reportRange.endDate,
            conteudo: analysisText,
            gerado_por: profile?.id ?? null,
          })
          .select(
            'id, dashboard, periodicidade, referencia, periodo_inicio, periodo_fim, conteudo, gerado_por, created_at',
          )
          .limit(1)

        if (reportInsertError) {
          setReportsError(
            'O relatório foi gerado, mas não conseguimos salvar o texto em relatorios_ia.',
          )
        } else {
          const insertedReport = (insertedReports?.[0] as StoredReport | undefined) ?? {
            id: `local-${reportRange.type}-${generatedAt}`,
            dashboard: 'spike',
            periodicidade: reportRange.type,
            referencia: reportRange.referenceDate,
            periodo_inicio: reportRange.startDate,
            periodo_fim: reportRange.endDate,
            conteudo: analysisText,
            gerado_por: profile?.id ?? null,
            created_at: generatedAt,
          }

          setStoredReports((currentValue) => ({
            ...currentValue,
            [reportRange.type]: insertedReport,
          }))
          setReportsError(null)
          setSelectedReportType(reportRange.type)
        }
      }

      setAnalysisState({
        loading: false,
        error: analysisText ? null : 'O webhook respondeu, mas o texto da análise veio vazio.',
        content: analysisText || null,
        reportType,
        lastRangeLabel: reportRange.label,
        lastGeneratedAt: generatedAt,
      })
    } catch (generationError) {
      setAnalysisState({
        loading: false,
        error:
          generationError instanceof Error
            ? generationError.message
            : 'Não foi possível gerar o relatório agora.',
        content: null,
        reportType,
        lastRangeLabel: reportRange.label,
        lastGeneratedAt: null,
      })
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const dateKey = getDateKey(row.data_inicio)
      const startDatePass = !filters.startDate || dateKey >= filters.startDate
      const endDatePass = !filters.endDate || dateKey <= filters.endDate

      return startDatePass && endDatePass
    })
  }, [filters.endDate, filters.startDate, rows])

  const clarityResumoFiltered = useMemo(() => {
    return clarityResumoRows.filter((row) => {
      const dateKey = getDateKey(row.data_referencia)
      const startDatePass = !filters.startDate || dateKey >= filters.startDate
      const endDatePass = !filters.endDate || dateKey <= filters.endDate

      return startDatePass && endDatePass
    })
  }, [clarityResumoRows, filters.endDate, filters.startDate])

  const clarityDeviceFiltered = useMemo(() => {
    return clarityDeviceRows.filter((row) => {
      const dateKey = getDateKey(row.data_referencia)
      const startDatePass = !filters.startDate || dateKey >= filters.startDate
      const endDatePass = !filters.endDate || dateKey <= filters.endDate

      return startDatePass && endDatePass
    })
  }, [clarityDeviceRows, filters.endDate, filters.startDate])

  const filteredLeadRows = useMemo(
    () => applyGenericDateFilter(leadRows, filters),
    [filters, leadRows],
  )

  const filteredInscritoRows = useMemo(
    () => applyGenericDateFilter(inscritoRows, filters),
    [filters, inscritoRows],
  )

  const groupedRows = useMemo(() => agruparPorData(filteredRows), [filteredRows])
  const baseKpis = useMemo(() => calcularKPIsCampanha(filteredRows), [filteredRows])
  const kpis = useMemo<ExtendedCampaignKpis>(
    () => expandCampaignKpis(baseKpis, matriculados),
    [baseKpis, matriculados],
  )

  const operationalLeadsCount = useMemo(
    () => filteredLeadRows.length,
    [filteredLeadRows],
  )
  const inscritosGeradosNoPeriodo = useMemo(
    () => countIntersectedCpfs(filteredLeadRows, filteredInscritoRows),
    [filteredInscritoRows, filteredLeadRows],
  )
  const inscritosForTrafficCards = useMemo(
    () =>
      funilGeralRow && toNumber(funilGeralRow.inscritos) > 0
        ? toNumber(funilGeralRow.inscritos)
        : inscritosGeradosNoPeriodo,
    [funilGeralRow, inscritosGeradosNoPeriodo],
  )

  const funnelSteps = useMemo(
    () => [
      {
        label: 'Impressoes',
        value: Math.round(
          funilGeralRow ? toNumber(funilGeralRow.impressoes) : kpis.impressoes,
        ),
      },
      {
        label: 'Alcance',
        value: Math.round(funilGeralRow ? toNumber(funilGeralRow.alcance) : kpis.alcance),
      },
      {
        label: 'Cliques no link',
        value: Math.round(
          funilGeralRow ? toNumber(funilGeralRow.cliques_link) : kpis.cliques_no_link,
        ),
      },
      {
        label: 'LP Views',
        value: Math.round(
          funilGeralRow ? toNumber(funilGeralRow.landing_page_views) : kpis.lp_views,
        ),
      },
      {
        label: 'Leads',
        value: Math.round(funilGeralRow ? toNumber(funilGeralRow.leads) : operationalLeadsCount),
      },
      {
        label: 'Inscritos',
        value: Math.round(
          funilGeralRow ? toNumber(funilGeralRow.inscritos) : inscritosGeradosNoPeriodo,
        ),
      },
      {
        label: 'Matriculados',
        value: Math.round(
          funilGeralRow ? toNumber(funilGeralRow.matriculas) : kpis.matriculados,
        ),
      },
    ],
    [
      funilGeralRow,
      inscritosGeradosNoPeriodo,
      kpis.alcance,
      kpis.cliques_no_link,
      kpis.impressoes,
      kpis.lp_views,
      kpis.matriculados,
      operationalLeadsCount,
    ],
  )

  const topOfFunnel = funnelSteps[0]?.value ?? 0

  const latestClarityDate = useMemo(
    () =>
      clarityResumoFiltered.reduce((latestDate, row) => {
        const dateKey = getDateKey(row.data_referencia)
        return dateKey > latestDate ? dateKey : latestDate
      }, ''),
    [clarityResumoFiltered],
  )

  const latestClarityResumo = useMemo(
    () =>
      clarityResumoFiltered.find(
        (row) => getDateKey(row.data_referencia) === latestClarityDate,
      ) ?? null,
    [clarityResumoFiltered, latestClarityDate],
  )

  const latestClarityDevices = useMemo(
    () => {
      const averageUsersByDevice = clarityDeviceFiltered.reduce(
        (accumulator, row) => {
          const deviceLabel = titleizeText(row.device)
          const currentValue = accumulator.get(deviceLabel) ?? {
            totalUniqueUsers: 0,
            totalRows: 0,
          }

          currentValue.totalUniqueUsers += toNumber(row.unique_users)
          currentValue.totalRows += 1
          accumulator.set(deviceLabel, currentValue)
          return accumulator
        },
        new Map<string, { totalUniqueUsers: number; totalRows: number }>(),
      )

      return clarityDeviceFiltered
        .filter((row) => getDateKey(row.data_referencia) === latestClarityDate)
        .map((row) => {
          const deviceLabel = titleizeText(row.device)
          const deviceAverage = averageUsersByDevice.get(deviceLabel)

          return {
            device: deviceLabel,
            sessions: toNumber(row.sessions),
            uniqueUsers: toNumber(row.unique_users),
            averageUniqueUsers:
              deviceAverage && deviceAverage.totalRows > 0
                ? deviceAverage.totalUniqueUsers / deviceAverage.totalRows
                : 0,
            sessionPercentage: toNumber(row.session_percentage),
          }
        })
        .sort((currentItem, nextItem) => nextItem.sessions - currentItem.sessions)
    },
    [clarityDeviceFiltered, latestClarityDate],
  )

  const claritySeries = useMemo(
    () =>
      clarityResumoFiltered.map((row) => ({
        date: getDateKey(row.data_referencia),
        sessions: toNumber(row.sessions),
        unique_users: toNumber(row.unique_users),
        pages_per_session: toNumber(row.pages_per_session),
        scroll_depth_percentage: toNumber(row.scroll_depth_percentage),
        active_time_spent_seconds: toNumber(row.active_time_spent_seconds),
      })),
    [clarityResumoFiltered],
  )

  const clarityPeriodCards = useMemo(() => {
    if (clarityResumoFiltered.length === 0) {
      return []
    }

    const totalSessions = clarityResumoFiltered.reduce(
      (accumulator, row) => accumulator + toNumber(row.sessions),
      0,
    )
    const totalUniqueUsers = clarityResumoFiltered.reduce(
      (accumulator, row) => accumulator + toNumber(row.unique_users),
      0,
    )
    const weightedPagesPerSession =
      totalSessions > 0
        ? clarityResumoFiltered.reduce(
            (accumulator, row) =>
              accumulator + toNumber(row.pages_per_session) * toNumber(row.sessions),
            0,
          ) / totalSessions
        : 0
    const weightedScrollDepth =
      totalSessions > 0
        ? clarityResumoFiltered.reduce(
            (accumulator, row) =>
              accumulator +
              toNumber(row.scroll_depth_percentage) * toNumber(row.sessions),
            0,
          ) / totalSessions
        : 0
    const weightedActiveTime =
      totalSessions > 0
        ? clarityResumoFiltered.reduce(
            (accumulator, row) =>
              accumulator +
              toNumber(row.active_time_spent_seconds) * toNumber(row.sessions),
            0,
          ) / totalSessions
        : 0

    return [
      {
        title: 'Sessões no período',
        value: formatNumberBR(totalSessions),
        helperText: 'Somatória das Sessões dentro do recorte filtrado.',
        emphasis: 'primary' as const,
      },
      {
        title: 'usuários únicos somados',
        value: formatNumberBR(totalUniqueUsers),
        helperText: 'Soma diária do Clarity, sem deduplicação entre dias.',
      },
      {
        title: 'páginas por sessão',
        value: formatDecimalBR(weightedPagesPerSession),
        helperText: 'média ponderada pelo volume de Sessões.',
      },
      {
        title: 'Scroll médio do período',
        value: formatPercentBR(weightedScrollDepth),
        helperText: 'média ponderada da profundidade de rolagem.',
      },
      {
        title: 'Tempo ativo médio',
        value: formatDurationMinutes(weightedActiveTime),
        helperText: 'média ponderada do tempo ativo por sessão.',
      },
    ]
  }, [clarityResumoFiltered])

  const clarityCards = useMemo(
    () =>
      latestClarityResumo
        ? [
            {
              title: 'Sessões no dia',
              value: formatNumberBR(toNumber(latestClarityResumo.sessions)),
              helperText: `Base em ${formatDateBR(latestClarityDate)}.`,
              emphasis: 'primary' as const,
            },
            {
              title: 'usuários únicos',
              value: formatNumberBR(toNumber(latestClarityResumo.unique_users)),
              helperText: 'Pessoas únicas navegando na landing page.',
            },
            {
              title: 'páginas por sessão',
              value: formatDecimalBR(toNumber(latestClarityResumo.pages_per_session)),
              helperText: 'Profundidade média de navegacao.',
            },
            {
              title: 'Scroll médio',
              value: formatPercentBR(toNumber(latestClarityResumo.scroll_depth_percentage)),
              helperText: 'Percentual médio de profundidade de rolagem.',
            },
            {
              title: 'Tempo ativo',
              value: formatDurationMinutes(
                toNumber(latestClarityResumo.active_time_spent_seconds),
              ),
              helperText: 'Tempo ativo médio registrado pelo Clarity.',
            },
          ]
        : [],
    [latestClarityDate, latestClarityResumo],
  )

  const kpiCards = useMemo(
    () => [
      {
        title: 'Total gasto',
        value: formatCurrencyBR(kpis.valor_usado),
        helperText: 'Soma do valor usado.',
        emphasis: 'primary' as const,
      },
      {
        title: 'Impressões',
        value: formatNumberBR(kpis.impressoes),
        helperText: 'Total de exibições da campanha.',
      },
      {
        title: 'Alcance',
        value: formatNumberBR(kpis.alcance),
        helperText: 'Pessoas alcançadas no período filtrado.',
      },
      {
        title: 'Frequência media',
        value: formatDecimalBR(kpis.frequencia),
        helperText: 'Quantidade média de exibições por usuário.',
      },
      {
        title: 'CPM',
        value: formatCurrencyBR(kpis.cpm),
        helperText: 'Custo por mil Impressões.',
      },
      {
        title: 'Cliques no link',
        value: formatNumberBR(kpis.cliques_no_link),
        helperText: 'Quantidade de pessoas que clicaram no link.',
      },
      {
        title: 'CPC',
        value: formatCurrencyBR(kpis.cpc),
        helperText: 'Custo por clique no link.',
      },
      {
        title: 'CTR',
        value: formatPercentBR(kpis.ctr),
        helperText: 'Porcentagem de pessoas que clicam no seu anúncio após visualizá-lo.',
      },
      {
        title: 'LP Views',
        value: formatNumberBR(kpis.lp_views),
        helperText: 'Visualizações de landing page.',
      },
      {
        title: 'CPLPV',
        value: formatCurrencyBR(kpis.cplpv),
        helperText: 'Custo por visualização da landing page.',
      },
      {
        title: 'Connect Rate',
        value: formatPercentBR(kpis.connect_rate),
        helperText: 'Porcentagem de pessoas que clicam no seu anúncio e efetivamente chegam a carregar a sua página de destino.',
      },
      {
        title: 'Leads',
        value: formatNumberBR(kpis.lead),
        helperText: 'Total de leads gerados.',
      },
      {
        title: 'Custo por lead',
        value: formatCurrencyBR(kpis.custo_por_lead),
        helperText: 'Valor gasto para gerar cada lead.',
      },
      {
        title: 'Custo por inscrito',
        value: formatCurrencyBR(
          inscritosForTrafficCards > 0
            ? safeDivide(kpis.valor_usado, inscritosForTrafficCards)
            : 0,
        ),
        helperText: 'Valor gasto para gerar cada inscrito.',
      },
      {
        title: 'Matriculados',
        value: formatNumberBR(kpis.matriculados),
        helperText: 'Quantidade total de matriculados.',
      },
      {
        title: 'Custo por matrícula',
        value: formatCurrencyBR(kpis.custo_por_matricula),
        helperText: 'Valor gasto para cada matrícula.',
      },
    ],
    [inscritosForTrafficCards, kpis],
  )

  const selectedStoredReport = storedReports[selectedReportType] ?? null
  const isMobileViewport = viewportWidth < 640
  const selectedSessionReport =
    analysisState.content && analysisState.reportType === selectedReportType
      ? {
          conteudo: analysisState.content,
          created_at: analysisState.lastGeneratedAt,
          periodo_label: analysisState.lastRangeLabel,
        }
      : null

  const reportSection = (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            <Sparkles className="h-3.5 w-3.5" />
            relatório IA
          </div>
          <h3 className="mt-4 text-xl font-semibold text-slate-950">
            Geração de análise por período fechado
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            O botão monta o recorte automaticamente e envia os dados da campanha, dos inscritos e das matrículas do mesmo período.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
              Semanal: segunda anterior até domingo
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
              Mensal: mês anterior completo
            </span>
          </div>
        </div>

        {profile?.role === 'admin' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleGenerateAnalysis('semanal')}
              disabled={analysisState.loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarRange className="h-4 w-4" />
              Gerar semanal
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateAnalysis('mensal')}
              disabled={analysisState.loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarRange className="h-4 w-4" />
              Gerar mensal
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Retorno do relatório</p>
            <p className="mt-1 text-sm text-slate-500">
              {selectedSessionReport?.periodo_label
                ? selectedSessionReport.periodo_label
                : selectedStoredReport
                  ? `${titleizeText(selectedReportType)} • ${formatDateBR(selectedStoredReport.periodo_inicio)} a ${formatDateBR(selectedStoredReport.periodo_fim)}`
                  : 'Quando um admin gerar ou salvar um relatório, o texto aparece aqui.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['semanal', 'mensal'] as ReportType[]).map((reportType) => (
              <button
                key={reportType}
                type="button"
                onClick={() => setSelectedReportType(reportType)}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  selectedReportType === reportType
                    ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                }`}
              >
                Último {reportType}
              </button>
            ))}
          </div>
        </div>

        {analysisState.loading ? (
          <div className="mt-4 rounded-3xl border border-sky-100 bg-white px-4 py-5 text-sm text-slate-600">
            Gerando análise e aguardando a resposta do n8n...
          </div>
        ) : null}

        {!analysisState.loading && analysisState.error ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            {analysisState.error}
          </div>
        ) : null}

        {!analysisState.loading && reportsError ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
            {reportsError}
          </div>
        ) : null}

        {!analysisState.loading && selectedSessionReport ? (
          <article className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Sessão atual
              </span>
              {selectedSessionReport.created_at ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  Gerado em {formatDateBR(selectedSessionReport.created_at)}
                </span>
              ) : null}
            </div>
            <div className="space-y-0">{renderAnalysisContent(selectedSessionReport.conteudo)}</div>
          </article>
        ) : null}

        {!analysisState.loading && !selectedSessionReport && selectedStoredReport ? (
          <article className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Salvo em banco
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Gerado em {formatDateBR(selectedStoredReport.created_at)}
              </span>
            </div>
            <div className="space-y-0">{renderAnalysisContent(selectedStoredReport.conteudo)}</div>
          </article>
        ) : null}

        {!analysisState.loading && reportsLoading && !selectedSessionReport && !selectedStoredReport ? (
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
            Carregando relatórios salvos...
          </div>
        ) : null}

        {!analysisState.loading &&
        !reportsLoading &&
        !selectedSessionReport &&
        !selectedStoredReport ? (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
            {profile?.role === 'admin'
              ? 'Escolha semanal ou mensal para montar o payload e pedir a análise ao n8n.'
              : 'Nenhum relatório salvo foi encontrado ainda para essa Visualização.'}
          </div>
        ) : null}
      </div>
    </section>
  )

  if (loading) {
    return <Loading message="Carregando campanha_euro_20262..." />
  }

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar a campanha"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadRows()}
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
              Tráfego Pago - Spike
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Visão consolidada da Campanha Euro 2026.2
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              Os indicadores abaixo são dados consolidados da campanha do META.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar dados
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Data inicial</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((currentValue) => ({
                  ...currentValue,
                  startDate: event.target.value,
                }))
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
                setFilters((currentValue) => ({
                  ...currentValue,
                  endDate: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilters(initialFilters)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <Eraser className="h-4 w-4" />
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            Registros carregados: {formatNumberBR(rows.length)}
          </span>
          <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700">
            Registros filtrados: {formatNumberBR(filteredRows.length)}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            Matriculados: {formatNumberBR(kpis.matriculados)}
          </span>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum dado encontrado"
          description="A tabela campanha_euro_20262 não retornou registros. Verifique se ela possui dados publicados no Supabase."
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title="Nenhum resultado para os filtros aplicados"
          description="Ajuste o período ou o client_id para visualizar os dados desta campanha."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
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

          <section className="grid gap-6 xl:grid-cols-2">
            <ChartContainer
              title="Investimento por dia"
              description="Gráfico para acompanhar a distribuição do investimento."
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={groupedRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={formatDateShortBR} stroke="#64748b" />
                  <YAxis
                    tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                    stroke="#64748b"
                  />
                  <Tooltip
                    formatter={(value) => formatCurrencyBR(Number(value ?? 0))}
                    labelFormatter={(label) => formatDateBR(String(label))}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor_usado"
                    stroke="#0f172a"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>

            <ChartContainer
              title="Impressões, alcance e cliques por dia"
              description="Comparação diária das métricas de volume e tráfego."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={groupedRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={formatDateShortBR} stroke="#64748b" />
                  <YAxis
                    tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                    stroke="#64748b"
                  />
                  <Tooltip
                    formatter={(value) => formatNumberBR(Number(value ?? 0))}
                    labelFormatter={(label) => formatDateBR(String(label))}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="impressoes"
                    name="Impressoes"
                    stroke="#0284c7"
                    fill="#bae6fd"
                    fillOpacity={0.35}
                  />
                  <Area
                    type="monotone"
                    dataKey="alcance"
                    name="Alcance"
                    stroke="#0f766e"
                    fill="#99f6e4"
                    fillOpacity={0.25}
                  />
                  <Area
                    type="monotone"
                    dataKey="cliques_no_link"
                    name="Cliques"
                    stroke="#7c3aed"
                    fill="#ddd6fe"
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>

            <ChartContainer
              title="LP Views x Leads por dia"
              description="Comparativo diário entre consumo de página e geração de leads."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupedRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={formatDateShortBR} stroke="#64748b" />
                  <YAxis
                    tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                    stroke="#64748b"
                  />
                  <Tooltip
                    formatter={(value) => formatNumberBR(Number(value ?? 0))}
                    labelFormatter={(label) => formatDateBR(String(label))}
                  />
                  <Legend />
                  <Bar
                    dataKey="lp_views"
                    name="LP Views"
                    fill="#0ea5e9"
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    dataKey="lead"
                    name="Leads"
                    fill="#0f172a"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>

            <ChartContainer
              title="Eficiência de média ao longo do tempo"
              description="Leitura diária de CPC, CPM e custo por lead recalculados a partir dos totais."
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={groupedRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={formatDateShortBR} stroke="#64748b" />
                  <YAxis
                    tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                    stroke="#64748b"
                  />
                  <Tooltip
                    formatter={(value) => formatCurrencyBR(Number(value ?? 0))}
                    labelFormatter={(label) => formatDateBR(String(label))}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="cpc" name="CPC" stroke="#0284c7" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="cpm" name="CPM" stroke="#7c3aed" strokeWidth={2.5} />
                  <Line
                    type="monotone"
                    dataKey="custo_por_lead"
                    name="Custo por Lead"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </section>

          <section className="grid items-stretch gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
            <section className="h-full rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h3 className="text-lg font-semibold text-slate-950">Funil da campanha</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Leitura sequencial da campanha, com volumes inteiros e taxa de passagem entre cada etapa.
                </p>
              </div>

              <div className="space-y-4">
                {funnelSteps.map((step, index) => {
                  const previousValue = index === 0 ? step.value : funnelSteps[index - 1].value
                  const conversionFromPrevious =
                    index === 0 ? 100 : safeDivide(step.value, previousValue, 100)
                  const shareOfTop = topOfFunnel > 0 ? safeDivide(step.value, topOfFunnel, 100) : 0

                  return (
                    <article
                      key={step.label}
                      className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Etapa {index + 1}
                          </p>
                          <h4 className="mt-1 text-lg font-semibold text-slate-950">
                            {step.label}
                          </h4>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-2xl font-semibold tracking-tight text-slate-950">
                            {formatNumberBR(step.value)}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-500">
                            {index === 0
                              ? '100% do topo do funil'
                              : `${formatPercentBR(conversionFromPrevious)} da etapa anterior`}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${funnelAccentClasses[index % funnelAccentClasses.length]}`}
                          style={{ width: `${Math.max(shareOfTop, 2)}%` }}
                        />
                      </div>

                      <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                        <span>{formatPercentBR(shareOfTop)} do topo do funil</span>
                        <span>{formatPercentBR(conversionFromPrevious)} de conversão</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="flex min-h-0 flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:h-[1220px]">
              <div className="mb-5">
                <h3 className="text-lg font-semibold text-slate-950">Tabela detalhada</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Tabela com os dados detalhados da campanha de forma diária.
                </p>
              </div>

              {isMobileViewport ? (
                <div className="space-y-3">
                  {[...filteredRows]
                    .sort((currentItem, nextItem) =>
                      getDateKey(nextItem.data_inicio).localeCompare(
                        getDateKey(currentItem.data_inicio),
                      ),
                    )
                    .map((row) => {
                      const valorUsado = toNumber(row.valor_usado)
                      const impressoes = toNumber(row.impressoes)
                      const cliques = toNumber(row.cliques_no_link)
                      const lpViews = toNumber(row.lp_views)
                      const leads = toNumber(row.lead)
                      const cpc = cliques > 0 ? valorUsado / cliques : 0
                      const ctr = impressoes > 0 ? (cliques / impressoes) * 100 : 0
                      const cpm = impressoes > 0 ? (valorUsado / impressoes) * 1000 : 0
                      const custoPorLead = leads > 0 ? valorUsado / leads : 0

                      return (
                        <article
                          key={String(row.id)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Data
                              </p>
                              <p className="mt-1 text-base font-semibold text-slate-950">
                                {formatDateBR(row.data_inicio)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Investimento
                              </p>
                              <p className="mt-1 text-base font-semibold text-slate-950">
                                {formatCurrencyBR(valorUsado)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {[
                              ['Impressoes', formatNumberBR(impressoes)],
                              ['Alcance', formatNumberBR(toNumber(row.alcance))],
                              ['Cliques', formatNumberBR(cliques)],
                              ['LP Views', formatNumberBR(lpViews)],
                              ['Leads', formatNumberBR(leads)],
                              ['CPC', formatCurrencyBR(cpc)],
                              ['CTR', formatPercentBR(ctr)],
                              ['CPM', formatCurrencyBR(cpm)],
                              ['Custo por lead', formatCurrencyBR(custoPorLead)],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-2xl bg-white px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {label}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </article>
                      )
                    })}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-auto rounded-3xl border border-slate-200 bg-slate-50/60 pr-1">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        {[
                          'Data inicio',
                          'Valor usado',
                          'Impressoes',
                          'Alcance',
                          'Cliques',
                          'LP Views',
                          'Leads',
                          'CPC',
                          'CTR',
                          'CPM',
                          'Custo por lead',
                        ].map((header) => (
                          <th
                            key={header}
                            className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-600"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredRows]
                        .sort((currentItem, nextItem) =>
                          getDateKey(nextItem.data_inicio).localeCompare(
                            getDateKey(currentItem.data_inicio),
                          ),
                        )
                        .map((row) => {
                          const valorUsado = toNumber(row.valor_usado)
                          const impressoes = toNumber(row.impressoes)
                          const cliques = toNumber(row.cliques_no_link)
                          const lpViews = toNumber(row.lp_views)
                          const leads = toNumber(row.lead)
                          const cpc = cliques > 0 ? valorUsado / cliques : 0
                          const ctr = impressoes > 0 ? (cliques / impressoes) * 100 : 0
                          const cpm = impressoes > 0 ? (valorUsado / impressoes) * 1000 : 0
                          const custoPorLead = leads > 0 ? valorUsado / leads : 0

                          return (
                            <tr key={String(row.id)} className="odd:bg-slate-50/70">
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatDateBR(row.data_inicio)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 font-medium text-slate-900">
                                {formatCurrencyBR(valorUsado)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatNumberBR(impressoes)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatNumberBR(toNumber(row.alcance))}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatNumberBR(cliques)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatNumberBR(lpViews)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatNumberBR(leads)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatCurrencyBR(cpc)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatPercentBR(ctr)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatCurrencyBR(cpm)}
                              </td>
                              <td className="whitespace-nowrap border-b border-slate-100 bg-white/70 px-4 py-3 text-slate-700">
                                {formatCurrencyBR(custoPorLead)}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-slate-950">Dados da Landing Page</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Leitura de comportamento da página com base no Clarity, usando o mesmo recorte
                de datas aplicado ao restante do dashboard.
              </p>
            </div>

            {clarityCards.length === 0 ? (
              <EmptyState
                title="Sem dados do Clarity para o período atual"
                description="Assim que as tabelas clarity_resumo_diario e clarity_devices_diario tiverem registros dentro do recorte, esta seção será preenchida automaticamente."
              />
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">Consolidado do período</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Leitura geral do recorte filtrado para entender o tamanho da audiencia e a
                    qualidade media da navegacao.
                  </p>
                </div>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {clarityPeriodCards.map((card) => (
                    <KpiCard
                      key={card.title}
                      title={card.title}
                      value={card.value}
                      helperText={card.helperText}
                      emphasis={card.emphasis}
                    />
                  ))}
                </section>

                <div className="mb-4 mt-8">
                  <p className="text-sm font-semibold text-slate-900">Última leitura disponível</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Foto mais recente do Clarity dentro do período para acompanhar o comportamento
                    mais atual da landing page.
                  </p>
                </div>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {clarityCards.map((card) => (
                    <KpiCard
                      key={card.title}
                      title={card.title}
                      value={card.value}
                      helperText={card.helperText}
                      emphasis={card.emphasis}
                    />
                  ))}
                </section>

                <section className="mt-6 grid gap-6 xl:grid-cols-2">
                  <ChartContainer
                    title="Sessões e usuários por dia"
                    description="Série diária do Clarity para acompanhar volume e alcance da landing page."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={claritySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#64748b"
                          tickFormatter={(value) => formatDateShortBR(String(value))}
                        />
                        <YAxis
                          stroke="#64748b"
                          tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                        />
                        <Tooltip
                          formatter={(value) => formatNumberBR(Number(value ?? 0))}
                          labelFormatter={(label) => formatDateBR(String(label))}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="sessions"
                          name="Sessões"
                          stroke="#0ea5e9"
                          strokeWidth={2.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="unique_users"
                          name="usuários únicos"
                          stroke="#0f172a"
                          strokeWidth={2.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  <ChartContainer
                    title="Dispositivos na Última leitura"
                    description="distribuição de Sessões por device na data mais recente do Clarity dentro do filtro."
                  >
                    <div className="flex h-full flex-col gap-4">
                      <div className="min-h-0 flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={latestClarityDevices}
                            layout="vertical"
                            margin={{ top: 0, right: 16, left: 12, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              type="number"
                              stroke="#64748b"
                              tickFormatter={(value) => formatCompactNumberBR(Number(value))}
                            />
                            <YAxis
                              type="category"
                              dataKey="device"
                              width={90}
                              stroke="#64748b"
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                              formatter={(value) => formatNumberBR(Number(value ?? 0))}
                              labelFormatter={(label) => `Device: ${label}`}
                            />
                            <Legend />
                            <Bar
                              dataKey="sessions"
                              name="Sessoes"
                              fill="#0ea5e9"
                              radius={[0, 12, 12, 0]}
                            />
                            <Bar
                              dataKey="averageUniqueUsers"
                              name="Média de usuários"
                              fill="#0f172a"
                              radius={[0, 12, 12, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {latestClarityDevices.map((item) => (
                          <div
                            key={item.device}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-900">
                                {item.device}
                              </span>
                              <span className="text-sm font-semibold text-slate-600">
                                {formatPercentBR(item.sessionPercentage)}
                              </span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-sky-500"
                                style={{
                                  width: `${Math.min(
                                    Math.max(
                                      item.sessionPercentage,
                                      item.sessionPercentage > 0 ? 4 : 0,
                                    ),
                                    100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ChartContainer>


                  <ChartContainer
                    title="Qualidade da visita"
                    description="Profundidade de scroll e páginas por sessão ao longo dos dias filtrados."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={claritySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#64748b"
                          tickFormatter={(value) => formatDateShortBR(String(value))}
                        />
                        <YAxis stroke="#64748b" />
                        <Tooltip
                          formatter={(value, name) =>
                            name === 'Scroll médio'
                              ? formatPercentBR(Number(value ?? 0))
                              : formatDecimalBR(Number(value ?? 0))
                          }
                          labelFormatter={(label) => formatDateBR(String(label))}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="scroll_depth_percentage"
                          name="Scroll médio"
                          stroke="#7c3aed"
                          strokeWidth={2.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="pages_per_session"
                          name="páginas por sessão"
                          stroke="#0f766e"
                          strokeWidth={2.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  <ChartContainer
                    title="Tempo ativo por dia"
                    description="Tempo ativo médio identificado pelo Clarity em cada data."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={claritySeries}>
                        <defs>
                          <linearGradient id="clarityActiveTime" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#64748b"
                          tickFormatter={(value) => formatDateShortBR(String(value))}
                        />
                        <YAxis
                          stroke="#64748b"
                          tickFormatter={(value) => formatDurationMinutes(Number(value ?? 0))}
                        />
                        <Tooltip
                          formatter={(value) => formatDurationMinutes(Number(value ?? 0))}
                          labelFormatter={(label) => formatDateBR(String(label))}
                        />
                        <Area
                          type="monotone"
                          dataKey="active_time_spent_seconds"
                          name="Tempo ativo"
                          stroke="#0ea5e9"
                          fill="url(#clarityActiveTime)"
                          strokeWidth={2.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </section>
              </>
            )}
          </section>

          {reportSection}
        </>
      )}
    </div>
  )
}
