import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../components/UI/EmptyState'
import { KpiCard } from '../components/UI/KpiCard'
import { Loading } from '../components/UI/Loading'
import {
  countBy,
  fetchAllRows,
  getUniqueCpfCount,
  normalizeCampus,
  normalizeCpf,
  normalizeIngresso,
  pickText,
  titleize,
  type GenericRow,
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

interface CombinedRow {
  origin: CombinedOrigin
  cpf: string
  curso: string
  campus: string
  processo: string
}

const initialState: FunilState = {
  loading: true,
  error: null,
  leads: [],
  inscritos: [],
  matriculados: [],
}

const activeFunnelTables = {
  inscritos: 'inscritos_20262',
  matriculados: 'matriculados_20262',
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

function mapLead(row: GenericRow): CombinedRow {
  return {
    origin: 'Lead',
    cpf: normalizeCpf(row.cpf),
    curso: titleize(pickText(row, ['curso', 'Curso'])),
    campus: normalizeCampus(pickText(row, ['campus', 'Campus'])),
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
    processo: normalizeIngresso(pickText(row, ['forma_de_ingresso'])),
  }
}

function mapMatriculado(row: GenericRow): CombinedRow {
  return {
    origin: 'Matriculado',
    cpf: normalizeCpf(row.cpf),
    curso: titleize(pickText(row, ['curso'])),
    campus: normalizeCampus(pickText(row, ['filial', 'campus'])),
    processo: normalizeIngresso(pickText(row, ['tipo_de_ingresso'])),
  }
}

function ChartCard({
  title,
  data,
}: {
  title: string
  data: Array<{ label: string; value: number }>
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>

      {data.length ? (
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 16, right: 28 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={120}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(value) => formatNumberBR(Number(value))} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
    const leadCpfSet = buildCpfSet(state.leads)
    const filteredInscritos = onlyTraffic
      ? state.inscritos.filter((row) => leadCpfSet.has(normalizeCpf(row.cpf)))
      : state.inscritos
    const filteredMatriculados = onlyTraffic
      ? state.matriculados.filter((row) => leadCpfSet.has(normalizeCpf(row.cpf)))
      : state.matriculados

    const combinedRows = [
      ...state.leads.map(mapLead),
      ...filteredInscritos.map(mapInscrito),
      ...filteredMatriculados.map(mapMatriculado),
    ]

    return {
      leadsCount: getUniqueCpfCount(state.leads),
      inscritosCount: getUniqueCpfCount(filteredInscritos),
      matriculadosCount: getUniqueCpfCount(filteredMatriculados),
      courseData: countBy(combinedRows, (row) => row.curso),
      campusData: countBy(combinedRows, (row) => row.campus),
      processoData: countBy(combinedRows, (row) => row.processo),
      sourceData: countBy(combinedRows, (row) => row.origin, { includeEmpty: true }),
    }
  }, [onlyTraffic, state.inscritos, state.leads, state.matriculados])

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
              Leitura geral do processo seletivo
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
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
        <ChartCard title="Funil por origem" data={analysis.sourceData} />
        <ChartCard title="Curso" data={analysis.courseData} />
        <ChartCard title="Campus" data={analysis.campusData} />
        <ChartCard title="Processo seletivo" data={analysis.processoData} />
      </section>
    </div>
  )
}
