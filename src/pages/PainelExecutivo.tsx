import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eraser, RefreshCw } from 'lucide-react'
import { ExecutiveSummary } from '../components/Executive/ExecutiveSummary'
import { ForecastPanel } from '../components/Executive/ForecastPanel'
import { PersonaPanel } from '../components/Executive/PersonaPanel'
import { CheckboxFilter } from '../components/UI/CheckboxFilter'
import { EmptyState } from '../components/UI/EmptyState'
import { Loading } from '../components/UI/Loading'
import { ExecutiveDataContext } from '../lib/ExecutiveDataContext'
import { fetchAllRows, normalizeCampus, normalizeIngresso, periodTables, titleize, type GenericRow } from '../lib/dashboardHelpers'
import { matchesFilter, type FilterSelection } from '../lib/profileFilters'
import { profileField } from '../lib/studentProfile'
import { isSupabaseConfigured, normalizeSupabaseError } from '../lib/supabase'
import type { CampaignData } from '../lib/campaignForecast'
import { PerfilMatriculado } from './PerfilMatriculado'
import { RenovacaoMatriculas } from './RenovacaoMatriculas'

const currentPeriod = '2027.1'
const tables = periodTables.filter((period) => period.period <= currentPeriod)
const sections = [
  { key: 'resumo', label: 'Visão geral' },
  { key: 'projecao', label: 'Projeção 2027.1' },
  { key: 'renovacao', label: 'Renovação' },
  { key: 'perfil', label: 'Perfil do matriculado' },
] as const
type FilterKey = 'curso' | 'campus' | 'turno' | 'ingresso'
const emptyFilters: Record<FilterKey, FilterSelection> = { curso: null, campus: null, turno: null, ingresso: null }
const filterLabels: Array<{ key: FilterKey; label: string }> = [{ key: 'curso', label: 'Curso' }, { key: 'campus', label: 'Campus' }, { key: 'turno', label: 'Turno' }, { key: 'ingresso', label: 'Forma de ingresso' }]
const controlClass = 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700'

function academicFields(row: GenericRow, matricula: boolean) {
  return {
    curso: titleize(profileField(row, 'curso')),
    campus: normalizeCampus(profileField(row, ...(matricula ? ['filial', 'campus'] : ['campus', 'filial']))),
    turno: titleize(profileField(row, 'turno')),
    ingresso: normalizeIngresso(profileField(row, ...(matricula ? ['tipo_de_ingresso'] : ['forma_de_ingresso', 'tipo_de_ingresso']))),
  }
}

function dateInBrazil() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value ?? '').join('-')
}

async function readTable(table: string) {
  try {
    const result = await fetchAllRows(table)
    return { rows: result.error ? [] : result.rows, error: result.error?.message ?? '' }
  } catch (error) {
    return { rows: [] as GenericRow[], error: normalizeSupabaseError(error) }
  }
}

export function PainelExecutivo() {
  const [params, setParams] = useSearchParams()
  const requestedView = params.get('visao')
  const view = sections.find((section) => section.key === requestedView)?.key ?? 'resumo'
  const [filters, setFilters] = useState(emptyFilters)
  const [refresh, setRefresh] = useState(0)
  const historyCache = useRef(new Map<string, CampaignData>())
  const cepCache = useRef<Awaited<ReturnType<typeof readTable>> | null>(null)
  const lastRead = useRef(0)
  const inFlight = useRef(false)
  const [state, setState] = useState({ loading: true, refreshing: true, error: '', data: [] as CampaignData[], cacheRows: [] as GenericRow[], cacheWarning: '', readAt: '', asOf: dateInBrazil() })
  const reload = () => { historyCache.current.clear(); cepCache.current = null; setRefresh((value) => value + 1) }

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible' && !inFlight.current && Date.now() - lastRead.current >= 60000) setRefresh((value) => value + 1)
    }
    const timer = window.setInterval(check, 300000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      inFlight.current = true
      setState((current) => ({ ...current, loading: current.data.length === 0, refreshing: true, error: '' }))
      if (!isSupabaseConfigured) {
        inFlight.current = false
        setState((current) => ({ ...current, loading: false, refreshing: false, error: 'Configure o Supabase antes de carregar o painel executivo.' }))
        return
      }
      const [data, cache] = await Promise.all([
        Promise.all(tables.map(async (table): Promise<CampaignData> => {
          const cached = historyCache.current.get(table.period)
          if (table.period !== currentPeriod && cached) return cached
          const [inscritos, matriculados] = await Promise.all([readTable(table.inscritosTable), readTable(table.matriculadosTable)])
          const result = { period: table.period, inscritos: inscritos.rows, matriculados: matriculados.rows, inscritosError: inscritos.error, matriculadosError: matriculados.error }
          if (!cancelled && table.period !== currentPeriod && !inscritos.error && !matriculados.error) historyCache.current.set(table.period, result)
          return result
        })),
        cepCache.current ? Promise.resolve(cepCache.current) : readTable('ceps_enriquecidos'),
      ])
      if (!cancelled) {
        if (!cache.error) cepCache.current = cache
        lastRead.current = Date.now()
        inFlight.current = false
        setState({ loading: false, refreshing: false, error: '', data, cacheRows: cache.rows, cacheWarning: cache.error ? 'Cache de CEP indisponível. Endereços exibidos apenas quando já preenchidos nas matrículas.' : '', readAt: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date()), asOf: dateInBrazil() })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refresh])

  const shared = useMemo(() => ({
    loading: state.loading,
    matriculadosError: state.data.some((item) => item.matriculadosError) ? 'Bases de matrículas indisponíveis: ' + state.data.filter((item) => item.matriculadosError).map((item) => item.period).join(', ') : '',
    sources: state.data.map((item) => ({ period: item.period, rows: item.matriculados })),
    cacheRows: state.cacheRows,
    cacheWarning: state.cacheWarning,
    reload,
  }), [state])

  const analysis = useMemo(() => {
    const all = state.data.flatMap((item) => [...item.inscritos.map((row) => academicFields(row, false)), ...item.matriculados.map((row) => academicFields(row, true))])
    const options = Object.fromEntries(filterLabels.map(({ key }) => [key, [...new Set(all.map((row) => row[key]))].sort((a, b) => a.localeCompare(b, 'pt-BR'))])) as Record<FilterKey, string[]>
    const matches = (row: GenericRow, matricula: boolean) => {
      const fields = academicFields(row, matricula)
      return filterLabels.every(({ key }) => matchesFilter(filters[key], fields[key]))
    }
    const data = state.data.map((item) => ({ ...item, inscritos: item.inscritos.filter((row) => matches(row, false)), matriculados: item.matriculados.filter((row) => matches(row, true)) }))
    return { options, data }
  }, [state.data, filters])

  if (state.loading) return <Loading message="Carregando o painel executivo..." />
  if (state.error) return <EmptyState title="Não foi possível carregar o painel executivo" description={state.error} action={<button className={controlClass} onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>} />
  const showFilters = view === 'resumo' || view === 'projecao'
  const unavailableInscritos = state.data.filter((item) => item.inscritosError).map((item) => item.period)
  return <ExecutiveDataContext.Provider value={shared}><div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-slate-950">Painel executivo</h1><p className="mt-1 text-sm text-slate-500">Processo seletivo atual: {currentPeriod} · consulta em {state.readAt}</p><p role="status" className="mt-1 text-xs text-slate-500">{state.refreshing ? 'Consultando novas cargas...' : 'Dados atuais consultados a cada 5 minutos enquanto o painel estiver aberto.'}</p></div>
      <div className="flex gap-2">{showFilters && <button type="button" className={controlClass} onClick={() => setFilters(emptyFilters)}><Eraser size={16} />Limpar filtros</button>}<button type="button" className={controlClass} disabled={state.refreshing} onClick={reload}><RefreshCw size={16} className={state.refreshing ? 'animate-spin' : ''} />Atualizar</button></div>
    </header>
    <div role="tablist" aria-label="Seções do painel executivo" className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2">
      {sections.map((section, index) => <button key={section.key} id={'exec-tab-' + section.key} type="button" role="tab" aria-selected={view === section.key} aria-controls={'exec-panel-' + section.key} tabIndex={view === section.key ? 0 : -1} className={'shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium ' + (view === section.key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100')} onClick={() => setParams({ visao: section.key })} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index - 1 + sections.length) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null
        if (next !== null) { event.preventDefault(); setParams({ visao: sections[next].key }); document.getElementById('exec-tab-' + sections[next].key)?.focus() }
      }}>{section.label}</button>)}
    </div>
    {showFilters && <section aria-label="Recorte executivo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{filterLabels.map(({ key, label }) => <CheckboxFilter key={key} label={label} options={analysis.options[key].map((value) => ({ value, label: value }))} selected={filters[key]} onChange={(selected) => setFilters((current) => ({ ...current, [key]: selected }))} />)}</section>}
    {showFilters && unavailableInscritos.length > 0 && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Bases de inscritos indisponíveis em {unavailableInscritos.join(', ')}. Os indicadores de matrículas continuam disponíveis quando suas bases estiverem acessíveis.</p>}
    <div id={'exec-panel-' + view} role="tabpanel" aria-labelledby={'exec-tab-' + view}>
      {view === 'resumo' && <ExecutiveSummary data={analysis.data} currentPeriod={currentPeriod} />}
      {view === 'projecao' && <ForecastPanel data={analysis.data} currentPeriod={currentPeriod} asOf={state.asOf} />}
      {view === 'renovacao' && <RenovacaoMatriculas embedded />}
      {view === 'perfil' && <div className="space-y-6"><PersonaPanel data={state.data} currentPeriod={currentPeriod} asOf={state.asOf} /><PerfilMatriculado embedded /></div>}
    </div>
  </div></ExecutiveDataContext.Provider>
}
