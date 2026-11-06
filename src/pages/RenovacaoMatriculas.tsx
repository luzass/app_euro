import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Eraser, RefreshCw, Search } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckboxFilter } from '../components/UI/CheckboxFilter'
import { EmptyState } from '../components/UI/EmptyState'
import { KpiCard } from '../components/UI/KpiCard'
import { Loading } from '../components/UI/Loading'
import { fetchAllRows, normalizeCampus, normalizeIngresso, periodTables, titleize } from '../lib/dashboardHelpers'
import { compareRenewal, indexRenewalRows, nextAcademicPeriod, renewalGroups, type RenewalEnrollment, type RenewalStatus } from '../lib/enrollmentRenewal'
import { matchesFilter, type FilterSelection } from '../lib/profileFilters'
import { normalizedText, type ProfileSource } from '../lib/studentProfile'
import { formatNumberBR } from '../lib/formatters'
import { isSupabaseConfigured, normalizeSupabaseError } from '../lib/supabase'

type CohortKey = 'curso' | 'campus' | 'turno' | 'ingresso'
const renewalTables = periodTables.filter((table) => table.period <= '2027.1')
const transitions = renewalTables.slice(0, -1).map((table) => table.period)
const defaultOrigin = transitions.at(-1) ?? '2026.2'
const emptyFilters: Record<CohortKey, FilterSelection> = { curso: null, campus: null, turno: null, ingresso: null }
const dimensions: Array<{ key: CohortKey; title: string; label: string }> = [
  { key: 'curso', title: 'Renovação por curso de origem', label: 'Curso de origem' },
  { key: 'campus', title: 'Renovação por campus de origem', label: 'Campus de origem' },
  { key: 'turno', title: 'Renovação por turno de origem', label: 'Turno de origem' },
  { key: 'ingresso', title: 'Renovação por forma de ingresso', label: 'Forma de ingresso' },
]
const statusLabels: Record<RenewalStatus, string> = {
  renovou: 'Renovaram',
  nao_localizado: 'Sem renovação ativa localizada',
  provavel_concluinte: 'Prováveis concluintes',
  aguardando_base: 'Aguardando base de destino',
}
const statusColors: Record<RenewalStatus, string> = { renovou: '#059669', nao_localizado: '#ea580c', provavel_concluinte: '#0284c7', aguardando_base: '#64748b' }
const recordStatusLabels: Record<RenewalStatus, string> = { renovou: 'Renovou', nao_localizado: 'Sem renovação ativa localizada', provavel_concluinte: 'Provável concluinte', aguardando_base: 'Aguardando base de destino' }
const statusKeys = Object.keys(statusLabels) as RenewalStatus[]
const controlClass = 'min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800'

function cohortFields(enrollment: RenewalEnrollment) {
  return { curso: titleize(enrollment.course), campus: normalizeCampus(enrollment.campus), turno: titleize(enrollment.shift), ingresso: normalizeIngresso(enrollment.ingresso) }
}

function wrapLabel(label: string) {
  const lines: string[] = []
  for (const word of label.split(/\s+/).flatMap((part) => part.match(/.{1,22}/g) ?? [])) {
    const last = lines.length - 1
    if (last >= 0 && lines[last].length + word.length < 22) lines[last] += ' ' + word
    else lines.push(word)
  }
  return lines
}

function RenewalChart({ title, data, selected, onSelect }: {
  title: string
  data: ReturnType<typeof renewalGroups>
  selected: FilterSelection
  onSelect: (label: string, additive: boolean) => void
}) {
  const series = statusKeys.filter((key) => data.some((row) => row[key] > 0))
  const rowHeight = Math.max(56, series.length * 22 + 16, ...data.map((row) => wrapLabel(row.label).length * 13 + 12))
  return <article className="flex h-[410px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-base font-semibold text-slate-950">{title}</h2>
    <div className="my-3 flex flex-wrap gap-x-4 gap-y-1" aria-label={'Legenda de ' + title}>
      {series.map((key) => <span key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: statusColors[key] }} />{statusLabels[key]}</span>)}
    </div>
    {data.length ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div style={{ height: Math.max(270, data.length * rowHeight) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, top: 8, right: 42, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis dataKey="label" type="category" width={130} interval={0} tickLine={false} axisLine={false} tick={({ x, y, payload }) => {
              const lines = wrapLabel(String(payload.value))
              return <text x={x} y={y} textAnchor="end" fontSize={11} fill="#64748b">{lines.map((line, index) => <tspan key={index} x={x} dy={index ? 13 : -(lines.length - 1) * 6.5 + 4}>{line}</tspan>)}</text>
            }} />
            <Tooltip formatter={(value) => formatNumberBR(Number(value))} />
            {series.map((key) => <Bar key={key} dataKey={key} name={statusLabels[key]} fill={statusColors[key]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} cursor="pointer" onClick={(entry, _index, event) => {
              const label = String(entry?.payload?.label ?? '')
              if (label) onSelect(label, Boolean(event?.ctrlKey || event?.metaKey))
            }}>
              {data.map((row) => <Cell key={row.label} fill={matchesFilter(selected, row.label) ? statusColors[key] : '#cbd5e1'} />)}
              <LabelList dataKey={key} position="right" formatter={(value: number) => value > 0 ? formatNumberBR(value) : ''} fill="#0f172a" fontSize={11} fontWeight={700} />
            </Bar>)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div> : <p className="flex flex-1 items-center justify-center text-sm text-slate-500">Nenhum aluno no recorte de origem.</p>}
  </article>
}

export function RenovacaoMatriculas() {
  const [origin, setOrigin] = useState(defaultOrigin)
  const [filters, setFilters] = useState(emptyFilters)
  const [listStatuses, setListStatuses] = useState<FilterSelection>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState({ loading: true, error: '', sources: [] as ProfileSource[] })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        if (!isSupabaseConfigured) throw new Error('Configure o Supabase antes de carregar as matrículas.')
        const sources = await Promise.all(renewalTables.map(async (table) => {
          const result = await fetchAllRows(table.matriculadosTable)
          if (result.error) throw result.error
          return { period: table.period, rows: result.rows }
        }))
        if (!cancelled) setState({ loading: false, error: '', sources })
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: normalizeSupabaseError(error), sources: [] })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refresh])

  const index = useMemo(() => indexRenewalRows(state.sources), [state.sources])
  const analysis = useMemo(() => {
    const originEnrollments = [...(index.periods.get(origin)?.values() ?? [])].flat().filter((enrollment) => enrollment.active)
    const fieldsByEnrollment = new Map(originEnrollments.map((enrollment) => [enrollment, cohortFields(enrollment)]))
    const fieldsFor = (enrollment: RenewalEnrollment) => fieldsByEnrollment.get(enrollment)!
    const options = Object.fromEntries(dimensions.map(({ key }) => [key, [...new Set(originEnrollments.map((enrollment) => fieldsFor(enrollment)[key]))].sort((a, b) => a.localeCompare(b, 'pt-BR'))])) as Record<CohortKey, string[]>
    const matchesCohort = (enrollment: RenewalEnrollment, skip?: CohortKey) => dimensions.every(({ key }) => key === skip || matchesFilter(filters[key], fieldsFor(enrollment)[key]))
    const comparison = compareRenewal(index, origin, (enrollment) => matchesCohort(enrollment))
    // Keep a chart's other categories visible for Ctrl+click. Each group applies its own graduation rule.
    const charts = Object.fromEntries(dimensions.map(({ key }) => [key, options[key].flatMap((label) => {
      const cohort = compareRenewal(index, origin, (enrollment) => matchesCohort(enrollment, key) && fieldsFor(enrollment)[key] === label)
      return renewalGroups(cohort.records, () => label)
    }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'))])) as Record<CohortKey, ReturnType<typeof renewalGroups>>
    return { ...comparison, options, charts }
  }, [index, origin, filters])

  const list = useMemo(() => {
    const query = normalizedText(search)
    const digits = search.replace(/\D/g, '')
    return analysis.records.filter((record) => matchesFilter(listStatuses, record.status) && (!query || normalizedText(record.name).includes(query) || Boolean(digits && record.cpf.includes(digits))))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.cpf.localeCompare(b.cpf))
  }, [analysis.records, listStatuses, search])
  const pageCount = Math.max(1, Math.ceil(list.length / 20))
  const currentPage = Math.min(page, pageCount - 1)

  function clearFilters() {
    setFilters(emptyFilters)
    setListStatuses(null)
    setSearch('')
    setPage(0)
  }

  if (state.loading) return <Loading message="Comparando as matrículas entre períodos letivos..." />
  if (state.error) return <EmptyState title="Não foi possível carregar a renovação" description={state.error} action={<button className={controlClass} onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>} />

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Renovação de matrículas</h1>
        <p className="mt-1 text-sm text-slate-500">Período letivo {origin} → {analysis.destination} · calouros e veteranos · CPF único</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={controlClass + ' inline-flex items-center gap-2'} onClick={clearFilters}><Eraser size={16} />Limpar filtros</button>
        <button type="button" className={controlClass + ' inline-flex items-center gap-2'} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} />Atualizar</button>
      </div>
    </header>
    <section aria-label="Filtros de renovação" className="grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Comparação entre períodos letivos
        <select aria-label="Comparação entre períodos letivos" className={controlClass + ' h-10'} value={origin} onChange={(event) => { setOrigin(event.target.value); clearFilters() }}>
          {transitions.map((period) => <option key={period} value={period}>{period} → {nextAcademicPeriod(period)}</option>)}
        </select>
      </label>
      {dimensions.map(({ key, label }) => <CheckboxFilter key={key} label={label} options={analysis.options[key].map((value) => ({ value, label: value }))} selected={filters[key]} onChange={(selection) => { setFilters((current) => ({ ...current, [key]: selection })); setPage(0) }} />)}
    </section>
    <div className="space-y-2 text-sm text-slate-600">
      <p>Prováveis concluintes: 10º período nos demais cursos e 12º em Medicina. Eles ficam fora da base elegível.</p>
      <p>A ausência de matrícula ativa no destino não confirma evasão. A leitura depende da atualização da base do semestre seguinte.</p>
    </div>
    {!analysis.hasTargetData && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Sem base utilizável no período letivo {analysis.destination}. Renovação e taxa ficam pendentes até haver registros com CPF e contrato informados.</p>}
    {(index.invalidPeriodRows > 0 || index.invalidCpfRows > 0 || index.missingContractRows > 0) && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Conferência da carga. Linhas sem período letivo válido: {formatNumberBR(index.invalidPeriodRows)}; sem CPF válido: {formatNumberBR(index.invalidCpfRows)}; sem contrato informado: {formatNumberBR(index.missingContractRows)}. Linhas sem período letivo ou CPF válido não entram no cruzamento.</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores de renovação">
      <KpiCard title="Base ativa de origem" value={formatNumberBR(analysis.base)} helperText={origin} emphasis="primary" />
      <KpiCard title="Prováveis concluintes" value={formatNumberBR(analysis.graduating)} helperText="Excluídos da base elegível" />
      <KpiCard title="Elegíveis para renovar" value={formatNumberBR(analysis.eligible)} helperText="" />
      <KpiCard title="Renovaram" value={analysis.hasTargetData ? formatNumberBR(analysis.renewed) : '—'} helperText="Matrícula ativa no período seguinte" />
      <KpiCard title="Sem renovação ativa localizada" value={analysis.hasTargetData ? formatNumberBR(analysis.missing) : '—'} helperText="Elegíveis sem matrícula ativa no destino" />
      <KpiCard title="Taxa de renovação" value={analysis.rate === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(analysis.rate)} helperText="Renovaram ÷ elegíveis para renovar" />
    </section>
    <p className="text-sm text-slate-600">{analysis.changedCourse === 1 ? '1 aluno renovou em outro curso.' : formatNumberBR(analysis.changedCourse) + ' alunos renovaram em outro curso.'} {analysis.uncertainGraduation > 0 && <span>{analysis.uncertainGraduation === 1 ? '1 aluno tem curso ou período do curso não identificado e permanece elegível.' : formatNumberBR(analysis.uncertainGraduation) + ' alunos têm curso ou período do curso não identificado e permanecem elegíveis.'} Sem exclusão automática por conclusão.</span>}</p>
    <section className="grid gap-5 xl:grid-cols-2">
      {dimensions.map(({ key, title }) => <RenewalChart key={key} title={title} data={analysis.charts[key]} selected={filters[key]} onSelect={(label, additive) => {
        setFilters((current) => {
          const selected = current[key] ?? []
          const next = selected.includes(label) ? selected.filter((value) => value !== label) : additive ? [...selected, label] : [label]
          return { ...current, [key]: next.length ? next : null }
        })
        setPage(0)
      }} />)}
    </section>
    <p className="text-xs text-slate-500">Os recortes usam os dados de origem. Um CPF com mais de um vínculo pode aparecer em mais de um curso, campus, turno ou ingresso; no total da instituição ele conta uma vez.</p>
    <section className="space-y-4 border-t border-slate-200 pt-5" aria-label="Alunos na comparação">
      <h2 className="text-lg font-semibold text-slate-950">Alunos na comparação</h2>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CheckboxFilter label="Situação na lista" options={statusKeys.map((key) => ({ value: key, label: statusLabels[key] }))} selected={listStatuses} onChange={(selection) => { setListStatuses(selection); setPage(0) }} />
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Buscar aluno
          <span className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search size={16} className="shrink-0 text-slate-400" /><input type="search" aria-label="Buscar aluno" placeholder="Nome ou CPF" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} /></span>
        </label>
        <span className="pb-2 text-sm text-slate-500">{formatNumberBR(list.length)} {list.length === 1 ? 'aluno' : 'alunos'}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><tr><th scope="col" className="px-4 py-3">Aluno</th><th scope="col" className="px-4 py-3">Curso de origem</th><th scope="col" className="px-4 py-3">Campus / turno de origem</th><th scope="col" className="px-4 py-3">Curso ativo no destino</th><th scope="col" className="px-4 py-3">Situação</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.slice(currentPage * 20, (currentPage + 1) * 20).map((record) => <tr key={record.cpf}>
              <td className="px-4 py-3"><p className="font-medium text-slate-900">{titleize(record.name)}</p><p className="mt-1 text-xs text-slate-500">***.***.{record.cpf.slice(6, 9)}-{record.cpf.slice(9)}</p></td>
              <td className="max-w-[240px] px-4 py-3">{[...new Set(record.origins.map((enrollment) => titleize(enrollment.course)))].join(' / ')}</td>
              <td className="max-w-[240px] px-4 py-3">{[...new Set(record.origins.map((enrollment) => normalizeCampus(enrollment.campus) + ' / ' + titleize(enrollment.shift)))].join('; ')}</td>
              <td className="max-w-[240px] px-4 py-3">{record.destinations.length ? [...new Set(record.destinations.map((enrollment) => titleize(enrollment.course)))].join(' / ') : '—'}</td>
              <td className="max-w-[240px] px-4 py-3"><span className="font-medium" style={{ color: statusColors[record.status] }}>{recordStatusLabels[record.status]}</span>{record.changedCourse && <p className="mt-1 text-xs text-slate-500">Renovação em outro curso</p>}{record.inactiveAtDestination && <p className="mt-1 text-xs text-slate-500">Apenas contrato não ativo no destino</p>}</td>
            </tr>)}
            {!list.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum aluno encontrado neste recorte.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-slate-500"><span>Página {currentPage + 1} de {pageCount}</span><div className="flex gap-2"><button type="button" title="Página anterior" aria-label="Página anterior" className={controlClass + ' disabled:opacity-40'} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={16} /></button><button type="button" title="Próxima página" aria-label="Próxima página" className={controlClass + ' disabled:opacity-40'} disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}><ArrowRight size={16} /></button></div></div>
    </section>
  </div>
}
