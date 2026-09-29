import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
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
              <Bar dataKey="inscritos" name="Inscritos" fill="#0ea5e9" radius={[0, 8, 8, 0]} />
              <Bar
                dataKey="matriculados"
                name="Matriculados"
                fill="#10b981"
                radius={[0, 8, 8, 0]}
              />
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
    const filteredPeriods = state.periods
      .filter((period) => period.semester === semester)
      .map((period) => ({
        ...period,
        inscritos: period.inscritos.filter((row) => matchesStudentType(row, studentTypeFilter)),
        matriculados: period.matriculados.filter((row) =>
          matchesStudentType(row, studentTypeFilter),
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
        (row) => normalizeIngresso(pickText(row, ['forma_de_ingresso'])),
        (row) => normalizeIngresso(pickText(row, ['tipo_de_ingresso'])),
      ),
    }
  }, [semester, state.periods, studentTypeFilter])

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
              onClick={() => setSemester('1')}
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
              onClick={() => setSemester('2')}
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
              />
              <Line
                type="monotone"
                dataKey="matriculados"
                name="Matriculados"
                stroke="#10b981"
                strokeWidth={3}
              />
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
