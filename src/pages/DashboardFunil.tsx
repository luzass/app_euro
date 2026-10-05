import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
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
import {
  fetchAllRows,
  getUniqueCpfCount,
  matchesStudentType,
  normalizeCampus,
  normalizeCpf,
  normalizeIngresso,
  normalizeText,
  pickText,
  titleize,
  type GenericRow,
  type StudentTypeFilter,
} from '../lib/dashboardHelpers'
import { formatNumberBR } from '../lib/formatters'
import { isSupabaseConfigured, normalizeSupabaseError } from '../lib/supabase'

interface FunilState {
  loading: boolean
  error: string | null
  leads: GenericRow[]
  inscritos: GenericRow[]
  matriculados: GenericRow[]
}

type CombinedOrigin = 'Lead' | 'Inscrito' | 'Matriculado'
type FunilChartKey = 'origin' | 'curso' | 'campus' | 'processo' | 'turno'
type FunilChartSelections = Record<FunilChartKey, string[]>

interface CombinedRow {
  origin: CombinedOrigin
  cpf: string
  curso: string
  campus: string
  processo: string
  turno: string
}

const initialState: FunilState = {
  loading: true,
  error: null,
  leads: [],
  inscritos: [],
  matriculados: [],
}

const activeFunnelTables = {
  inscritos: 'inscritos_20271',
  matriculados: 'matriculados_20271',
}
const activeFunnelPeriod = '2027.1'

const initialChartSelections: FunilChartSelections = {
  origin: [],
  curso: [],
  campus: [],
  processo: [],
  turno: [],
}

function buildCpfSet(rows: GenericRow[]) {
  const cpfs = new Set<string>()

  rows.forEach((row) => {
    const cpf = normalizeCpf(row.cpf)

    if (cpf) {
      cpfs.add(cpf)
    }
  })

  return cpfs
}

function buildMergedCpfSet(...sets: Set<string>[]) {
  const merged = new Set<string>()

  sets.forEach((set) => {
    set.forEach((cpf) => merged.add(cpf))
  })

  return merged
}

function matchesActiveFunnelPeriod(row: GenericRow) {
  const periodText = normalizeText(
    pickText(row, [
      'ano_semestre',
      'anoSemestre',
      'periodo_letivo',
      'periodoLetivo',
      'semestre',
      'ANO/SEMESTRE',
      'PERIODO LETIVO',
      'SEMESTRE',
    ]),
  )
  const compactPeriod = periodText.replace(/\D/g, '')
  const activeCompactPeriod = activeFunnelPeriod.replace(/\D/g, '')

  return periodText.includes(activeFunnelPeriod) || compactPeriod === activeCompactPeriod
}

function countUniqueCpfBy(
  rows: CombinedRow[],
  getLabel: (row: CombinedRow) => string,
  options: { includeEmpty?: boolean } = {},
) {
  const includeEmpty = options.includeEmpty ?? false
  const totals = new Map<string, Set<string>>()

  rows.forEach((row, index) => {
    const label = getLabel(row).trim() || 'Não informado'

    if (!includeEmpty && label === 'Não informado') {
      return
    }

    if (!totals.has(label)) {
      totals.set(label, new Set<string>())
    }

    totals.get(label)?.add(row.cpf || `${label}-${index}`)
  })

  return Array.from(totals, ([label, cpfs]) => ({ label, value: cpfs.size })).sort(
    (a, b) => b.value - a.value,
  )
}

function mapLead(row: GenericRow): CombinedRow {
  return {
    origin: 'Lead',
    cpf: normalizeCpf(row.cpf),
    curso: titleize(pickText(row, ['curso', 'Curso'])),
    campus: normalizeCampus(pickText(row, ['campus', 'Campus'])),
    turno: titleize(pickText(row, ['turno', 'Turno', 'TURNO'])),
    processo: normalizeIngresso(
      pickText(row, [
        'forma_de_ingresso',
        'forma_ingresso',
        'forma_ingresso_inscricao',
        'Forma de Ingresso',
      ]),
    ),
  }
}

function mapInscrito(row: GenericRow): CombinedRow {
  return {
    origin: 'Inscrito',
    cpf: normalizeCpf(row.cpf),
    curso: titleize(pickText(row, ['curso'])),
    campus: normalizeCampus(pickText(row, ['campus'])),
    turno: titleize(pickText(row, ['turno'])),
    processo: normalizeIngresso(pickText(row, ['forma_de_ingresso'])),
  }
}

function mapMatriculado(row: GenericRow): CombinedRow {
  return {
    origin: 'Matriculado',
    cpf: normalizeCpf(row.cpf),
    curso: titleize(pickText(row, ['curso'])),
    campus: normalizeCampus(pickText(row, ['filial', 'campus'])),
    turno: titleize(pickText(row, ['turno'])),
    processo: normalizeIngresso(pickText(row, ['tipo_de_ingresso'])),
  }
}

function ChartCard({
  title,
  data,
  chartKey,
  selectedValues,
  onSelect,
}: {
  title: string
  data: Array<{ label: string; value: number }>
  chartKey: FunilChartKey
  selectedValues: string[]
  onSelect: (chartKey: FunilChartKey, label: string, event?: unknown) => void
}) {
  const chartHeight = Math.max(240, data.length * 34)
  const hasSelection = selectedValues.length > 0

  return (
    <section className="flex h-[430px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>

      {data.length ? (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
          <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={154}
                interval={0}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(value) => formatNumberBR(Number(value))} />
              <Bar
                dataKey="value"
                radius={[0, 10, 10, 0]}
                cursor="pointer"
                onClick={(payload, _index, event) => {
                  const label = String(payload?.payload?.label ?? '')
                  if (label) {
                    onSelect(chartKey, label, event)
                  }
                }}
              >
                {data.map((row) => {
                  const selected = selectedValues.includes(row.label)

                  return (
                    <Cell
                      key={row.label}
                      fill={!hasSelection || selected ? '#0ea5e9' : '#cbd5e1'}
                    />
                  )
                })}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(value: number) => formatNumberBR(Number(value))}
                  fill="#0f172a"
                  fontSize={12}
                  fontWeight={700}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Nenhum dado encontrado.
        </p>
      )}
    </section>
  )
}

export function DashboardFunil() {
  const [state, setState] = useState<FunilState>(initialState)
  const [onlyTraffic, setOnlyTraffic] = useState(false)
  const [studentTypeFilter, setStudentTypeFilter] = useState<StudentTypeFilter>('all')
  const [chartSelections, setChartSelections] =
    useState<FunilChartSelections>(initialChartSelections)

  const loadData = async () => {
    if (!isSupabaseConfigured) {
      setState((current) => ({
        ...current,
        loading: false,
        error: 'Configure o Supabase antes de carregar o dashboard.',
      }))
      return
    }

    setState((current) => ({ ...current, loading: true, error: null }))

    const [leadsResult, inscritosResult, matriculadosResult] = await Promise.all([
      fetchAllRows('leads_cursos'),
      fetchAllRows(activeFunnelTables.inscritos),
      fetchAllRows(activeFunnelTables.matriculados),
    ])

    const error =
      leadsResult.error ?? inscritosResult.error ?? matriculadosResult.error ?? null

    if (error) {
      setState({
        loading: false,
        error: normalizeSupabaseError(error),
        leads: [],
        inscritos: [],
        matriculados: [],
      })
      return
    }

    setState({
      loading: false,
      error: null,
      leads: leadsResult.rows,
      inscritos: inscritosResult.rows,
      matriculados: matriculadosResult.rows,
    })
  }

  useEffect(() => {
    void loadData()
  }, [])

  const analysis = useMemo(() => {
    const inscritosCpfSet = buildCpfSet(state.inscritos)
    const matriculadosCpfSet = buildCpfSet(state.matriculados)
    const activePeriodCpfSet = buildMergedCpfSet(inscritosCpfSet, matriculadosCpfSet)
    const periodFilteredLeads = state.leads.filter((row) => {
      const cpf = normalizeCpf(row.cpf)

      return matchesActiveFunnelPeriod(row) || Boolean(cpf && activePeriodCpfSet.has(cpf))
    })
    const leadCpfSet = buildCpfSet(periodFilteredLeads)
    const typeFilteredLeads = periodFilteredLeads.filter((row) =>
      matchesStudentType(row, studentTypeFilter),
    )
    const typeFilteredInscritos = state.inscritos.filter((row) =>
      matchesStudentType(row, studentTypeFilter),
    )
    const typeFilteredMatriculados = state.matriculados.filter((row) =>
      matchesStudentType(row, studentTypeFilter),
    )
    const filteredInscritos = onlyTraffic
      ? typeFilteredInscritos.filter((row) => leadCpfSet.has(normalizeCpf(row.cpf)))
      : typeFilteredInscritos
    const filteredMatriculados = onlyTraffic
      ? typeFilteredMatriculados.filter((row) => leadCpfSet.has(normalizeCpf(row.cpf)))
      : typeFilteredMatriculados

    const combinedRowsBase = [
      ...typeFilteredLeads.map(mapLead),
      ...filteredInscritos.map(mapInscrito),
      ...filteredMatriculados.map(mapMatriculado),
    ]
    const combinedRows = combinedRowsBase.filter((row) => {
      const values: Record<FunilChartKey, string> = {
        origin: row.origin,
        curso: row.curso,
        campus: row.campus,
        processo: row.processo,
        turno: row.turno,
      }

      return (Object.keys(chartSelections) as FunilChartKey[]).every((key) => {
        const selectedValues = chartSelections[key]
        return selectedValues.length === 0 || selectedValues.includes(values[key])
      })
    })

    return {
      leadsCount: getUniqueCpfCount(
        combinedRows.filter((row) => row.origin === 'Lead').map((row) => ({ cpf: row.cpf })),
      ),
      inscritosCount: getUniqueCpfCount(
        combinedRows.filter((row) => row.origin === 'Inscrito').map((row) => ({ cpf: row.cpf })),
      ),
      matriculadosCount: getUniqueCpfCount(
        combinedRows
          .filter((row) => row.origin === 'Matriculado')
          .map((row) => ({ cpf: row.cpf })),
      ),
      courseData: countUniqueCpfBy(combinedRows, (row) => row.curso),
      campusData: countUniqueCpfBy(combinedRows, (row) => row.campus),
      processoData: countUniqueCpfBy(combinedRows, (row) => row.processo),
      turnoData: countUniqueCpfBy(combinedRows, (row) => row.turno),
      sourceData: countUniqueCpfBy(combinedRows, (row) => row.origin, { includeEmpty: true }),
    }
  }, [
    chartSelections,
    onlyTraffic,
    state.inscritos,
    state.leads,
    state.matriculados,
    studentTypeFilter,
  ])

  const handleChartSelect = (chartKey: FunilChartKey, label: string, event?: unknown) => {
    const nativeEvent = event as { ctrlKey?: boolean; metaKey?: boolean } | undefined
    const additive = Boolean(nativeEvent?.ctrlKey || nativeEvent?.metaKey)

    setChartSelections((currentSelections) => {
      const currentValues = currentSelections[chartKey]
      const alreadySelected = currentValues.includes(label)
      const nextValues = alreadySelected
        ? currentValues.filter((currentLabel) => currentLabel !== label)
        : additive
          ? [...currentValues, label]
          : [label]

      return {
        ...currentSelections,
        [chartKey]: nextValues,
      }
    })
  }

  if (state.loading) {
    return <Loading message="Carregando Dashboard - Funil..." />
  }

  if (state.error) {
    return (
      <EmptyState
        title="Não foi possível carregar o Dashboard - Funil"
        description={state.error}
        action={
          <button
            type="button"
            onClick={() => void loadData()}
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
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-600">
              Dashboard - Funil
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Leitura geral do processo seletivo {activeFunnelPeriod}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'calouro', label: 'Calouros' },
              { id: 'veterano', label: 'Veteranos' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStudentTypeFilter(option.id as StudentTypeFilter)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  studentTypeFilter === option.id
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOnlyTraffic((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                onlyTraffic
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Somente tráfego pago
            </button>
            <button
              type="button"
              onClick={() => setChartSelections(initialChartSelections)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              Limpar gráficos
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard title="Leads" value={formatNumberBR(analysis.leadsCount)} helperText="" emphasis="primary" />
        <KpiCard title="Inscritos" value={formatNumberBR(analysis.inscritosCount)} helperText="" />
        <KpiCard title="Matriculados" value={formatNumberBR(analysis.matriculadosCount)} helperText="" />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Funil por origem"
          data={analysis.sourceData}
          chartKey="origin"
          selectedValues={chartSelections.origin}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Curso"
          data={analysis.courseData}
          chartKey="curso"
          selectedValues={chartSelections.curso}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Campus"
          data={analysis.campusData}
          chartKey="campus"
          selectedValues={chartSelections.campus}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Processo seletivo"
          data={analysis.processoData}
          chartKey="processo"
          selectedValues={chartSelections.processo}
          onSelect={handleChartSelect}
        />
        <ChartCard
          title="Turno"
          data={analysis.turnoData}
          chartKey="turno"
          selectedValues={chartSelections.turno}
          onSelect={handleChartSelect}
        />
      </section>
    </div>
  )
}
