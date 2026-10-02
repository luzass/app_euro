import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import {
  fetchAllRows,
  getUniqueCpfCount,
  matchesStudentType,
  normalizeCampus,
  normalizeIngresso,
  periodTables,
  pickText,
  titleize,
  type GenericRow,
  type StudentTypeFilter,
} from '../lib/dashboardHelpers'
import { formatNumberBR } from '../lib/formatters'
import { isSupabaseConfigured, normalizeSupabaseError } from '../lib/supabase'

type SemesterFilter = '1' | '2'

function getSemesterPeriodLabels(semester: SemesterFilter) {
  return periodTables
    .filter((period) => period.semester === semester)
    .map((period) => period.label)
}

interface PeriodRows {
  period: string
  label: string
  semester: SemesterFilter
  inscritos: GenericRow[]
  matriculados: GenericRow[]
}

interface HistoricoState {
  loading: boolean
  error: string | null
  periods: PeriodRows[]
}

interface GroupedDatum {
  label: string
  inscritos: number
  matriculados: number
}

const initialState: HistoricoState = {
  loading: true,
  error: null,
  periods: [],
}

function incrementGrouped(map: Map<string, GroupedDatum>, label: string, key: 'inscritos' | 'matriculados') {
  const cleanedLabel = label.trim() || 'Não informado'

  if (cleanedLabel === 'Não informado') {
    return
  }

  const current = map.get(cleanedLabel) ?? {
    label: cleanedLabel,
    inscritos: 0,
    matriculados: 0,
  }

  current[key] += 1
  map.set(cleanedLabel, current)
}

function groupByLabel(
  periods: PeriodRows[],
  getInscritoLabel: (row: GenericRow) => string,
  getMatriculadoLabel: (row: GenericRow) => string,
) {
  const totals = new Map<string, GroupedDatum>()

  periods.forEach((period) => {
    period.inscritos.forEach((row) => incrementGrouped(totals, getInscritoLabel(row), 'inscritos'))
    period.matriculados.forEach((row) =>
      incrementGrouped(totals, getMatriculadoLabel(row), 'matriculados'),
    )
  })

  return Array.from(totals.values())
    .sort((a, b) => b.inscritos + b.matriculados - (a.inscritos + a.matriculados))
}

function getInscritoIngresso(row: GenericRow) {
  return normalizeIngresso(pickText(row, ['forma_de_ingresso']))
}

function getMatriculadoIngresso(row: GenericRow) {
  return normalizeIngresso(pickText(row, ['tipo_de_ingresso']))
}

function buildProcessOptions(periods: PeriodRows[]) {
  const totals = new Map<string, number>()

  periods.forEach((period) => {
    period.inscritos.forEach((row) => {
      const label = getInscritoIngresso(row)

      if (label !== 'Não informado') {
        totals.set(label, (totals.get(label) ?? 0) + 1)
      }
    })

    period.matriculados.forEach((row) => {
      const label = getMatriculadoIngresso(row)

      if (label !== 'Não informado') {
        totals.set(label, (totals.get(label) ?? 0) + 1)
      }
    })
  })

  return Array.from(totals, ([label, total]) => ({ label, total })).sort(
    (current, next) => next.total - current.total,
  )
}

function HorizontalGroupedChart({ title, data }: { title: string; data: GroupedDatum[] }) {
  const chartHeight = Math.max(250, data.length * 36)

  return (
    <section className="flex h-[450px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>

      {data.length ? (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
          <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={158}
                interval={0}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(value) => formatNumberBR(Number(value))} />
              <Legend />
              <Bar dataKey="inscritos" name="Inscritos" fill="#0ea5e9" radius={[0, 8, 8, 0]}>
                <LabelList
                  dataKey="inscritos"
                  position="right"
                  formatter={(value: number) => formatNumberBR(Number(value))}
                  fill="#0f172a"
                  fontSize={11}
                  fontWeight={700}
                />
              </Bar>
              <Bar
                dataKey="matriculados"
                name="Matriculados"
                fill="#10b981"
                radius={[0, 8, 8, 0]}
              >
                <LabelList
                  dataKey="matriculados"
                  position="right"
                  formatter={(value: number) => formatNumberBR(Number(value))}
                  fill="#0f172a"
                  fontSize={11}
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

export function DashboardHistorico() {
  const [state, setState] = useState<HistoricoState>(initialState)
  const [semester, setSemester] = useState<SemesterFilter>('1')
  const [studentTypeFilter, setStudentTypeFilter] = useState<StudentTypeFilter>('all')
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([])
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(getSemesterPeriodLabels('1'))

  const loadData = async () => {
    if (!isSupabaseConfigured) {
      setState({
        loading: false,
        error: 'Configure o Supabase antes de carregar o histórico.',
        periods: [],
      })
      return
    }

    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const periods = await Promise.all(
        periodTables.map(async (period) => {
          const [inscritosResult, matriculadosResult] = await Promise.all([
            fetchAllRows(period.inscritosTable),
            fetchAllRows(period.matriculadosTable),
          ])

          if (inscritosResult.error) {
            throw inscritosResult.error
          }

          if (matriculadosResult.error) {
            throw matriculadosResult.error
          }

          return {
            period: period.period,
            label: period.label,
            semester: period.semester,
            inscritos: inscritosResult.rows,
            matriculados: matriculadosResult.rows,
          }
        }),
      )

      setState({ loading: false, error: null, periods })
    } catch (error) {
      setState({
        loading: false,
        error: normalizeSupabaseError(error),
        periods: [],
      })
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const analysis = useMemo(() => {
    const basePeriods = state.periods
      .filter((period) => period.semester === semester)
      .filter((period) => selectedPeriods.includes(period.label))
      .map((period) => ({
        ...period,
        inscritos: period.inscritos.filter((row) => matchesStudentType(row, studentTypeFilter)),
        matriculados: period.matriculados.filter((row) =>
          matchesStudentType(row, studentTypeFilter),
        ),
      }))

    const processOptions = buildProcessOptions(basePeriods)
    const filteredPeriods = basePeriods.map((period) => ({
      ...period,
      inscritos:
        selectedProcesses.length === 0
          ? period.inscritos
          : period.inscritos.filter((row) => selectedProcesses.includes(getInscritoIngresso(row))),
      matriculados:
        selectedProcesses.length === 0
          ? period.matriculados
          : period.matriculados.filter((row) =>
              selectedProcesses.includes(getMatriculadoIngresso(row)),
            ),
    }))

    const timeline = filteredPeriods.map((period) => ({
      periodo: period.label,
      inscritos: getUniqueCpfCount(period.inscritos),
      matriculados: getUniqueCpfCount(period.matriculados),
    }))

    const totalInscritos = filteredPeriods.reduce(
      (total, period) => total + getUniqueCpfCount(period.inscritos),
      0,
    )
    const totalMatriculados = filteredPeriods.reduce(
      (total, period) => total + getUniqueCpfCount(period.matriculados),
      0,
    )

    return {
      filteredPeriods,
      timeline,
      totalInscritos,
      totalMatriculados,
      processOptions,
      campusData: groupByLabel(
        filteredPeriods,
        (row) => normalizeCampus(pickText(row, ['campus'])),
        (row) => normalizeCampus(pickText(row, ['filial', 'campus'])),
      ),
      cursoData: groupByLabel(
        filteredPeriods,
        (row) => titleize(pickText(row, ['curso'])),
        (row) => titleize(pickText(row, ['curso'])),
      ),
      ingressoData: groupByLabel(
        filteredPeriods,
        getInscritoIngresso,
        getMatriculadoIngresso,
      ),
    }
  }, [selectedPeriods, selectedProcesses, semester, state.periods, studentTypeFilter])

  const handleProcessToggle = (process: string) => {
    setSelectedProcesses((currentProcesses) =>
      currentProcesses.includes(process)
        ? currentProcesses.filter((currentProcess) => currentProcess !== process)
        : [...currentProcesses, process],
    )
  }

  const handleSemesterChange = (nextSemester: SemesterFilter) => {
    setSemester(nextSemester)
    setSelectedPeriods(getSemesterPeriodLabels(nextSemester))
  }

  const handlePeriodToggle = (periodLabel: string) => {
    setSelectedPeriods((currentPeriods) =>
      currentPeriods.includes(periodLabel)
        ? currentPeriods.filter((currentPeriod) => currentPeriod !== periodLabel)
        : [...currentPeriods, periodLabel],
    )
  }

  const visiblePeriodOptions = useMemo(
    () => getSemesterPeriodLabels(semester),
    [semester],
  )

  if (state.loading) {
    return <Loading message="Carregando Dashboard - Histórico..." />
  }

  if (state.error) {
    return (
      <EmptyState
        title="Não foi possível carregar o Dashboard - Histórico"
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
              Dashboard - Histórico
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Comparativo de inscritos e matriculados
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
              onClick={() => handleSemesterChange('1')}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                semester === '1'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              PS - 1º Semestre
            </button>
            <button
              type="button"
              onClick={() => handleSemesterChange('2')}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                semester === '2'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              PS - 2º Semestre
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Períodos</h2>
            <p className="mt-2 text-sm text-slate-500">
              Os períodos do semestre escolhido começam selecionados. Clique para remover ou incluir na comparação.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedPeriods(visiblePeriodOptions)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              selectedPeriods.length === visiblePeriodOptions.length
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            Selecionar todos
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visiblePeriodOptions.map((periodLabel) => {
            const selected = selectedPeriods.includes(periodLabel)

            return (
              <button
                key={periodLabel}
                type="button"
                onClick={() => handlePeriodToggle(periodLabel)}
                className={`rounded-2xl border px-4 py-4 text-center text-sm font-semibold transition ${
                  selected
                    ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                }`}
              >
                {periodLabel}
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Processo seletivo</h2>
            <p className="mt-2 text-sm text-slate-500">
              Selecione um ou mais processos para comparar dentro do histórico.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedProcesses([])}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              selectedProcesses.length === 0
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            Todos
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {analysis.processOptions.map((option) => {
            const selected = selectedProcesses.includes(option.label)

            return (
              <button
                key={option.label}
                type="button"
                onClick={() => handleProcessToggle(option.label)}
                className={`flex min-h-20 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className="text-sm font-semibold leading-5">{option.label}</span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    selected ? 'bg-white/15 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  {formatNumberBR(option.total)}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Períodos no recorte"
          value={formatNumberBR(analysis.filteredPeriods.length)}
          helperText=""
          emphasis="primary"
        />
        <KpiCard title="Inscritos" value={formatNumberBR(analysis.totalInscritos)} helperText="" />
        <KpiCard
          title="Matriculados"
          value={formatNumberBR(analysis.totalMatriculados)}
          helperText=""
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Evolução por período</h2>
        <div className="mt-5 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analysis.timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="periodo" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => formatNumberBR(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="inscritos"
                name="Inscritos"
                stroke="#0ea5e9"
                strokeWidth={3}
              >
                <LabelList
                  dataKey="inscritos"
                  position="top"
                  formatter={(value: number) => formatNumberBR(Number(value))}
                  fill="#0f172a"
                  fontSize={12}
                  fontWeight={700}
                />
              </Line>
              <Line
                type="monotone"
                dataKey="matriculados"
                name="Matriculados"
                stroke="#10b981"
                strokeWidth={3}
              >
                <LabelList
                  dataKey="matriculados"
                  position="bottom"
                  formatter={(value: number) => formatNumberBR(Number(value))}
                  fill="#0f172a"
                  fontSize={12}
                  fontWeight={700}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <HorizontalGroupedChart title="Campus" data={analysis.campusData} />
        <HorizontalGroupedChart title="Curso" data={analysis.cursoData} />
        <HorizontalGroupedChart title="Forma de ingresso" data={analysis.ingressoData} />
      </section>
    </div>
  )
}
