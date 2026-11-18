import { useMemo, useState } from 'react'
import { semesterTransitions, type TransitionPopulation } from '../../lib/executiveAnalytics'
import type { CampaignData } from '../../lib/campaignForecast'
import { formatNumberBR } from '../../lib/formatters'

const groups: Array<{ value: TransitionPopulation; label: string }> = [
  { value: 'all', label: 'Geral' },
  { value: 'calouro', label: 'Calouros' },
  { value: 'veterano', label: 'Veteranos' },
]
const percent = (rate: number | null) =>
  rate === null
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(rate)

export function SemesterTransitionsPanel({
  data,
  institutionData,
  currentPeriod,
}: {
  data: CampaignData[]
  institutionData: CampaignData[]
  currentPeriod: string
}) {
  const [population, setPopulation] = useState<TransitionPopulation>('all')
  const [originChoice, setOriginChoice] = useState('')
  const comparisons = useMemo(
    () => semesterTransitions(data, institutionData, currentPeriod, population),
    [data, institutionData, currentPeriod, population],
  )
  const defaultOrigin =
    comparisons.filter((row) => !row.partial).at(-1)?.origin ?? comparisons[0]?.origin ?? ''
  const origin = comparisons.some((row) => row.origin === originChoice)
    ? originChoice
    : defaultOrigin
  const model = comparisons.find((row) => row.origin === origin)
  const detailMetrics = model
    ? [
        {
          label: 'Base ativa na origem',
          count: model.sourceAvailable ? model.total : null,
          rate: model.sourceAvailable && model.total ? 1 : null,
          color: 'border-slate-400',
          text: 'text-slate-950',
        },
        {
          label: 'Continuam ativos na IES',
          count: model.sourceAvailable && model.destinationAvailable ? model.retained : null,
          rate:
            model.sourceAvailable && model.destinationAvailable && model.total
              ? model.retained / model.total
              : null,
          color: 'border-emerald-600',
          text: 'text-emerald-700',
        },
        {
          label: 'Sem vínculo ativo no PS seguinte',
          count: model.comparable ? model.notActive : null,
          rate: model.absenceRate,
          color: 'border-amber-600',
          text: 'text-amber-800',
        },
        {
          label: 'Desses, prováveis concluintes',
          count: model.comparable ? model.likelyGraduates : null,
          rate: model.comparable ? model.likelyGraduates / model.total : null,
          color: 'border-violet-500',
          text: 'text-violet-700',
        },
        {
          label: 'Demais ausências',
          count: model.comparable ? model.notLocated : null,
          rate: model.otherAbsenceRate,
          color: 'border-rose-500',
          text: 'text-rose-700',
        },
      ]
    : []
  return (
    <section
      aria-label="Comparação entre processos consecutivos"
      className="space-y-4 border-t border-slate-200 pt-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-950">
            De um processo seletivo para o próximo
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Pessoas da base de origem acompanhadas no semestre imediatamente seguinte.
          </p>
        </div>
        <label className="w-full text-xs font-medium text-slate-600 sm:w-auto">
          Comparação selecionada
          <select
            aria-label="Comparação selecionada"
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={origin}
            onChange={(event) => setOriginChoice(event.target.value)}
          >
            {comparisons.map((row) => (
              <option key={row.origin} value={row.origin}>
                {row.origin} → {row.destination}
                {row.partial ? ' · parcial' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        role="group"
        aria-label="População da comparação"
        className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1"
      >
        {groups.map((group) => (
          <button
            key={group.value}
            type="button"
            aria-pressed={population === group.value}
            onClick={() => setPopulation(group.value)}
            className={
              'rounded-md px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ' +
              (population === group.value
                ? 'bg-slate-950 text-white'
                : 'text-slate-600 hover:bg-slate-100')
            }
          >
            {group.label}
          </button>
        ))}
      </div>
      {model && (
        <>
          <p className="text-sm text-slate-600">
            {model.origin} → {model.destination} ·{' '}
            <strong className="text-slate-950">
              {groups.find((group) => group.value === population)?.label}
            </strong>
          </p>
          {model.partial && (
            <p
              role="status"
              className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {model.destination} está parcial. Estas são ausências observadas até a carga atual,
              não saídas confirmadas. Novas renovações podem reduzir o percentual.
            </p>
          )}
          {model.reason && (
            <p role="status" className="text-sm text-amber-800">
              {model.reason} O percentual fica pendente.
            </p>
          )}
          {model.pending > 0 && (
            <p role="status" className="text-sm text-amber-800">
              {formatNumberBR(model.pending)}{' '}
              {model.pending === 1 ? 'pessoa aguarda' : 'pessoas aguardam'} dados suficientes para
              classificação. Não calculamos o percentual de ausências com essa pendência.
            </p>
          )}
          <dl
            aria-label="Indicadores da comparação selecionada"
            className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-5"
          >
            {detailMetrics.map((metric) => (
              <div key={metric.label} className={'min-w-0 border-l-2 pl-3 ' + metric.color}>
                <dt className="text-sm text-slate-600">{metric.label}</dt>
                <dd className={'mt-1 text-2xl font-semibold ' + metric.text}>
                  {metric.count === null ? '—' : formatNumberBR(metric.count)}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    · {percent(metric.rate)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          {model.activeElsewhere > 0 && (
            <p className="text-xs text-slate-500">
              {formatNumberBR(model.activeElsewhere)}{' '}
              {model.activeElsewhere === 1 ? 'pessoa segue ativa' : 'pessoas seguem ativas'} em
              outro curso, campus ou recorte da IES e{' '}
              {model.activeElsewhere === 1 ? 'não conta' : 'não contam'} como saída.
            </p>
          )}
          {model.unclassifiedType > 0 && (
            <p className="text-xs text-slate-500">
              {formatNumberBR(model.unclassifiedType)}{' '}
              {model.unclassifiedType === 1 ? 'pessoa da origem tem' : 'pessoas da origem têm'} tipo
              de aluno ausente ou conflitante: {model.unclassifiedType === 1 ? 'entra' : 'entram'}{' '}
              apenas em Geral, não em Calouros ou Veteranos.
            </p>
          )}
          {model.unknownGraduation > 0 && (
            <p className="text-xs text-slate-500">
              {formatNumberBR(model.unknownGraduation)}{' '}
              {model.unknownGraduation === 1 ? 'ausência' : 'ausências'} sem curso ou período
              suficientes para avaliar provável conclusão.
            </p>
          )}
        </>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[940px] text-left text-sm">
          <caption className="sr-only">
            Histórico de transições · {groups.find((group) => group.value === population)?.label}
          </caption>
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="p-3">Processos</th>
              <th className="p-3 text-right">Base de origem</th>
              <th className="p-3 text-right">Ativos na IES</th>
              <th className="p-3 text-right">Sem vínculo · % da base</th>
              <th className="p-3 text-right">Prováveis concluintes</th>
              <th className="p-3 text-right">Demais ausências · % da base</th>
              <th className="p-3 text-right">Pendentes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparisons.map((row) => (
              <tr key={row.origin} className={row.origin === origin ? 'bg-sky-50' : undefined}>
                <th scope="row" className="p-3 font-medium">
                  <button
                    type="button"
                    className="text-left text-sky-800 underline underline-offset-2"
                    onClick={() => setOriginChoice(row.origin)}
                  >
                    {row.origin} → {row.destination}
                  </button>
                  {row.partial && <span className="ml-2 text-xs text-amber-800">Parcial</span>}
                </th>
                <td className="p-3 text-right">
                  {row.sourceAvailable ? formatNumberBR(row.total) : '—'}
                </td>
                <td className="p-3 text-right">
                  {row.sourceAvailable && row.destinationAvailable
                    ? formatNumberBR(row.retained)
                    : '—'}
                </td>
                <td className="p-3 text-right font-medium text-amber-800">
                  {row.comparable
                    ? `${formatNumberBR(row.notActive)} · ${percent(row.absenceRate)}`
                    : '—'}
                </td>
                <td className="p-3 text-right">
                  {row.comparable ? formatNumberBR(row.likelyGraduates) : '—'}
                </td>
                <td className="p-3 text-right">
                  {row.comparable
                    ? `${formatNumberBR(row.notLocated)} · ${percent(row.otherAbsenceRate)}`
                    : '—'}
                </td>
                <td className="p-3 text-right">{formatNumberBR(row.pending)}</td>
              </tr>
            ))}
            {!comparisons.length && (
              <tr>
                <td className="p-6 text-center text-slate-500" colSpan={7}>
                  Sem processos consecutivos disponíveis para comparar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Percentuais sobre os CPFs únicos com contrato ativo no PS de origem, respeitando os filtros
        de curso, campus, turno e ingresso. Calouro/veterano é o tipo na origem. Sem vínculo inclui
        prováveis conclusões e demais ausências; não é evasão confirmada. A permanência é procurada
        em toda a IES. Provável conclusão usa o último vínculo ativo: 10º período nos demais cursos
        ou 12º em Medicina, sem confirmação de formatura.
      </p>
    </section>
  )
}
