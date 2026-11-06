import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckboxFilter } from '../UI/CheckboxFilter'
import { buildCampaignForecast, type CampaignData, type ForecastScenario } from '../../lib/campaignForecast'
import type { FilterSelection } from '../../lib/profileFilters'
import { formatNumberBR } from '../../lib/formatters'

const calendarKey = 'unieuro.executivo.calendario.20271.v1'
const defaultCalendar = { start: '2026-09-29', end: '2027-03-31' }
const fieldClass = 'h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800'
const show = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatNumberBR(value)
const dateLabel = (value: number | null) => value === null ? '—' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value * 86400000))

function loadCalendar() {
  try {
    const saved = JSON.parse(localStorage.getItem(calendarKey) ?? 'null')
    if (typeof saved?.start === 'string' && typeof saved?.end === 'string') return { start: saved.start as string, end: saved.end as string }
  } catch { /* The default calendar also works without browser storage. */ }
  return defaultCalendar
}

function ProjectionCard({ title, scenario }: { title: string; scenario: ForecastScenario }) {
  return <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-medium text-slate-600">{title}</h3>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-slate-500">Realizado na carga</p><p className="mt-1 text-xl font-semibold text-slate-900">{show(scenario.observed)}</p></div><div className="text-right"><p className="text-xs text-slate-500">Projeção de referência</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{show(scenario.reference)}</p></div></div>
    <p className="mt-3 text-xs leading-5 text-slate-500">{scenario.reason || 'Conservador: ' + show(scenario.low) + ' · Expansivo: ' + show(scenario.high)}</p>
  </article>
}

export function ForecastPanel({ data, currentPeriod, asOf }: { data: CampaignData[]; currentPeriod: string; asOf: string }) {
  const [calendar, setCalendar] = useState(loadCalendar)
  const [references, setReferences] = useState<FilterSelection>(null)
  const history = data.filter((item) => item.period < currentPeriod && item.period.endsWith('.1')).map((item) => item.period)
  const referencePeriods = references ?? history
  const model = useMemo(() => buildCampaignForecast(data, { currentPeriod, ...calendar, asOf, references: referencePeriods }), [data, currentPeriod, calendar, asOf, referencePeriods])
  useEffect(() => {
    try { localStorage.setItem(calendarKey, JSON.stringify(calendar)) } catch { /* Storage is optional. */ }
  }, [calendar])
  const projections = [
    { title: 'Inscritos', scenario: model.inscritos.scenario },
    { title: 'Calouros', scenario: model.calouros.scenario },
    { title: 'Veteranos, incluindo renovações', scenario: model.veteranos },
    { title: 'Total de matriculados', scenario: model.total },
  ]
  const chartData = projections.map(({ title, scenario }) => ({ label: title === 'Veteranos, incluindo renovações' ? 'Veteranos' : title === 'Total de matriculados' ? 'Total' : title, realizado: scenario.observed, referencia: scenario.reference }))
  return <div className="space-y-6">
    <section className="space-y-4 border-b border-slate-200 pb-5">
      <div><h2 className="text-xl font-semibold text-slate-950">Projeção do processo seletivo {currentPeriod}</h2><p className="mt-1 text-sm text-slate-500">Cenários por CPF único. O total projetado soma calouros e veteranos.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Início da campanha<input type="date" aria-label="Início da campanha" value={calendar.start} className={fieldClass} onChange={(event) => setCalendar((current) => ({ ...current, start: event.target.value }))} /></label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Data-alvo da projeção<input type="date" aria-label="Data-alvo da projeção" value={calendar.end} className={fieldClass} onChange={(event) => setCalendar((current) => ({ ...current, end: event.target.value }))} /></label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Data de corte<input type="date" aria-label="Data de corte" value={asOf} readOnly className={fieldClass + ' bg-slate-50'} /></label>
        <CheckboxFilter label="Referências históricas" options={history.map((period) => ({ value: period, label: period }))} selected={references} onChange={setReferences} />
      </div>
      <p className="text-xs leading-5 text-slate-500">Início informado: 29/09/2026. A data-alvo inicial de 31/03/2027 representa o encerramento previsto em março e pode ser ajustada. O calendário é salvo neste navegador.</p>
    </section>
    {model.unknownTypes > 0 && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{model.unknownTypes} CPF sem classificação única entre calouro e veterano. A soma projetada fica pendente até a conferência desses vínculos.</p>}
    <section aria-label="Projeções por indicador" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{projections.map((item) => <ProjectionCard key={item.title} {...item} />)}</section>
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-950">Realizado e projeção de referência</h3>
      <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 45, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="label" interval={0} width={75} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => formatNumberBR(Number(value))} /><Legend />
        <Bar dataKey="realizado" name="Realizado na carga" fill="#0284c7" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}><LabelList dataKey="realizado" position="right" fill="#0f172a" fontSize={11} fontWeight={700} formatter={show} /></Bar>
        <Bar dataKey="referencia" name="Projeção de referência" fill="#059669" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}><LabelList dataKey="referencia" position="right" fill="#0f172a" fontSize={11} fontWeight={700} formatter={show} /></Bar>
      </BarChart></ResponsiveContainer></div>
    </article>
    <section className="space-y-3 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-950">Referências do ritmo de captação</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[880px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">PS</th><th className="p-3">Corte equivalente</th><th className="p-3 text-right">Inscritos no corte / janela</th><th className="p-3 text-right">Calouros no corte / janela</th><th className="p-3">Conferência</th></tr></thead><tbody className="divide-y divide-slate-100">
        {model.inscritos.audit.map((row) => { const calouro = model.calouros.audit.find((item) => item.period === row.period); return <tr key={row.period}><th scope="row" className="p-3 font-medium">{row.period}</th><td className="p-3">{dateLabel(row.cutoff)}</td><td className="p-3 text-right">{formatNumberBR(row.atCut)} / {formatNumberBR(row.total)}</td><td className="p-3 text-right">{formatNumberBR(calouro?.atCut ?? 0)} / {formatNumberBR(calouro?.total ?? 0)}</td><td className="max-w-[320px] p-3 text-xs text-slate-600">{[row.reason ? 'Inscritos: ' + row.reason : '', calouro?.reason ? 'Calouros: ' + calouro.reason : ''].filter(Boolean).join('; ') || 'Referência utilizável'}</td></tr> })}
        {!model.inscritos.audit.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhuma referência histórica selecionada.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="space-y-3 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-950">Referências de renovação e demais veteranos</h3>
      <p className="text-sm text-slate-600">Elegíveis no período anterior: {formatNumberBR(model.eligiblePrevious)}. Veteranos já observados: {formatNumberBR(model.observedRenewals)} entre esses elegíveis e {formatNumberBR(model.observedOthers)} nos demais vínculos.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">Transição</th><th className="p-3 text-right">Elegíveis anteriores</th><th className="p-3 text-right">Renovaram como veteranos</th><th className="p-3 text-right">Demais veteranos</th><th className="p-3">Conferência</th></tr></thead><tbody className="divide-y divide-slate-100">
        {model.vetAudit.map((row) => <tr key={row.period}><th scope="row" className="p-3 font-medium">{row.origin} → {row.period}</th><td className="p-3 text-right">{formatNumberBR(row.eligible)}</td><td className="p-3 text-right">{formatNumberBR(row.renewals)}</td><td className="p-3 text-right">{formatNumberBR(row.others)}</td><td className="max-w-[300px] p-3 text-xs text-slate-600">{row.reason || 'Referência utilizável'}</td></tr>)}
        {!model.vetAudit.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhuma referência histórica selecionada.</td></tr>}
      </tbody></table></div>
    </section>
    <details className="border-y border-slate-200 py-4 text-sm text-slate-600"><summary className="cursor-pointer font-medium text-slate-900">Método, limites e teste retrospectivo</summary><div className="mt-3 space-y-3 leading-6">
      <p>Inscritos e calouros usam o ritmo acumulado das bases de primeiro semestre em janelas equivalentes ao calendário escolhido, deslocadas por ano. O corte histórico preserva a fração de tempo transcorrida. A projeção divide o realizado atual pela fração histórica concluída no corte. Os totais históricos se referem à janela comparável, não necessariamente ao PS inteiro.</p>
      <p>Veteranos usam duas ou mais transições históricas de segundo para primeiro semestre: elegíveis anteriores multiplicados pela taxa histórica de renovação como veterano, mais os demais veteranos observados nessas transições. Esses demais vínculos incluem retornos e vínculos fora da base elegível. A estimativa nunca fica abaixo do realizado de cada componente.</p>
      <p>Conservador, referência e expansivo representam os extremos e a mediana dos cenários históricos. Não são intervalos de confiança. O total soma os cenários de calouros e veteranos. As matrículas já observadas são o piso dos cenários; cancelamentos futuros não são estimados. Matrículas usam contrato ativo, classificação explícita de tipo de aluno e período letivo; datas de matrícula antigas dos veteranos não são tratadas como datas de renovação.</p>
      <p>Registros atuais sem datas ou classificação válidas deixam a projeção pendente. Alterações de preço, bolsas, investimento e critérios de coleta não são modeladas. Sem retratos históricos da mesma data de carga, a leitura é indicativa e pode refletir somente os vínculos preservados na base histórica.</p>
      {[['Inscritos', model.inscritos.backtest], ['Calouros', model.calouros.backtest]].map(([label, value]) => {
        const test = value as typeof model.inscritos.backtest
        return <p key={String(label)}>{String(label)}: {test ? `teste retrospectivo em ${test.period}, usando apenas referências anteriores. Estimado ${show(test.predicted)}, observado ${show(test.actual)}; erro absoluto percentual de ${new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(test.predicted - test.actual) / test.actual)}. Um exercício não valida a precisão futura.` : 'ainda sem três referências utilizáveis para executar o teste retrospectivo.'}</p>
      })}
      <p>Referência metodológica: <a href="https://otexts.com/fpp3/" target="_blank" rel="noreferrer" className="text-sky-700 underline">Forecasting: Principles and Practice</a>. O método de cenários desta página é uma aproximação operacional, não um modelo oficial do Inep.</p>
    </div></details>
  </div>
}
