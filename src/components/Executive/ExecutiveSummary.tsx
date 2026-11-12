import { useMemo } from 'react'
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { KpiCard } from '../UI/KpiCard'
import { executiveOverview, countUniqueRows } from '../../lib/executiveAnalytics'
import type { CampaignData } from '../../lib/campaignForecast'
import { formatNumberBR } from '../../lib/formatters'
import { titleize } from '../../lib/dashboardHelpers'
import { CohortOutcomesPanel } from './CohortOutcomesPanel'

const percent = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(value)

export function ExecutiveSummary({ data, institutionData = data, currentPeriod }: { data: CampaignData[]; institutionData?: CampaignData[]; currentPeriod: string }) {
  const analysis = useMemo(() => executiveOverview(data, currentPeriod), [data, currentPeriod])
  const failures = data.filter((item) => item.matriculadosError)
  const current = data.find((item) => item.period === currentPeriod)
  const comparable = !failures.length && analysis.hasPrior && analysis.hasCurrent
  const delta = comparable ? analysis.delta : null
  return <div className="space-y-6">
    <p className="border-l-4 border-sky-500 bg-sky-50 p-3 text-sm text-sky-900">O PS {currentPeriod} está em acompanhamento. Variação da base e renovação refletem os registros carregados e ainda podem mudar durante a campanha.</p>
    {failures.length > 0 && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Matrículas indisponíveis em {failures.map((item) => item.period).join(', ')}. Comparações ficam pendentes para evitar conclusões sobre bases incompletas.</p>}
    {(analysis.invalidPeriodRows > 0 || analysis.invalidCpfRows > 0) && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Conferência da carga: {formatNumberBR(analysis.invalidPeriodRows)} linhas sem período letivo válido e {formatNumberBR(analysis.invalidCpfRows)} sem CPF válido não entram no histórico de vínculos.</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores executivos">
      <KpiCard title="Alunos ativos no período atual" value={failures.length ? '—' : formatNumberBR(analysis.current)} helperText={currentPeriod + ' · CPF único'} emphasis="primary" />
      <KpiCard title="Variação da base ativa" value={delta === null ? '—' : (delta > 0 ? '+' : '') + formatNumberBR(delta)} helperText={delta === null ? 'Aguardando bases comparáveis' : percent(analysis.previous ? delta / analysis.previous : null) + ' em relação a ' + analysis.previousPeriod} />
      <KpiCard title="Renovação dos elegíveis" value={comparable ? percent(analysis.comparison.rate) : '—'} helperText={analysis.previousPeriod + ' → ' + currentPeriod} />
      <KpiCard title="Entradas no período atual" value={comparable ? formatNumberBR(analysis.entering) : '—'} helperText="Ativos agora, ausentes na base ativa anterior" />
      <KpiCard title="Retornos localizados" value={comparable ? formatNumberBR(analysis.returning) : '—'} helperText="Entradas com vínculo ativo em um período mais antigo" />
      <KpiCard title="Inscritos do PS atual" value={current?.inscritosError ? '—' : formatNumberBR(countUniqueRows(current?.inscritos ?? []))} helperText={current?.inscritosError ? 'Base de inscritos indisponível' : currentPeriod + ' · CPF único'} />
    </section>
    <section className="grid gap-5 xl:grid-cols-2">
      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">Evolução da base ativa</h2>
        <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={analysis.evolution.map((row) => ({ ...row, active: failures.length ? null : row.active }))} margin={{ left: 0, right: 25, top: 25, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="period" interval={0} tick={{ fontSize: 10 }} tickLine={false} /><YAxis allowDecimals={false} width={45} tick={{ fontSize: 11 }} tickLine={false} /><Tooltip formatter={(value) => [formatNumberBR(Number(value)), 'Alunos ativos']} />
          <Line type="linear" dataKey="active" name="Alunos ativos" stroke="#0284c7" strokeWidth={2} connectNulls={false} isAnimationActive={false}><LabelList dataKey="active" position="top" fill="#0f172a" fontSize={11} fontWeight={700} formatter={(value: number | null) => value === null ? '' : formatNumberBR(value)} /></Line>
        </LineChart></ResponsiveContainer></div>
      </article>
      <section className="min-w-0 py-2">
        <h2 className="text-base font-semibold text-slate-950">O que mudou na base</h2>
        <dl className="mt-4 divide-y divide-slate-200 text-sm">
          {[
            ['Base ativa em ' + analysis.previousPeriod, analysis.previous],
            ['Permaneceram ativos no recorte', analysis.common],
            ['Entradas sem vínculo anterior no histórico observado', analysis.firstObserved],
            ['Retornos após ausência no período anterior', analysis.returning],
            ['Ausências com provável conclusão', analysis.likelyGraduateAbsences],
            ['Demais ausências da base ativa', analysis.otherAbsences],
            ['Base ativa em ' + currentPeriod, analysis.current],
          ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-2.5"><dt className="text-slate-600">{label}</dt><dd className="shrink-0 font-semibold text-slate-950">{comparable ? formatNumberBR(Number(value)) : '—'}</dd></div>)}
        </dl>
      </section>
    </section>
    <section className="space-y-3 border-t border-slate-200 pt-5">
      <h2 className="text-lg font-semibold text-slate-950">Prioridades de acompanhamento por curso</h2>
      <p className="text-xs text-slate-500">Comparação {analysis.previousPeriod} → {currentPeriod}. Prováveis concluintes ficam fora dos elegíveis; ausência não confirma evasão.</p>
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">Curso de origem</th><th className="p-3 text-right">Elegíveis</th><th className="p-3 text-right">Renovaram</th><th className="p-3 text-right">Sem renovação ativa</th><th className="p-3 text-right">Taxa de renovação</th></tr></thead><tbody className="divide-y divide-slate-100">
          {analysis.priorities.filter((row) => row.base > 0).map((row) => <tr key={row.course}><th scope="row" className="p-3 font-medium text-slate-900">{titleize(row.course)}</th><td className="p-3 text-right">{formatNumberBR(row.eligible)}</td><td className="p-3 text-right">{comparable ? formatNumberBR(row.renewed) : '—'}</td><td className="p-3 text-right font-semibold text-orange-700">{comparable ? formatNumberBR(row.missing) : '—'}</td><td className="p-3 text-right">{comparable ? percent(row.rate) : '—'}</td></tr>)}
          {!analysis.priorities.some((row) => row.base > 0) && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Sem base ativa de origem neste recorte.</td></tr>}
        </tbody></table>
      </div>
    </section>
    <section className="space-y-3 border-t border-slate-200 pt-5">
      <h2 className="text-lg font-semibold text-slate-950">Acompanhamento das turmas de entrada</h2>
      <p className="text-xs text-slate-500">Calouros identificados no semestre de entrada e vínculos ativos localizados depois, dentro do recorte. O semestre atual é parcial; a ausência não comprova desistência ou conclusão.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">Entrada</th><th className="p-3 text-right">Calouros</th>{data.map((item) => <th key={item.period} className="p-3 text-center">{item.period}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {analysis.cohorts.map((cohort) => <tr key={cohort.period}><th scope="row" className="p-3 font-medium">{cohort.period}</th><td className="p-3 text-right">{formatNumberBR(cohort.entrants)}</td>{data.map((item) => {
          const cell = cohort.cells.find((value) => value.period === item.period)
          const rate = !failures.length ? cell?.rate ?? null : null
          return <td key={item.period} className="p-3 text-center" title={cell?.count === null || cell?.count === undefined ? 'Sem base disponível' : `${cell.count} de ${cohort.entrants} CPF localizados`} style={rate === null ? undefined : { backgroundColor: `rgba(5,150,105,${0.04 + rate * 0.16})` }}>{percent(rate)}</td>
        })}</tr>)}
      </tbody></table></div>
      <CohortOutcomesPanel data={data} institutionData={institutionData} currentPeriod={currentPeriod} />
    </section>
    <p className="text-xs leading-5 text-slate-500">Entradas sem vínculo anterior significam primeira aparição na janela de dados, não necessariamente primeiro ingresso na instituição. Crescimento e permanência se referem ao recorte selecionado. A regra de conclusão é uma aproximação de 10º período ou 12º em Medicina.</p>
  </div>
}
