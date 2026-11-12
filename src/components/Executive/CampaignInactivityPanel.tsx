import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, GraduationCap, Search, UsersRound } from 'lucide-react'
import { buildCampaignPlanning, type PlanningDimension } from '../../lib/campaignPlanning'
import type { CampaignData, ForecastConfig } from '../../lib/campaignForecast'
import type { GenericRow } from '../../lib/dashboardHelpers'
import { normalizedText } from '../../lib/studentProfile'
import { formatNumberBR } from '../../lib/formatters'

type Dimension = Extract<PlanningDimension, 'curso' | 'campus' | 'curso_campus'>
type Props = {
  data: CampaignData[]
  config: ForecastConfig
  resolveLabel: (row: GenericRow, enrollment: boolean, dimension: PlanningDimension) => string
  onFocusGroup: (dimension: Dimension, label: string) => void
}
const control = 'h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800'
const lastDate = (day: number | null) => day === null ? 'Nenhum no recorte' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(day * 86400000))

export function CampaignInactivityPanel({ data, config, resolveLabel, onFocusGroup }: Props) {
  const [dimension, setDimension] = useState<Dimension>('curso_campus')
  const [query, setQuery] = useState('')
  const [threshold, setThreshold] = useState(7)
  const [pages, setPages] = useState({ registrations: 0, enrollments: 0 })
  const model = useMemo(() => buildCampaignPlanning(data, config, dimension, 'matriculas', resolveLabel, false), [data, config, dimension, resolveLabel])
  if (!model) return null
  const groups = model.groups.filter((group) => normalizedText(group.label).includes(normalizedText(query)))
  const blocks = [
    { key: 'registrations' as const, title: 'Sem novas inscrições', countLabel: 'Inscritos', Icon: UsersRound },
    { key: 'enrollments' as const, title: 'Sem novas matrículas', countLabel: 'Calouros', Icon: GraduationCap },
  ]
  return <section aria-label="Acompanhamento de inatividade" className="space-y-4 border-y border-slate-200 py-5">
    <header><h3 className="text-lg font-semibold text-slate-950">Onde o movimento parou?</h3><p className="mt-1 text-sm text-slate-500">Inscrições e matrículas por curso e campus · processo {config.currentPeriod}</p></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_240px_160px]">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Buscar curso ou campus<span className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search size={15} /><input aria-label="Buscar curso ou campus na inatividade" value={query} onChange={(event) => { setQuery(event.target.value); setPages({ registrations: 0, enrollments: 0 }) }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></span></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Agrupar acompanhamento<select aria-label="Agrupar acompanhamento de inatividade" value={dimension} onChange={(event) => { setDimension(event.target.value as Dimension); setPages({ registrations: 0, enrollments: 0 }) }} className={control}><option value="curso_campus">Curso e campus</option><option value="curso">Curso</option><option value="campus">Campus</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Alerta a partir de dias<input aria-label="Dias para alerta de inatividade" type="number" min={1} max={730} value={threshold} onChange={(event) => setThreshold(Math.max(1, Math.min(730, Number(event.target.value) || 1)))} className={control} /></label>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">{blocks.map(({ key, title, countLabel, Icon }) => {
      const days = (group: typeof groups[number]) => group[key].available && !group[key].invalid ? group[key].daysSince ?? model.elapsed : -1
      const sorted = [...groups].sort((a, b) => days(b) - days(a) || (b[key].count ?? -1) - (a[key].count ?? -1) || a.label.localeCompare(b.label, 'pt-BR'))
      const pageCount = Math.max(1, Math.ceil(sorted.length / 8)), page = Math.min(pages[key], pageCount - 1)
      const alerted = sorted.filter((group) => days(group) >= threshold).length
      return <article key={key} aria-label={title} className="min-w-0 border-t border-slate-200 pt-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 font-semibold text-slate-950"><Icon size={18} />{title}</h4><span className={'text-xs font-medium ' + (alerted ? 'text-amber-800' : 'text-slate-500')}>{alerted} {alerted === 1 ? 'grupo' : 'grupos'} em alerta</span></header>
        <div className="overflow-x-auto"><table className="w-full table-fixed text-left text-sm sm:min-w-[480px] sm:table-auto"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="w-[54%] py-2 pr-3 sm:w-auto">{dimension === 'campus' ? 'Campus' : dimension === 'curso' ? 'Curso' : 'Curso / campus'}</th><th className="w-[18%] px-1 py-2 text-right sm:w-auto sm:px-2">{countLabel}</th><th className="w-[28%] px-1 py-2 text-right sm:w-auto sm:px-2">Dias sem novos</th><th className="hidden py-2 pl-3 sm:table-cell">Último registro</th></tr></thead><tbody className="divide-y divide-slate-100">{sorted.slice(page * 8, page * 8 + 8).map((group) => {
          const events = group[key], idle = days(group), isAlert = idle >= threshold
          const last = !events.available ? 'Base indisponível' : events.invalid ? 'Conferir datas / CPF' : lastDate(events.last)
          return <tr key={group.label} className="hover:bg-white"><th className="max-w-[240px] py-3 pr-3 font-medium"><button type="button" className="break-words text-left leading-5 text-sky-800 hover:underline" onClick={() => onFocusGroup(dimension, group.label)}>{group.label}</button><p className="mt-1 text-xs font-normal text-slate-500 sm:hidden">{last}</p></th><td className="px-1 py-3 text-right tabular-nums sm:px-2">{events.count === null ? '-' : formatNumberBR(events.count)}</td><td className="px-1 py-3 text-right sm:px-2"><span className={'inline-block min-w-10 rounded px-2 py-1 font-semibold tabular-nums ' + (isAlert ? 'bg-amber-100 text-amber-900' : 'text-slate-800')}>{idle < 0 ? '-' : idle}</span></td><td className="hidden py-3 pl-3 text-xs leading-5 text-slate-500 sm:table-cell">{last}</td></tr>
        })}{!sorted.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Nenhum curso ou campus neste recorte.</td></tr>}</tbody></table></div>
        <footer className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{sorted.length} grupos · {page + 1}/{pageCount}</span><div className="flex gap-2"><button type="button" aria-label={'Página anterior: ' + title} title="Página anterior" disabled={!page} onClick={() => setPages((current) => ({ ...current, [key]: page - 1 }))} className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft size={15} /></button><button type="button" aria-label={'Próxima página: ' + title} title="Próxima página" disabled={page >= pageCount - 1} onClick={() => setPages((current) => ({ ...current, [key]: page + 1 }))} className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronRight size={15} /></button></div></footer>
      </article>
    })}</div>
    <p className="text-xs leading-5 text-slate-500">Dias corridos desde o último evento até o corte. Sem registro na janela, contamos desde o início da campanha. Pendências de CPF/data não geram alerta automático. Este acompanhamento mantém seu próprio agrupamento; escolher “Geral” na projeção não o reduz a uma linha.</p>
  </section>
}
