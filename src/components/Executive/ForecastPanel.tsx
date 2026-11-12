import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckboxFilter } from '../UI/CheckboxFilter'
import { buildCampaignForecast, type CampaignData, type ForecastScenario } from '../../lib/campaignForecast'
import type { FilterSelection } from '../../lib/profileFilters'
import { formatNumberBR } from '../../lib/formatters'
import { CampaignComparison } from './CampaignComparison'
import { PaceForecastPanel } from './PaceForecastPanel'
import { CampaignPlanningPanel } from './CampaignPlanningPanel'

const calendarKey = 'unieuro.executivo.calendario.20271.v1'
const defaultCalendar = { start: '2026-09-29', end: '2027-03-31', matriculaDate: 'payment' as 'payment' | 'enrollment' }
const fieldClass = 'h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800'
const show = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatNumberBR(value)
const dateLabel = (value: number | null) => value === null ? '—' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value * 86400000))

function loadCalendar() {
  try {
    const saved = JSON.parse(localStorage.getItem(calendarKey) ?? 'null')
    if (typeof saved?.start === 'string' && typeof saved?.end === 'string') return { start: saved.start as string, end: saved.end as string, matriculaDate: saved.matriculaDate === 'enrollment' ? 'enrollment' as const : 'payment' as const }
  } catch { /* The default calendar also works without browser storage. */ }
  return defaultCalendar
}

function ProjectionCard({ title, scenario, window }: { title: string; scenario: ForecastScenario; window?: { atCut: number; beforeStart: number; afterCut: number } }) {
  const label = scenario.complete === false && scenario.reference !== null ? 'Cenário parcial' : scenario.method === 'linear' ? 'Projeção linear' : title.startsWith('Veteranos') ? 'Cenário de renovação' : scenario.method === 'cohort' ? 'Cenário por conversão' : scenario.method === 'mixed' ? 'Cenário combinado' : 'Demanda prevista'
  return <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-medium text-slate-600">{title}</h3>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-slate-500">Realizado na carga</p><p className="mt-1 text-xl font-semibold text-slate-900">{show(scenario.observed)}</p></div><div className="text-right"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{show(scenario.reference)}</p></div></div>
    <p className="mt-3 text-xs leading-5 text-slate-500">{scenario.reason || scenario.note || 'Conservador: ' + show(scenario.low) + ' · Expansivo: ' + show(scenario.high)}</p>
    {scenario.note && scenario.low !== null && scenario.high !== null && <p className="mt-2 text-xs leading-5 text-slate-500">Faixa dos cenários históricos: {show(scenario.low)} a {show(scenario.high)}. Não é intervalo de confiança.</p>}
    {window && Boolean(window.beforeStart || window.afterCut) && <p className="mt-2 text-xs leading-5 text-slate-500">Base do ritmo: {show(window.atCut)} no recorte. Os {window.beforeStart} anteriores ao início entram no estoque já realizado, sem serem extrapolados. {window.afterCut} após o corte ficam fora do cenário.</p>}
  </article>
}

export function ForecastPanel({ data, goalData = data, currentPeriod, asOf, onSelectCourse }: { data: CampaignData[]; goalData?: CampaignData[]; currentPeriod: string; asOf: string; onSelectCourse?: (course: string, additive: boolean) => void }) {
  const [calendar, setCalendar] = useState(loadCalendar)
  const [references, setReferences] = useState<FilterSelection>(null)
  const history = useMemo(() => data.filter((item) => item.period < currentPeriod && item.period.endsWith(currentPeriod.slice(-2))).map((item) => item.period), [data, currentPeriod])
  const referencePeriods = references ?? history
  const config = useMemo(() => ({ currentPeriod, ...calendar, asOf, references: referencePeriods }), [currentPeriod, calendar, asOf, referencePeriods])
  const model = useMemo(() => buildCampaignForecast(data, config), [data, config])
  useEffect(() => {
    try { localStorage.setItem(calendarKey, JSON.stringify(calendar)) } catch { /* Storage is optional. */ }
  }, [calendar])
  const projections = [
    { title: 'Inscritos', scenario: model.inscritos.scenario, window: model.inscritos.window },
    { title: 'Calouros', scenario: model.calouros.scenario, window: model.calouros.window },
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
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">Data das matrículas<select aria-label="Data das matrículas" className={fieldClass} value={calendar.matriculaDate} onChange={(event) => setCalendar((current) => ({ ...current, matriculaDate: event.target.value as 'payment' | 'enrollment' }))}><option value="payment">Baixa do pagamento</option><option value="enrollment">Data de matrícula</option></select></label>
      </div>
      <p className="text-xs leading-5 text-slate-500">Início informado: 29/09/2026. A data-alvo inicial de 31/03/2027 representa o encerramento previsto em março e pode ser ajustada. O calendário é salvo neste navegador.</p>
    </section>
    {model.unknownTypes > 0 && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{model.unknownTypes} CPF sem classificação única entre calouro e veterano. A soma projetada fica pendente até a conferência desses vínculos.</p>}
    <section aria-label="Projeções por indicador" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{projections.map((item) => <ProjectionCard key={item.title} {...item} />)}</section>
    {model.medicine.inScope && <section aria-label="Medicina na projeção" className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"><strong>Medicina: {model.medicine.observed} já confirmadas.</strong> Capacidade de novas vagas: {model.medicine.capacity ?? 'não informada'}. {model.medicine.complete ? 'O cenário respeita a capacidade confirmada.' : 'Não multiplicamos o ritmo desse curso. Por enquanto, calouros e total são cenários parciais, sem presumir novas vagas de Medicina.'}</section>}
    <section aria-label="Base histórica utilizada" className="space-y-3 border-y border-slate-200 py-4"><h3 className="text-lg font-semibold text-slate-950">Conferência da base histórica</h3><p className="text-xs text-slate-500">CPF único no PS inteiro, antes do recorte de datas. Calouros e veteranos usam contrato ativo. Medicina já está dentro de calouros, não é somada novamente.</p><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="p-2">PS</th><th className="p-2 text-right">Inscritos</th><th className="p-2 text-right">Calouros</th><th className="p-2 text-right">Dos quais Medicina</th><th className="p-2 text-right">Veteranos</th><th className="p-2 text-right">Base ativa total</th></tr></thead><tbody className="divide-y divide-slate-100">{model.historicalTotals.map((row) => <tr key={row.period}><th className="p-2 font-medium">{row.period}</th><td className="p-2 text-right">{show(row.inscritos)}</td><td className="p-2 text-right">{show(row.calouros)}</td><td className="p-2 text-right">{show(row.medicina)}</td><td className="p-2 text-right">{show(row.veteranos)}</td><td className="p-2 text-right font-semibold">{show(row.calouros + row.veteranos)}</td></tr>)}</tbody></table></div></section>
    <CampaignComparison data={data} config={config} periods={history} audit={{ inscritos: model.inscritos.audit, calouros: model.calouros.audit }} />
    <CampaignPlanningPanel data={data} goalData={goalData} config={config} />
    <details className="border-y border-slate-200 py-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Comparações e auditoria dos cenários</summary><div className="mt-5 space-y-6">
    <PaceForecastPanel data={data} config={config} seasonal={{ inscritos: model.inscritos.scenario.method === 'linear' ? null : model.inscritos.scenario.reference, calouros: model.calouros.scenario.method === 'linear' || model.calouros.scenario.reference === null ? null : model.calouros.scenario.reference - model.medicine.reference }} onSelectCourse={onSelectCourse} />
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-950">Realizado e projeção do cenário</h3>
      <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 45, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="label" interval={0} width={75} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => formatNumberBR(Number(value))} /><Legend />
        <Bar dataKey="realizado" name="Realizado na carga" fill="#0284c7" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}><LabelList dataKey="realizado" position="right" fill="#0f172a" fontSize={11} fontWeight={700} formatter={show} /></Bar>
        <Bar dataKey="referencia" name="Projeção do cenário" fill="#059669" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}><LabelList dataKey="referencia" position="right" fill="#0f172a" fontSize={11} fontWeight={700} formatter={show} /></Bar>
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
      <p>Inscritos: estoque já inscrito até o corte mais o saldo histórico de novas inscrições após o mesmo dia/mês. Calouros dos demais cursos: demanda prevista de inscritos multiplicada pela conversão histórica de CPF inscrito para matrícula ativa, preservando os calouros atuais fora dessa coorte. O fator de avanço inicial das matrículas não é mais multiplicado pelo semestre inteiro.</p>
      <p>Veteranos usam duas ou mais transições históricas de segundo para primeiro semestre: elegíveis anteriores multiplicados pela taxa histórica de renovação como veterano, mais os demais veteranos observados nessas transições. Esses demais vínculos incluem retornos e vínculos fora da base elegível. A estimativa nunca fica abaixo do realizado de cada componente.</p>
      <p>Medicina não segue extrapolação do ritmo de calouros. Sem capacidade confirmada, incluímos apenas o já realizado e identificamos o cenário como parcial. Veteranos são um cenário condicional de retenção da base elegível, não uma multiplicação das renovações iniciais. Cancelamentos futuros não são estimados.</p>
      <p>Registros atuais sem datas ou classificação válidas deixam a projeção pendente. Alterações de preço, bolsas, investimento e critérios de coleta não são modeladas. Sem retratos históricos da mesma data de carga, a leitura é indicativa e pode refletir somente os vínculos preservados na base histórica.</p>
      <p>CPFs do mesmo PS anteriores ao início escolhido permanecem no estoque confirmado. Somente o ritmo da janela é extrapolado no cenário linear alternativo. Registros posteriores ao corte nunca alimentam o realizado nem o piso projetado. Sem dados suficientes, o cenário linear é explicitamente identificado; os índices de avanço histórico ficam apenas como comparação descritiva.</p>
      {[['Inscritos', model.inscritos.backtest], ['Calouros', model.calouros.backtest]].map(([label, value]) => {
        const test = value as typeof model.inscritos.backtest
        return <p key={String(label)}>{String(label)}: {test ? `teste retrospectivo em ${test.period}, usando apenas referências anteriores. Estimado ${show(test.predicted)}, observado ${show(test.actual)}; erro absoluto percentual de ${new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(test.predicted - test.actual) / test.actual)}. Um exercício não valida a precisão futura.` : 'ainda sem três referências utilizáveis para executar o teste retrospectivo.'}</p>
      })}
      <p>Referência metodológica: <a href="https://otexts.com/fpp3/" target="_blank" rel="noreferrer" className="text-sky-700 underline">Forecasting: Principles and Practice</a>. O método de cenários desta página é uma aproximação operacional, não um modelo oficial do Inep.</p>
    </div></details>
    </div></details>
  </div>
}
