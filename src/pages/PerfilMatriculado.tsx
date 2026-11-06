import { useEffect, useMemo, useState } from 'react'
import { Eraser, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { KpiCard } from '../components/UI/KpiCard'
import { Loading } from '../components/UI/Loading'
import { EmptyState } from '../components/UI/EmptyState'
import { fetchAllRows, matchesStudentType, normalizeCampus, normalizeIngresso, periodTables, titleize, type GenericRow, type StudentTypeFilter } from '../lib/dashboardHelpers'
import { ageBand, buildCepCache, enrollmentAge, genderLabel, medianAge, normalizedText, profileAddress, profileField, schoolType, uniqueProfileRows, type ProfileSource } from '../lib/studentProfile'
import { formatNumberBR } from '../lib/formatters'
import { normalizeSupabaseError } from '../lib/supabase'

type Dimension = 'idade' | 'bairro' | 'cidade' | 'estado' | 'escola' | 'sexo' | 'nomeEscola' | 'ingresso'
type Selections = Record<Dimension, string[]>
type ProfileRow = Record<Dimension, string> & { age: number | null; curso: string; campus: string; turno: string }
const profilePeriods = periodTables.filter((item) => item.period <= '2027.1')
const emptySelections: Selections = { idade: [], bairro: [], cidade: [], estado: [], escola: [], sexo: [], nomeEscola: [], ingresso: [] }
const dimensions: Array<{ key: Dimension; title: string; color: string }> = [
  { key: 'idade', title: 'Faixa etária', color: '#0284c7' },
  { key: 'escola', title: 'Tipo de escola', color: '#059669' },
  { key: 'nomeEscola', title: 'Escolas de origem', color: '#0f766e' },
  { key: 'ingresso', title: 'Forma de ingresso', color: '#e11d48' },
  { key: 'bairro', title: 'Bairro', color: '#0891b2' },
  { key: 'cidade', title: 'Cidade', color: '#2563eb' },
  { key: 'estado', title: 'Estado', color: '#d97706' },
  { key: 'sexo', title: 'Sexo', color: '#db2777' },
]
const ageOrder = ['Até 17 anos', '18 a 24 anos', '25 a 34 anos', '35 a 44 anos', '45 anos ou mais']
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const controlClass = 'min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800'

function academicFields(row: GenericRow) {
  const ingresso = profileField(row, 'tipo_de_ingresso')
  return {
    curso: titleize(profileField(row, 'curso')),
    campus: normalizeCampus(profileField(row, 'filial', 'campus')),
    turno: titleize(profileField(row, 'turno')),
    ingresso: ingresso ? normalizeIngresso(ingresso) : '',
  }
}

function mapProfile(row: GenericRow, cache: Map<string, GenericRow>): ProfileRow {
  const address = profileAddress(row, cache)
  const age = enrollmentAge(row)
  const school = profileField(row, 'escola')
  const unknownSchool = ['', '-', 'NAO INFORMADO', 'NAO INFORMADA', 'NAO SE APLICA', 'SEM INFORMACAO'].includes(normalizedText(school))
  return {
    ...academicFields(row),
    ...address,
    bairro: address.bairro ? [titleize(address.bairro), titleize(address.cidade), address.estado].filter(Boolean).join(' / ') : '',
    cidade: address.cidade ? [titleize(address.cidade), address.estado].filter(Boolean).join(' / ') : '',
    idade: ageBand(age), age,
    escola: schoolType(profileField(row, 'tipo_escola', 'TIPO ESCOLA')),
    nomeEscola: unknownSchool ? '' : titleize(school),
    sexo: genderLabel(profileField(row, 'sexo')),
  }
}

function labelLines(label: string) {
  const lines: string[] = []
  for (const word of label.split(/\s+/).flatMap((part) => part.match(/.{1,20}/g) ?? [])) {
    const last = lines.length - 1
    if (last >= 0 && lines[last].length + word.length < 20) lines[last] += ' ' + word
    else lines.push(word)
  }
  return lines
}

function ProfileChart({ dimension, rows, selections, onSelect }: {
  dimension: typeof dimensions[number]
  rows: ProfileRow[]
  selections: Selections
  onSelect: (key: Dimension, label: string, additive: boolean) => void
}) {
  const eligible = rows.filter((row) => dimensions.every(({ key }) => key === dimension.key || !selections[key].length || selections[key].includes(row[key])))
  const counts = new Map<string, number>()
  for (const row of eligible) {
    if (row[dimension.key]) counts.set(row[dimension.key], (counts.get(row[dimension.key]) ?? 0) + 1)
  }
  const data = [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => dimension.key === 'idade' ? ageOrder.indexOf(a.label) - ageOrder.indexOf(b.label) : b.value - a.value)
  const known = data.reduce((sum, row) => sum + row.value, 0)
  const rowHeight = Math.max(40, ...data.map((row) => labelLines(row.label).length * 13 + 10))
  const selected = selections[dimension.key]
  return (
    <article className="flex h-[380px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-950">{dimension.title}</h2>
        <span className="text-xs text-slate-500">{formatNumberBR(known)} com informação · {formatNumberBR(eligible.length - known)} sem informação</span>
      </div>
      {data.length ? (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div style={{ height: Math.max(260, data.length * rowHeight) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data} margin={{ top: 8, right: 45, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" interval={0} width={125} tickLine={false} axisLine={false} tick={({ x, y, payload }) => {
                  const lines = labelLines(String(payload.value))
                  return <text x={x} y={y} textAnchor="end" fill="#64748b" fontSize={11}>{lines.map((line, index) => <tspan key={index} x={x} dy={index ? 13 : -(lines.length - 1) * 6.5 + 4}>{line}</tspan>)}</text>
                }} />
                <Tooltip formatter={(value) => [formatNumberBR(Number(value)), 'Matriculados']} />
                <Bar dataKey="value" isAnimationActive={false} fill={dimension.color} maxBarSize={28} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry, _index, event) => {
                  const label = String(entry?.payload?.label ?? '')
                  if (label) onSelect(dimension.key, label, Boolean(event?.ctrlKey || event?.metaKey))
                }}>
                  {data.map((entry) => <Cell key={entry.label} fill={!selected.length || selected.includes(entry.label) ? dimension.color : '#cbd5e1'} />)}
                  <LabelList dataKey="value" position="right" formatter={(value: number) => formatNumberBR(value)} fill="#0f172a" fontSize={12} fontWeight={700} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : <p className="flex flex-1 items-center justify-center text-sm text-slate-500">Sem informação neste recorte.</p>}
    </article>
  )
}

export function PerfilMatriculado() {
  const [period, setPeriod] = useState('all')
  const [studentType, setStudentType] = useState<StudentTypeFilter>('all')
  const [contract, setContract] = useState('all')
  const [filters, setFilters] = useState({ curso: '', campus: '', turno: '', ingresso: '' })
  const [selections, setSelections] = useState<Selections>(emptySelections)
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState({ loading: true, error: '', warning: '', sources: [] as ProfileSource[], cacheRows: [] as GenericRow[] })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState((current) => ({ ...current, loading: true, error: '', warning: '' }))
      try {
        const tables = profilePeriods.filter((item) => period === 'all' || item.period === period)
        const [sources, cacheResult] = await Promise.all([
          Promise.all(tables.map(async (table) => {
            const result = await fetchAllRows(table.matriculadosTable)
            if (result.error) throw result.error
            return { period: table.period, rows: result.rows }
          })),
          fetchAllRows('ceps_enriquecidos'),
        ])
        if (!cancelled) setState({ loading: false, error: '', warning: cacheResult.error ? 'Cache de CEP indisponível. Endereços exibidos apenas quando já preenchidos nas matrículas.' : '', sources, cacheRows: cacheResult.error ? [] : cacheResult.rows })
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: normalizeSupabaseError(error), warning: '', sources: [], cacheRows: [] })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [period, refresh])

  const analysis = useMemo(() => {
    const sources = state.sources.map((source) => ({ ...source, rows: source.rows.filter((row) => matchesStudentType(row, studentType) && (contract === 'all' || normalizedText(profileField(row, 'contrato')) === contract)) }))
    const base = sources.flatMap((source) => source.rows.map(academicFields))
    const options = Object.fromEntries((Object.keys(filters) as Array<keyof typeof filters>).map((key) => [key, [...new Set(base.map((row) => row[key]))].filter((value) => value && value !== 'Não informado').sort((a, b) => a.localeCompare(b, 'pt-BR'))])) as Record<keyof typeof filters, string[]>
    const filteredSources = sources.map((source) => ({ ...source, rows: source.rows.filter((row) => {
      const fields = academicFields(row)
      return (Object.keys(filters) as Array<keyof typeof filters>).every((key) => !filters[key] || filters[key] === fields[key])
    }) }))
    const cache = buildCepCache(state.cacheRows)
    const rows = uniqueProfileRows(filteredSources).map((row) => mapProfile(row, cache))
    const visible = rows.filter((row) => dimensions.every(({ key }) => !selections[key].length || selections[key].includes(row[key])))
    const ages = visible.flatMap((row) => row.age === null ? [] : [row.age])
    return {
      rows, visible, options,
      averageAge: ages.length ? number.format(ages.reduce((a, b) => a + b, 0) / ages.length) + ' anos' : '—',
      medianAge: medianAge(ages),
      ages: ages.length,
      addresses: visible.filter((row) => row.bairro).length,
      schools: visible.filter((row) => row.escola).length,
    }
  }, [state.sources, state.cacheRows, studentType, contract, filters, selections])

  function clearFilters() {
    setFilters({ curso: '', campus: '', turno: '', ingresso: '' })
    setSelections(emptySelections)
    setStudentType('all')
    setContract('all')
  }

  if (state.loading) return <Loading message="Carregando perfil dos matriculados..." />
  if (state.error) return <EmptyState title="Não foi possível carregar o perfil" description={state.error} action={<button className={controlClass} onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>} />

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Perfil do matriculado</h1>
          <p className="mt-1 text-sm text-slate-500">{period === 'all' ? '2024.1 a 2027.1 · registro mais recente de cada CPF no recorte' : 'Processo seletivo ' + period} · CPF único</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={clearFilters} className={controlClass + ' inline-flex items-center gap-2'}><Eraser size={16} />Limpar filtros</button>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} className={controlClass + ' inline-flex items-center gap-2'}><RefreshCw size={16} />Atualizar</button>
        </div>
      </header>
      <section aria-label="Filtros do perfil" className="grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Processo seletivo
          <select aria-label="Processo seletivo" className={controlClass} value={period} onChange={(event) => { setPeriod(event.target.value); clearFilters() }}>
            <option value="all">Geral · 2024.1 a 2027.1</option>
            {profilePeriods.map((item) => <option key={item.period} value={item.period}>{item.label}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Tipo de aluno
          <select aria-label="Tipo de aluno" className={controlClass} value={studentType} onChange={(event) => setStudentType(event.target.value as StudentTypeFilter)}><option value="all">Todos</option><option value="calouro">Calouros</option><option value="veterano">Veteranos</option></select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Contrato
          <select aria-label="Contrato" className={controlClass} value={contract} onChange={(event) => setContract(event.target.value)}><option value="all">Todos</option><option value="ATIVO">Ativo</option><option value="CANCELADO">Cancelado</option></select>
        </label>
        {([{ key: 'curso', label: 'Curso' }, { key: 'campus', label: 'Campus' }, { key: 'turno', label: 'Turno' }, { key: 'ingresso', label: 'Forma de ingresso' }] as const).map(({ key, label }) => (
          <label key={key} className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">{label}
            <select aria-label={label} className={controlClass} value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}>
              <option value="">Todos</option>
              {Array.from(new Set([...analysis.options[key], ...(filters[key] ? [filters[key]] : [])])).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
      </section>
      {state.warning && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{state.warning}</p>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Matriculados no perfil" value={formatNumberBR(analysis.visible.length)} helperText="" emphasis="primary" />
        <KpiCard title="Idade média na matrícula" value={analysis.averageAge} helperText={formatNumberBR(analysis.ages) + ' com idade disponível'} />
        <KpiCard title="Idade mediana na matrícula" value={analysis.medianAge === null ? '—' : number.format(analysis.medianAge) + ' anos'} helperText="" />
        <KpiCard title="Bairro localizado" value={formatNumberBR(analysis.addresses)} helperText={(analysis.visible.length ? number.format(analysis.addresses / analysis.visible.length * 100) : '0') + '% do recorte'} />
        <KpiCard title="Tipo de escola identificado" value={formatNumberBR(analysis.schools)} helperText={(analysis.visible.length ? number.format(analysis.schools / analysis.visible.length * 100) : '0') + '% do recorte'} />
      </section>
      {dimensions.some(({ key }) => selections[key].length) && <div className="flex flex-wrap gap-2" aria-label="Seleções nos gráficos">
        {dimensions.flatMap(({ key, title }) => selections[key].map((label) => <button key={key + label} className={controlClass} onClick={() => setSelections((current) => ({ ...current, [key]: current[key].filter((item) => item !== label) }))} aria-label={'Remover filtro ' + title + ': ' + label}>{title}: {label} ×</button>))}
      </div>}
      <section className="grid gap-5 xl:grid-cols-2">
        {dimensions.map((dimension) => <ProfileChart key={dimension.key} dimension={dimension} rows={analysis.rows} selections={selections} onSelect={(key, label, additive) => setSelections((current) => ({ ...current, [key]: current[key].includes(label) ? current[key].filter((item) => item !== label) : additive ? [...current[key], label] : [label] }))} />)}
      </section>
    </div>
  )
}
