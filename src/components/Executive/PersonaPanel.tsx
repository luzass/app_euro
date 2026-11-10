import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eraser, Search } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckboxFilter } from '../UI/CheckboxFilter'
import { buildCoursePersona, personaLabels } from '../../lib/coursePersona'
import type { CampaignData } from '../../lib/campaignForecast'
import { matchesFilter, type FilterSelection } from '../../lib/profileFilters'
import { normalizedText } from '../../lib/studentProfile'
import { titleize } from '../../lib/dashboardHelpers'
import { formatNumberBR } from '../../lib/formatters'

const colors = ['#059669', '#0284c7', '#d97706', '#64748b']
const labels = { idade: 'Faixa etária', campus: 'Campus', turno: 'Turno', ingresso: 'Ingresso' }
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40'

export function PersonaPanel({ data, currentPeriod, asOf }: { data: CampaignData[]; currentPeriod: string; asOf: string }) {
  const [courses, setCourses] = useState<FilterSelection>(null)
  const [bands, setBands] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const model = useMemo(() => buildCoursePersona(data, currentPeriod, asOf), [data, currentPeriod, asOf])
  const options = [...new Set(model.records.map((row) => row.course))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const scoped = model.records.filter((row) => matchesFilter(courses, row.course) && normalizedText(row.name).includes(normalizedText(search)))
  const counts = personaLabels.map((label) => ({ label, value: scoped.filter((row) => row.label === label).length }))
  const filtered = scoped.filter((row) => !bands.length || bands.includes(row.label))
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), actualPage = Math.min(page, pages - 1)
  return <section aria-label="Aderência ao perfil do curso" className="space-y-4 border-b border-slate-200 pb-6">
    <header><h2 className="text-xl font-semibold text-slate-950">Inscritos e perfil histórico do curso</h2><p className="mt-1 text-sm text-slate-500">Inscritos de {currentPeriod} comparados com calouros ativos de períodos anteriores. Semelhança de perfil não é probabilidade de matrícula.</p></header>
    <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
      <CheckboxFilter label="Curso da persona" options={options.map((course) => ({ value: course, label: titleize(course) }))} selected={courses} onChange={(value) => { setCourses(value); setPage(0) }} />
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Buscar inscrito<div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search size={16} /><input aria-label="Buscar inscrito" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} /></div></label>
      <button className={button} onClick={() => { setBands([]); setCourses(null); setSearch(''); setPage(0) }}><Eraser size={16} />Limpar</button>
    </div>
    {(model.historyUnavailable || model.currentUnavailable) && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Há bases indisponíveis. A comparação está suspensa para não avaliar pessoas com uma referência incompleta.</p>}
    {!model.historyUnavailable && !model.currentUnavailable && <>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-200 py-3 text-sm"><span>Inscrições por CPF e curso: <strong>{formatNumberBR(scoped.length)}</strong></span><span>Com dados para comparação: <strong>{formatNumberBR(scoped.filter((row) => row.score !== null).length)}</strong></span><span>Matrícula ativa no mesmo curso: <strong>{formatNumberBR(scoped.filter((row) => row.enrolled).length)}</strong></span></div>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={counts} margin={{ left: 0, right: 40, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis dataKey="label" type="category" width={125} interval={0} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [formatNumberBR(Number(value)), 'Inscrições']} />
        <Bar dataKey="value" maxBarSize={28} isAnimationActive={false} cursor="pointer" onClick={(entry, _index, event) => {
          const label = String(entry?.payload?.label ?? '')
          if (!label) return
          setBands((current) => event?.ctrlKey || event?.metaKey ? current.includes(label) ? current.filter((item) => item !== label) : [...current, label] : current.length === 1 && current[0] === label ? [] : [label]); setPage(0)
        }}>{counts.map((item, index) => <Cell key={item.label} fill={!bands.length || bands.includes(item.label) ? colors[index] : '#cbd5e1'} />)}<LabelList dataKey="value" position="right" fill="#0f172a" fontWeight={700} fontSize={12} formatter={(value: number) => formatNumberBR(value)} /></Bar>
      </BarChart></ResponsiveContainer></div>
      <div className="overflow-x-auto border-y border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">Inscrito / curso</th><th className="p-3">Aderência descritiva</th><th className="p-3 text-right">Base histórica</th><th className="p-3">Situação</th></tr></thead><tbody className="divide-y divide-slate-100">
        {filtered.slice(actualPage * 20, actualPage * 20 + 20).map((row) => <tr key={row.key}><th scope="row" className="p-3 font-medium"><span>{row.name}</span><span className="mt-1 block text-xs font-normal text-slate-500">{titleize(row.course)}</span></th><td className="p-3"><span className="font-medium">{row.label}{row.score !== null ? ` · índice ${row.score}/100` : ''}</span><details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Conferir características</summary><div className="mt-2 space-y-1">{row.evidence.map((item) => <p key={item.dimension}>{labels[item.dimension]}: {item.value ? titleize(item.value) : 'Sem informação'} · {item.count}/{item.total} no histórico com essa informação.</p>)}{row.reason && <p>{row.reason}</p>}</div></details></td><td className="p-3 text-right">{formatNumberBR(row.sample)} CPFs</td><td className="p-3 text-xs">{row.enrolled ? 'Matriculado no curso' : 'Sem matrícula ativa no curso'}</td></tr>)}
        {!filtered.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nenhum inscrito neste recorte.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>{formatNumberBR(filtered.length)} inscrições · página {actualPage + 1} de {pages}</span><div className="flex gap-2"><button aria-label="Página anterior de inscritos" title="Página anterior" className={button} disabled={!actualPage} onClick={() => setPage(actualPage - 1)}><ChevronLeft size={16} /></button><button aria-label="Próxima página de inscritos" title="Próxima página" className={button} disabled={actualPage >= pages - 1} onClick={() => setPage(actualPage + 1)}><ChevronRight size={16} /></button></div></div>
    </>}
    <details className="text-xs leading-5 text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">Critérios e limites da aderência</summary><p className="mt-2">Cada característica recebe a frequência da categoria dividida pela frequência da categoria mais comum no curso. O índice é a média dessas razões, de 0 a 100. Maior aderência: a partir de 70; intermediária: de 40 a 69. São cortes operacionais, não limites validados de conversão. Exigimos 20 CPFs históricos e três características utilizáveis, com pelo menos dez observações conhecidas por característica. Cada CPF aparece uma vez por curso no histórico e na lista atual.</p><p className="mt-2">Usamos idade no evento, campus, turno e ingresso. Sexo, nacionalidade, situação financeira e matrícula posterior não determinam o índice. Ausência de informação não recebe nota zero. Não use aderência para negar atendimento ou oportunidade; perfis menos comuns também se matriculam. Uma probabilidade exigirá validar resultados por CPF, curso e período em testes temporais, com inscritos que converteram e que não converteram.</p>{Boolean(model.invalidCpf || model.future) && <p className="mt-2">Fora desta lista: {model.invalidCpf} registros sem CPF válido e {model.future} inscrições posteriores à data de corte.</p>}</details>
  </section>
}
