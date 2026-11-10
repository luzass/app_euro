import { useMemo } from 'react'
import { Target } from 'lucide-react'
import { buildEnrollmentGoals } from '../../lib/enrollmentGoals'
import type { ProfileSource } from '../../lib/studentProfile'
import { formatNumberBR } from '../../lib/formatters'

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

export function EnrollmentGoalsPanel({ sources, origin, dates }: { sources: ProfileSource[]; origin: string; dates?: { asOf: string; end: string } }) {
  const model = useMemo(() => buildEnrollmentGoals(sources, origin, dates), [sources, origin, dates])
  return <section aria-label="Alvos institucionais de matrícula" className="space-y-4 border-y border-slate-200 py-5">
    <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950"><Target size={20} />Alvos de matrícula · {model.destination}</h3><span className="text-xs text-slate-500">Recomposição institucional · inclui Medicina</span></header>
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Alvo mínimo de base ativa', model.hasOrigin ? model.base : null], ['Base ativa no destino', model.current], ['Faltam para recompor a base', model.remaining], ['Prováveis concluintes na origem', model.graduating]].map(([label, value]) => <div key={String(label)}><p className="text-sm text-slate-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value === null ? '-' : formatNumberBR(Number(value))}</p></div>)}
    </div>
    {model.hasOrigin && <p className="text-sm leading-6 text-slate-600">O piso é manter os {formatNumberBR(model.base)} CPFs ativos de {origin}, incluindo calouros e veteranos. Até agora: {formatNumberBR(model.retained)} CPFs continuam ativos e {formatNumberBR(model.arrivals)} são entradas em relação à origem.</p>}
    {model.hasOrigin && <div className="grid gap-3 border-l-4 border-sky-600 bg-sky-50 p-4 text-sm leading-6 text-slate-700 sm:grid-cols-2"><p><strong>Reposição estrutural:</strong> se todos os {formatNumberBR(model.eligible)} elegíveis renovarem e os {formatNumberBR(model.graduating)} prováveis concluintes saírem, precisamos de {formatNumberBR(model.graduating)} entradas para manter a base. Já observamos {formatNumberBR(model.arrivals)}.</p><p><strong>Alavanca de retenção:</strong> cada 1 ponto percentual adicional de renovação representa aproximadamente {decimal.format(model.oneRenewalPoint)} alunos. {model.missingRenewal === null ? 'A renovação ainda depende da base de destino.' : `${formatNumberBR(model.missingRenewal)} elegíveis ainda estão sem renovação ativa localizada; isso não confirma evasão.`}</p></div>}
    {model.hasInitialGoals && <>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-semibold text-slate-950">Primeira meta de calouros: {formatNumberBR(model.goals.regular + model.goals.prouni)}</h4><span className="text-xs text-slate-500">{model.goals.includeMedicine ? 'Todos os cursos, inclusive Medicina' : 'Sem Medicina'}{model.daysLeft !== null ? ` · ${model.daysLeft} dias até a data-alvo` : ''}</span></div>
      <div className="grid gap-5 md:grid-cols-2">{model.rows.map((row) => <article key={row.key} className="min-w-0 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-3"><h5 className="text-sm font-medium text-slate-700">{row.key === 'regular' ? 'Demais formas de ingresso' : 'PROUNI'}</h5><span className="text-sm font-semibold text-slate-950">{formatNumberBR(row.observed)} / {formatNumberBR(row.target)}</span></div>
        <progress aria-label={row.key === 'regular' ? 'Meta de calouros não PROUNI' : 'Meta de calouros PROUNI'} max={row.target} value={Math.min(row.target, row.observed)} className={'mt-3 h-2 w-full ' + (row.key === 'regular' ? 'accent-sky-600' : 'accent-emerald-600')} />
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-600"><span>{percent.format(row.progress)} atingidos</span><span>Faltam <strong>{formatNumberBR(row.gap)}</strong></span></div>
        {dates && <p className="mt-2 text-xs leading-5 text-slate-500">Ritmo necessário: <strong>{row.dailyRequired === null ? model.daysLeft === null ? 'confira a data-alvo' : 'prazo encerrado com saldo pendente' : decimal.format(row.dailyRequired) + '/dia'}</strong> · ritmo datado nos últimos 14 dias: {row.dailyRecent === null ? '-' : decimal.format(row.dailyRecent) + '/dia'}{row.missingDates > 0 ? ` · ${row.missingDates} CPFs sem data válida` : ''}.</p>}
      </article>)}</div>
      <p className="text-xs text-slate-500">As metas de 307 e 204 são de novos calouros. Elas compõem a base total, não são somadas novamente ao piso de recomposição. O progresso usa contrato ativo e CPF único na carga atual, sem aplicar os recortes de curso dos outros gráficos.</p>
    </>}
    {Boolean(model.unclassifiedAdmission || model.unclassifiedStudent) && <p role="status" className="text-xs text-amber-800">Conferir classificação: {model.unclassifiedAdmission} CPFs de calouros com ingresso ausente ou conflitante; {model.unclassifiedStudent} CPFs sem tipo de aluno único. Eles não são distribuídos automaticamente nas metas.</p>}
    {!model.hasOrigin && <p role="status" className="text-sm text-amber-800">Sem base ativa de origem utilizável para definir o piso de recomposição.</p>}
  </section>
}
