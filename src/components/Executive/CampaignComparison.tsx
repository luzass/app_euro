import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildCampaignComparison } from '../../lib/campaignComparison'
import type { CampaignData, ForecastConfig } from '../../lib/campaignForecast'
import { formatNumberBR } from '../../lib/formatters'

const colors = ['#0284c7', '#059669', '#d97706', '#db2777', '#0f766e']
const date = (value: string | number) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(typeof value === 'number' ? value * 86400000 : value + 'T00:00:00Z'))
type Audit = { inscritos: Array<{ period: string; reason: string }>; calouros: Array<{ period: string; reason: string }> }

export function CampaignComparison({ data, config, periods, audit }: { data: CampaignData[]; config: ForecastConfig; periods: string[]; audit?: Audit }) {
  const [highlighted, setHighlighted] = useState<string[] | null>(null)
  const models = useMemo(() => [
    { kind: 'inscritos' as const, title: 'Inscritos na mesma data', model: buildCampaignComparison(data, { ...config, references: periods }, 'inscritos') },
    { kind: 'calouros' as const, title: 'Calouros na mesma data', model: buildCampaignComparison(data, { ...config, references: periods }, 'calouros') },
  ], [data, config, periods])
  const highlight = (period: string, additive: boolean) => setHighlighted((current) => additive
    ? current?.includes(period) ? current.length === 1 ? null : current.filter((item) => item !== period) : [...(current ?? []), period]
    : current?.length === 1 && current[0] === period ? null : [period])
  return <section aria-label="Comparação na mesma data" className="space-y-4 border-y border-slate-200 py-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-slate-950">Comparação dos processos seletivos .{config.currentPeriod.slice(-1)}</h3><p className="mt-1 text-sm text-slate-500">Inscritos e calouros no mesmo dia e mês de cada campanha · corte {date(config.asOf)}</p></div>{highlighted && <button type="button" title="Mostrar todos os processos" aria-label="Mostrar todos os processos no comparativo" className="rounded-lg border border-slate-200 p-2 text-slate-600" onClick={() => setHighlighted(null)}><RotateCcw size={16} /></button>}</header>
    <div className="grid gap-6 xl:grid-cols-2">{models.map(({ kind, title, model }) => <article key={kind} className="min-w-0">
      <h4 className="font-semibold text-slate-950">{title}</h4>
      {model ? <>
        <div className="mt-3 flex flex-wrap gap-3 text-xs" aria-label={'Processos no comparativo de ' + kind}>{model.series.map((series, index) => {
          const color = series.period === config.currentPeriod ? '#0f172a' : colors[index % colors.length]
          return <button type="button" key={series.period} aria-pressed={highlighted === null || highlighted.includes(series.period)} className="inline-flex items-center gap-1.5 py-1" style={{ color, opacity: highlighted === null || highlighted.includes(series.period) ? 1 : 0.35 }} onClick={(event) => highlight(series.period, event.ctrlKey || event.metaKey)}><span className="h-0.5 w-4" style={{ backgroundColor: color }} />{series.period}</button>
        })}</div>
        <div className="mt-2 h-64 sm:h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={model.points} margin={{ top: 20, left: 0, right: 42, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tickFormatter={date} minTickGap={35} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(value) => date(String(value))} formatter={(value, name) => [formatNumberBR(Number(value)), String(name)]} />
          {model.series.map((series, index) => <Line key={series.period} name={series.period} dataKey={series.period} stroke={series.period === config.currentPeriod ? '#0f172a' : colors[index % colors.length]} strokeOpacity={highlighted === null || highlighted.includes(series.period) ? 1 : 0.2} strokeWidth={series.period === config.currentPeriod ? 3 : 2} isAnimationActive={false} dot={false} connectNulls={false} cursor="pointer" onClick={(_props, event) => highlight(series.period, Boolean(event.ctrlKey || event.metaKey))}>
            <LabelList dataKey={series.period} content={(props) => {
              if (Number(props.index) !== model.points.length - 1 || props.value === null || props.value === undefined) return null
              if (model.series.some((other, j) => j > index && other.atCut === series.atCut)) return null
              return <text x={Number(props.x) + 5} y={Number(props.y) + 4} fill={series.period === config.currentPeriod ? '#0f172a' : colors[index % colors.length]} fontSize={11} fontWeight={700}>{formatNumberBR(Number(props.value))}</text>
            }} />
          </Line>)}
        </LineChart></ResponsiveContainer></div>
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[470px] text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">PS</th><th className="py-2">Corte</th><th className="py-2 text-right">Acumulado</th><th className="px-3 py-2 text-right">{config.currentPeriod} x PS</th><th className="py-2">Base histórica</th></tr></thead><tbody className="divide-y divide-slate-100">{model.series.map((series) => {
          const current = model.series.find((item) => item.period === config.currentPeriod)?.atCut
          const difference = series.period !== config.currentPeriod && current !== null && current !== undefined && series.atCut ? current / series.atCut - 1 : null
          const reason = audit?.[kind].find((item) => item.period === series.period)?.reason
          const status = series.period === config.currentPeriod ? 'Processo atual' : !series.available ? 'Sem dados datados disponíveis' : reason || (!config.references.includes(series.period) ? 'Fora da calibração selecionada' : 'Utilizável na projeção')
          return <tr key={series.period}><th className="py-2 font-medium">{series.period}</th><td>{date(series.cutoff)}</td><td className="text-right font-semibold">{series.atCut === null ? '-' : formatNumberBR(series.atCut)}</td><td className="px-3 text-right">{difference === null ? '-' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(difference)}</td><td className={'max-w-[170px] py-2 ' + (reason || !series.available ? 'text-amber-800' : 'text-slate-500')}>{status}</td></tr>
        })}</tbody></table></div>
        <p className="mt-3 text-xs text-slate-500">Últimos 7 dias: <strong>{formatNumberBR(model.recent)}</strong>{model.fullWeeks ? ` · 7 dias anteriores: ${formatNumberBR(model.prior)}` : ' · janela atual ainda menor que duas semanas'}.</p>
        {model.series.some((item) => item.missing || item.invalidCpf) && <p role="status" className="mt-2 text-xs text-amber-800">A curva mostra somente registros datados com CPF válido. Datas pendentes impedem que esse PS sustente a calibração, mas não escondem os registros conhecidos do comparativo.</p>}
      </> : <p className="py-12 text-sm text-slate-500">Confira as datas da campanha para exibir a comparação.</p>}
    </article>)}</div>
    <p className="text-xs leading-5 text-slate-500">CPF único por PS. Calouros usam {config.matriculaDate === 'payment' ? 'a baixa do pagamento' : 'a data de matrícula'} e contrato ativo. O destaque das curvas não altera a calibração da previsão. Os históricos refletem a carga preservada, não uma fotografia dos contratos naquela data.</p>
  </section>
}
