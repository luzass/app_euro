import { useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Target } from 'lucide-react'
import { buildCampaignPlanning, monthlyPolicyProgress, planningTimeline, type PlanningDimension, type PlanningGrain, type PlanningMetric } from '../../lib/campaignPlanning'
import type { CampaignData, ForecastConfig } from '../../lib/campaignForecast'
import { campaignPolicy20271 } from '../../lib/campaignPolicy20271'
import { normalizeCampus, normalizeIngresso, titleize, type GenericRow } from '../../lib/dashboardHelpers'
import { profileField } from '../../lib/studentProfile'
import { formatNumberBR } from '../../lib/formatters'
import { CampaignInactivityPanel } from './CampaignInactivityPanel'

const control = 'h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800'
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const show = (value: number | null) => value === null ? '-' : formatNumberBR(value)
const date = (day: number | null) => day === null ? '-' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(day * 86400000))
function labelFor(row: GenericRow, enrollment: boolean, dimension: PlanningDimension) {
  const course = titleize(profileField(row, 'curso'))
  const campus = normalizeCampus(profileField(row, ...(enrollment ? ['filial', 'campus'] : ['campus', 'filial'])))
  return dimension === 'geral' ? 'GERAL' : dimension === 'curso' ? course : dimension === 'campus' ? campus : dimension === 'curso_campus' ? `${course} / ${campus}`
    : normalizeIngresso(profileField(row, ...(enrollment ? ['tipo_de_ingresso'] : ['forma_de_ingresso', 'tipo_de_ingresso'])))
}

export function CampaignPlanningPanel({ data, goalData, config }: { data: CampaignData[]; goalData: CampaignData[]; config: ForecastConfig }) {
  const [dimension, setDimension] = useState<PlanningDimension>('curso_campus')
  const [metric, setMetric] = useState<PlanningMetric>('matriculas')
  const [grain, setGrain] = useState<PlanningGrain>('week')
  const [mode, setMode] = useState('trajectory')
  const [selected, setSelected] = useState('GERAL')
  const [highlighted, setHighlighted] = useState<string[] | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [tier, setTier] = useState(0)
  const model = useMemo(() => buildCampaignPlanning(data, config, dimension, metric, labelFor), [data, config, dimension, metric])
  const general = useMemo(() => buildCampaignPlanning(data, config, 'geral', metric, labelFor), [data, config, metric])
  const month = useMemo(() => monthlyPolicyProgress(goalData, config, tier), [goalData, config, tier])
  const selectedGroup = model?.groups.find((group) => group.label === selected)
  const activeModel = selectedGroup ? model : general
  const group = selectedGroup ?? general?.groups[0]
  const timeline = useMemo(() => activeModel && group ? planningTimeline(activeModel, group, grain) : [], [activeModel, group, grain])
  const tickDate = (value: string) => {
    const point = timeline.find((item) => item.label === value)
    return point ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(new Date(point.end * 86400000)) : value
  }
  if (!model || !general || !group) return <p role="status" className="border-l-4 border-amber-500 p-4 text-sm text-amber-900">Confira início, corte e data-alvo para abrir o planejamento da campanha.</p>
  const colors = ['#0284c7', '#059669', '#d97706', '#db2777', '#0f766e']
  const series = mode === 'comparative'
    ? [['actual', config.currentPeriod, '#0f172a', config.currentPeriod], ...group.references.map((reference, index) => [`history_${reference.period.replace('.', '_')}`, reference.period, colors[index % colors.length], reference.period])]
    : [['actual', 'Realizado', '#0f172a'], ['historical', 'Média dos PS anteriores', '#94a3b8'], ['linear', 'Projeção linear', '#0284c7'], ['adjusted', 'Projeção ajustada', '#059669']].filter(([key]) => key === 'actual' || key === 'historical' && group.usable.length > 0 || key === 'linear' && group.linear !== null || key === 'adjusted' && group.adjusted !== null)
  const notices = [
    group.selected.future ? `${group.selected.future} eventos atuais após o corte ficam fora do realizado.` : '',
    group.selected.invalid ? `${group.selected.invalid} pendências de CPF/data no grupo atual.` : '',
    ...group.references.filter((reference) => !reference.available || reference.invalid).map((reference) => `${reference.period}: ${!reference.available ? 'base indisponível' : `${reference.invalid} pendências de CPF/data`}.`),
  ].filter(Boolean)
  return <section ref={panelRef} aria-label="Planejamento da campanha" className="space-y-5 border-y border-slate-200 py-5">
    <header><h3 className="text-xl font-semibold text-slate-950">Direção da campanha</h3><p className="mt-1 text-sm text-slate-500">Processo {config.currentPeriod} · {model.elapsed} dias observados · {model.remaining} dias restantes · corte {date(model.cutoff)}</p></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Indicador<select aria-label="Indicador do planejamento" className={control} value={metric} onChange={(event) => setMetric(event.target.value as PlanningMetric)}><option value="matriculas">Matrículas de calouros</option><option value="inscritos">Inscrições</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Detalhamento<select aria-label="Detalhamento da campanha" className={control} value={dimension} onChange={(event) => { setDimension(event.target.value as PlanningDimension); setSelected('GERAL') }}><option value="geral">Geral</option><option value="curso">Curso</option><option value="campus">Campus</option><option value="curso_campus">Curso e campus</option><option value="ingresso">Forma de ingresso</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Intervalo<select aria-label="Intervalo do planejamento" className={control} value={grain} onChange={(event) => setGrain(event.target.value as PlanningGrain)}><option value="day">Dia</option><option value="week">Semana da campanha</option><option value="month">Mês</option></select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Gráfico<select aria-label="Gráfico do planejamento" className={control} value={mode} onChange={(event) => setMode(event.target.value)}><option value="trajectory">Acumulado e direção projetada</option><option value="volume">Realizado em cada intervalo</option><option value="comparative">Comparar processos seletivos</option></select></label>
    </div>
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Grupo no gráfico<select aria-label="Grupo no gráfico" className={control + ' w-full'} value={selectedGroup ? selected : 'GERAL'} onChange={(event) => setSelected(event.target.value)}><option value="GERAL">Geral do recorte</option>{model.groups.filter((row) => row.label !== 'GERAL').map((row) => <option key={row.label} value={row.label}>{row.label}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5" aria-label="Direção do grupo selecionado">{[
      ['Realizado até o corte', show(group.count)], ['Média por dia corrido', group.rate === null ? '-' : decimal.format(group.rate)],
      ['Frente ao histórico no corte', group.index === null ? 'Sem base' : percent.format(group.index - 1)], ['Fechamento linear', show(group.linear)], ['Fechamento ajustado', group.adjusted === null ? 'Sem base' : show(group.adjusted)],
    ].map(([label, value]) => <div key={label}><p className="min-h-10 text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold text-slate-950">{value}</p></div>)}</div>
    <p className="text-sm leading-6 text-slate-600">{group.adjusted === null ? group.reason : `${show(group.count)} realizados + ${decimal.format(group.historicalRemaining ?? 0)} eventos históricos ainda esperados × índice ${decimal.format(group.index ?? 0)} = ${show(group.adjusted)} no fechamento.`} {group.adjusted !== null && `Cenários históricos: ${show(group.low)} a ${show(group.high)}; não são intervalo de confiança.`}</p>
    <details className="text-sm leading-6 text-slate-600"><summary className="cursor-pointer font-medium text-slate-800">Entender os fechamentos linear e ajustado</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><div><h4 className="font-semibold text-slate-900">Linear · manter o ritmo atual</h4><p>{show(group.count)} realizados ÷ {model.elapsed} dias observados = {group.rate === null ? '-' : decimal.format(group.rate)} por dia. Mantendo essa média nos {model.remaining} dias restantes: {show(group.count)} + média diária × {model.remaining} = <strong>{show(group.linear)}</strong>.</p></div><div><h4 className="font-semibold text-slate-900">Ajustado · considerar o calendário histórico</h4><p>Os PS anteriores tinham média de {group.historicalAtCut === null ? '-' : decimal.format(group.historicalAtCut)} até o corte equivalente e realizaram mais {group.historicalRemaining === null ? '-' : decimal.format(group.historicalRemaining)} depois. O índice atual é realizado ÷ média no corte. Aplicamos esse índice somente ao trecho histórico restante e somamos o realizado: <strong>{show(group.adjusted)}</strong>.</p></div></div><p className="mt-3 text-xs">O linear supõe ritmo constante. O ajustado supõe que a distribuição histórica ao longo da campanha se repita, proporcionalmente ao avanço atual; chamadas de PROUNI e mudanças de campanha podem alterar esse padrão. Médias e índices exibidos são arredondados; o cálculo usa os valores completos. São cenários, não garantias.</p></details>
    {notices.length > 0 && <p role="status" className="border-l-4 border-amber-500 p-3 text-xs text-amber-900">{notices.join(' ')} Históricos com pendências não entram no ajuste.</p>}
    {mode !== 'volume' && <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Legenda do planejamento">{series.map(([key, label, color]) => <span key={key} className="inline-flex items-center gap-1.5" style={{ color }}><span className="h-0.5 w-4 shrink-0" style={{ backgroundColor: color }} />{label}</span>)}</div>}
    <div className="overflow-x-auto border-y border-slate-200 py-3"><div style={{ minWidth: mode === 'volume' ? Math.max(620, timeline.length * (grain === 'day' ? 28 : 44)) : 0, height: 310 }}>
      <ResponsiveContainer width="100%" height="100%">{mode === 'volume' ? <BarChart data={timeline} margin={{ left: 0, top: 20, right: 25, bottom: 35 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" interval={grain === 'day' ? 2 : 0} tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
        <YAxis allowDecimals={false} width={45} tick={{ fontSize: 11 }} />
        <Tooltip cursor={false} formatter={(value) => [show(Number(value)), metric === 'inscritos' ? 'Inscritos' : 'Calouros']} />
        <Bar dataKey="volume" fill="#0284c7" maxBarSize={26} isAnimationActive={false}><LabelList dataKey="volume" position="top" fill="#0f172a" fontWeight={700} fontSize={11} formatter={(value: number | null) => value ? show(value) : ''} /></Bar>
      </BarChart>
        : <LineChart data={timeline} margin={{ left: 8, top: 18, right: 45, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={40} tick={{ fontSize: 10 }} tickFormatter={tickDate} />
          <YAxis allowDecimals={false} width={35} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value, name) => [decimal.format(Number(value)), String(name)]} />
          <ReferenceLine x={timeline.find((point) => point.end === model.cutoff)?.label} stroke="#94a3b8" strokeDasharray="2 3" label={{ value: 'Corte', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
          {series.map(([key, label, color, period], seriesIndex) => <Line key={key} type="linear" dataKey={key} name={label} stroke={color} strokeOpacity={mode === 'comparative' && highlighted && !highlighted.includes(period ?? '') ? 0.2 : 1} strokeWidth={key === 'actual' || key === 'adjusted' ? 3 : 2} strokeDasharray={key === 'linear' || key === 'adjusted' ? '5 4' : undefined} connectNulls={false} isAnimationActive={false} dot={false} cursor={period ? 'pointer' : undefined} onClick={(_props, event) => { if (period) setHighlighted((current) => event.ctrlKey || event.metaKey ? current?.includes(period) ? current.length === 1 ? null : current.filter((value) => value !== period) : [...(current ?? []), period] : current?.length === 1 && current[0] === period ? null : [period]) }}><LabelList dataKey={key} content={(props) => {
          const index = Number(props.index), value = props.value
          if (value === null || value === undefined || (key === 'actual' ? timeline[index + 1]?.actual !== null && index !== timeline.length - 1 : index !== timeline.length - 1)) return null
          if (index === timeline.length - 1 && series.some(([otherKey], otherIndex) => otherIndex > seriesIndex && timeline[index]?.[otherKey as keyof typeof timeline[number]] === value)) return null
          return <text x={Number(props.x) + 4} y={Number(props.y) + (key === 'linear' ? 15 : -7)} fontSize={11} fill={color} fontWeight={700}>{decimal.format(Number(value))}</text>
        }} /></Line>)}</LineChart>}</ResponsiveContainer>
    </div></div>
    <CampaignInactivityPanel data={data} config={config} resolveLabel={labelFor} onFocusGroup={(nextDimension, label) => { setDimension(nextDimension); setSelected(label); panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
    {config.currentPeriod === campaignPolicy20271.period && <section aria-label="Metas mensais oficiais" className="space-y-3 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><h4 className="flex items-center gap-2 font-semibold text-slate-950"><Target size={18} />Metas mensais regulares · sem Medicina e sem PROUNI</h4><label className="flex flex-col gap-1 text-xs text-slate-600">Faixa<select aria-label="Faixa da meta mensal" className={control} value={tier} onChange={(event) => setTier(Number(event.target.value))}>{[0, 1, 2, 3].map((value) => <option key={value} value={value}>Meta 0{value + 1}</option>)}</select></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[610px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="p-2">Mês</th><th className="p-2 text-right">Meta mensal</th><th className="p-2 text-right">Realizado até o corte</th><th className="p-2 text-right">Guia linear até o corte</th><th className="p-2 text-right">Faltam no mês</th></tr></thead><tbody className="divide-y divide-slate-100">{month.rows.map((row) => <tr key={row.month}><th className="p-2 font-medium">{row.label}{row.partial ? ' · parcial' : ''}</th><td className="p-2 text-right">{row.target}</td><td className="p-2 text-right">{show(row.observed)}</td><td className="p-2 text-right">{decimal.format(row.guide)}</td><td className="p-2 text-right">{show(row.gap)}</td></tr>)}</tbody></table></div>
      <p className="text-xs leading-5 text-slate-500">Escopo institucional, independente dos filtros de curso. Apuração pela baixa do pagamento, contrato ativo, calouro e CPF único. Faixas mensais independentes e não cumulativas para bonificação; o guia linear é só planejamento. PROUNI é apurado no PS inteiro: 204 / 235 / 245, sem quarta faixa. Fonte: política final, páginas 2 e 4.{month.invalidDates > 0 ? ` ${month.invalidDates} CPFs regulares sem baixa válida precisam de conferência.` : ''}</p>
    </section>}
    <details className="text-xs leading-5 text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">Como o histórico ajusta a direção</summary><p className="mt-2">Índice = realizado atual ÷ média histórica no mesmo corte. Fechamento ajustado = realizado atual + eventos históricos ainda esperados × índice. Não multiplicamos a média atual novamente pelo mesmo índice, o que contaria o desempenho duas vezes. A projeção linear usa realizado ÷ dias corridos observados × duração restante, somado ao realizado.</p><p className="mt-2">Ajuste exige ao menos 3 eventos atuais, dois PS históricos utilizáveis e 10 CPFs históricos somados até o corte. São regras operacionais de suficiência, não validação de precisão. Cursos sem suporte ficam apenas com a referência linear e o motivo visível. Calouros ativos usam a data selecionada; datas originais de veteranos não são tratadas como novas renovações. Históricos refletem a carga preservada hoje, não fotografias dos contratos no passado.</p></details>
  </section>
}
