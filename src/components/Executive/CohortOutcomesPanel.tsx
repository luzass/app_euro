import { useMemo, useState } from 'react'
import { cohortOutcomes } from '../../lib/executiveAnalytics'
import { previousPeriod, type CampaignData } from '../../lib/campaignForecast'
import { formatNumberBR } from '../../lib/formatters'

const percent = (count: number, total: number) => total ? new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(count / total) : '—'
const control = 'mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900'

export function CohortOutcomesPanel({ data, institutionData, currentPeriod }: { data: CampaignData[]; institutionData: CampaignData[]; currentPeriod: string }) {
  const periods = useMemo(() => [...new Set(data.map((source) => source.period))].filter((period) => period <= currentPeriod).sort(), [data, currentPeriod])
  const [entryChoice, setEntry] = useState('')
  const [targetChoice, setTarget] = useState('')
  const entry = periods.includes(entryChoice) ? entryChoice : periods[0] ?? currentPeriod
  const targets = periods.filter((period) => period >= entry)
  const target = targets.includes(targetChoice) ? targetChoice : targets.includes(previousPeriod(currentPeriod)) ? previousPeriod(currentPeriod) : targets.at(-1) ?? entry
  const model = useMemo(() => cohortOutcomes(data, institutionData, entry, target, currentPeriod), [data, institutionData, entry, target, currentPeriod])
  const outcomes = [
    { key: 'active', label: 'Continuam ativos no recorte', count: model.activeInScope, color: '#059669', text: 'text-emerald-700' },
    ...(model.activeElsewhere ? [{ key: 'elsewhere', label: 'Ativos em outro recorte da IES', count: model.activeElsewhere, color: '#0284c7', text: 'text-sky-700' }] : []),
    { key: 'graduates', label: 'Prováveis concluintes', count: model.likelyGraduates, color: '#7c3aed', text: 'text-violet-700' },
    { key: 'missing', label: 'Sem vínculo ativo localizado', count: model.notLocated, color: '#d97706', text: 'text-amber-800' },
    ...(model.pending ? [{ key: 'pending', label: 'Aguardando base para classificar', count: model.pending, color: '#64748b', text: 'text-slate-600' }] : []),
  ]
  return <section aria-label="Destino da turma de entrada" className="space-y-4 border-t border-slate-200 pt-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h3 className="text-base font-semibold text-slate-950">O que aconteceu com essa turma?</h3><p className="mt-1 text-sm text-slate-500">Entrada em {entry} · acompanhamento em {target}</p></div>
      <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Turma de entrada<select aria-label="Turma de entrada" className={control} value={entry} onChange={(event) => setEntry(event.target.value)}>{periods.map((period) => <option key={period}>{period}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Período de acompanhamento<select aria-label="Período de acompanhamento" className={control} value={target} onChange={(event) => setTarget(event.target.value)}>{targets.map((period) => <option key={period} value={period}>{period}{period === currentPeriod ? ' · parcial' : ''}</option>)}</select></label>
      </div>
    </div>
    {model.partial && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">{target} ainda está parcial. Quem não aparece pode renovar ou retornar em uma próxima carga; esta ausência não confirma saída da IES.</p>}
    {model.reason && <p role="status" className="text-sm text-amber-800">{model.reason} Não classificamos ausências sem essa conferência.</p>}
    {model.total ? <>
      <p className="text-sm text-slate-600">Turma inicial: <strong className="text-slate-950">{formatNumberBR(model.total)} alunos</strong> <span className="text-slate-500">· 100% · CPF único</span></p>
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-slate-100" aria-hidden="true">{outcomes.filter((outcome) => outcome.count > 0).map((outcome) => <span key={outcome.key} style={{ width: `${outcome.count / model.total * 100}%`, backgroundColor: outcome.color }} />)}</div>
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">{outcomes.map((outcome) => <div key={outcome.key} className="min-w-0 border-l-2 pl-3" style={{ borderColor: outcome.color }}><dt className="text-sm text-slate-600">{outcome.label}</dt><dd className={'mt-1 text-2xl font-semibold ' + outcome.text}>{formatNumberBR(outcome.count)} <span className="text-sm font-normal text-slate-500">· {percent(outcome.count, model.total)}</span></dd></div>)}</dl>
      {model.unknownGraduation > 0 && <p className="text-xs text-slate-500">Sem dados de curso ou período para avaliar provável conclusão: {formatNumberBR(model.unknownGraduation)} {model.unknownGraduation === 1 ? 'aluno não localizado' : 'alunos não localizados'}.</p>}
    </> : <p className="py-4 text-sm text-slate-500">Nenhum calouro localizado nessa turma de entrada com os filtros atuais.</p>}
    <p className="text-xs leading-5 text-slate-500">A soma recompõe os 100% da turma. Provável conclusão usa o último vínculo ativo anterior: 10º período nos demais cursos ou 12º em Medicina, sem vínculo ativo no acompanhamento. Não é confirmação de formatura. A busca por permanência considera toda a IES, mesmo fora dos filtros; ausência não confirma evasão. Bases ou contratos ausentes deixam a classificação pendente.</p>
  </section>
}
