import { useMemo } from 'react'
import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildCampaignComparison } from '../../lib/campaignComparison'
import type { CampaignData, ForecastConfig } from '../../lib/campaignForecast'
import { formatNumberBR } from '../../lib/formatters'

const colors = ['#0284c7', '#059669', '#d97706', '#db2777', '#0f766e']
const date = (value: string | number) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(typeof value === 'number' ? value * 86400000 : value + 'T00:00:00Z'))

export function CampaignComparison({ data, config, periods, onSelectPeriod }: { data: CampaignData[]; config: ForecastConfig; periods: string[]; onSelectPeriod: (period: string, additive: boolean) => void }) {
  const models = useMemo(() => [
    { title: 'Inscritos na mesma data', model: buildCampaignComparison(data, { ...config, references: periods }, 'inscritos') },
    { title: 'Calouros na mesma data', model: buildCampaignComparison(data, { ...config, references: periods }, 'calouros') },
  ], [data, config, periods])
  return <section aria-label="Comparação na mesma data" className="space-y-4 border-t border-slate-200 pt-5">
    <div><h3 className="text-lg font-semibold text-slate-950">Como estávamos nesta data?</h3><p className="mt-1 text-sm text-slate-500">Acumulado no mesmo dia e mês em cada ano, dentro da janela de campanha selecionada.</p></div>
    <div className="grid gap-5 xl:grid-cols-2">{models.map(({ title, model }) => <article key={title} className="min-w-0 border-t border-slate-200 pt-4">
      <h4 className="font-semibold text-slate-950">{title}</h4>
      {model ? <>
        <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={model.points} margin={{ top: 20, left: 0, right: 40, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tickFormatter={date} minTickGap={35} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(value) => date(String(value))} formatter={(value, name) => [formatNumberBR(Number(value)), String(name)]} />
          <Legend />
          {model.series.map((series, index) => <Line key={series.period} name={series.period} dataKey={series.period} stroke={series.period === config.currentPeriod ? '#0f172a' : colors[index % colors.length]} strokeOpacity={series.period === config.currentPeriod || config.references.includes(series.period) ? 1 : 0.25} strokeWidth={series.period === config.currentPeriod ? 3 : 2} isAnimationActive={false} dot={false} connectNulls={false} cursor="pointer" onClick={(_props, event) => onSelectPeriod(series.period, Boolean(event.ctrlKey || event.metaKey))}>
            <LabelList dataKey={series.period} content={(props) => {
              if (Number(props.index) !== model.points.length - 1 || props.value === null || props.value === undefined) return null
              if (model.series.some((other, j) => j > index && other.atCut === series.atCut)) return null
              return <text x={Number(props.x) + 5} y={Number(props.y) + 4} fill={series.period === config.currentPeriod ? '#0f172a' : colors[index % colors.length]} fontSize={11} fontWeight={700}>{formatNumberBR(Number(props.value))}</text>
            }} />
          </Line>)}
        </LineChart></ResponsiveContainer></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">PS</th><th className="py-2">Corte</th><th className="py-2 text-right">Acumulado</th><th className="py-2 text-right">2027.1 x PS</th></tr></thead><tbody className="divide-y divide-slate-100">{model.series.map((series) => {
          const current = model.series.find((item) => item.period === config.currentPeriod)?.atCut
          const difference = series.period !== config.currentPeriod && current !== null && current !== undefined && series.atCut ? current / series.atCut - 1 : null
          return <tr key={series.period}><th className="py-2 font-medium">{series.period}</th><td>{date(series.cutoff)}</td><td className="text-right font-semibold">{series.atCut === null ? 'Indisponível' : formatNumberBR(series.atCut)}</td><td className="text-right">{difference === null ? '-' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(difference)}</td></tr>
        })}</tbody></table></div>
        <p className="mt-3 text-xs text-slate-500">Últimos 7 dias: <strong>{formatNumberBR(model.recent)}</strong>{model.fullWeeks ? ` · 7 dias anteriores: ${formatNumberBR(model.prior)}` : ' · janela atual ainda menor que duas semanas'}.</p>
        {model.series.some((item) => item.missing || item.invalidCpf || !item.available) && <p role="status" className="mt-2 text-xs text-amber-800">Há bases indisponíveis ou registros sem CPF/data válidos. Esses registros não entram nas curvas; confira a tabela de referências abaixo.</p>}
      </> : <p className="py-12 text-sm text-slate-500">Confira as datas da campanha para exibir a comparação.</p>}
    </article>)}</div>
    <p className="text-xs leading-5 text-slate-500">CPF único por PS. Calouros usam {config.matriculaDate === 'payment' ? 'a baixa do pagamento' : 'a data de matrícula'} e o contrato ativo da carga disponível, não um retrato histórico do contrato naquela data. Veteranos não entram nestas curvas porque a data original da matrícula não representa a renovação.</p>
  </section>
}
