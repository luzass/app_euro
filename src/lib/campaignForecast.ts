import { academicPeriod, compareRenewal, indexRenewalRows } from './enrollmentRenewal.ts'
import { medianAge, profileField, normalizedText } from './studentProfile.ts'
import { activePeople, cpfKey, dateDay, matriculasForPeriod, previousPeriod, type CampaignData, type ForecastConfig, type ForecastScenario } from './campaignData.ts'
import { buildCaptureForecast } from './campaignCapture.ts'
export { activePeople, cpfKey, dateDay, isMedicine, matriculaDateFields, matriculasForPeriod, personEvents, previousPeriod, registrationsForPeriod, shiftedDay } from './campaignData.ts'
export type { CampaignData, ForecastConfig, ForecastScenario } from './campaignData.ts'

const blocked = (observed: number, reason: string): ForecastScenario => ({ observed, low: null, reference: null, high: null, reason })
export function buildCampaignForecast(data: CampaignData[], config: ForecastConfig) {
  const capture = buildCaptureForecast(data, config)
  const { inscritos, calouros } = capture
  const start = dateDay(config.start), end = dateDay(config.end), cut = dateDay(config.asOf)
  const calendarReason = start === null || end === null || cut === null || end <= start || cut < start || cut > end ? 'Confira o calendário da campanha.' : ''
  const current = data.find((item) => item.period === config.currentPeriod)
  const currentMatriculas = matriculasForPeriod(data, config.currentPeriod), currentPeople = activePeople(currentMatriculas)
  const currentVets = [...currentPeople.values()].filter((person) => person.type === 'veterano')
  const unknownTypes = [...currentPeople.values()].filter((person) => person.type === null).length
  const invalidMatriculaCpf = currentMatriculas.some((row) => ['ATIVO', 'CONTRATO ATIVO'].includes(normalizedText(profileField(row, 'contrato'))) && !cpfKey(row))
  const missingCurrentPeriod = (current?.matriculados ?? []).some((row) => !academicPeriod(profileField(row, 'periodo_letivo')))
  const previous = previousPeriod(config.currentPeriod), previousPeople = activePeople(matriculasForPeriod(data, previous))
  const renewalIndex = indexRenewalRows(data.map((item) => ({ period: item.period, rows: item.matriculados })))
  const eligibleFor = (period: string) => new Set(compareRenewal(renewalIndex, period).records.filter((record) => record.status !== 'provavel_concluinte').map((record) => record.cpf))
  const eligible = eligibleFor(previous)
  const observedRenewals = currentVets.filter((person) => eligible.has(person.cpf)).length, observedOthers = currentVets.length - observedRenewals
  const references = data.filter((item) => config.references.includes(item.period) && item.period < config.currentPeriod && item.period.endsWith(config.currentPeriod.slice(-2)))
  const vetAudit = references.map((historical) => {
    const origin = previousPeriod(historical.period), originSource = data.find((item) => item.period === origin)
    const prior = activePeople(matriculasForPeriod(data, origin)), target = activePeople(matriculasForPeriod(data, historical.period)), priorEligible = eligibleFor(origin)
    const vets = [...target.values()].filter((person) => person.type === 'veterano')
    const renewals = vets.filter((person) => priorEligible.has(person.cpf)).length, others = vets.length - renewals
    const rate = priorEligible.size ? renewals / priorEligible.size : null
    const reason = !originSource || originSource.matriculadosError || historical.matriculadosError ? 'Base indisponível'
      : !prior.size || !target.size ? 'Sem base para o par de períodos'
        : [...target.values(), ...prior.values()].some((person) => person.type === null) ? 'Tipo de aluno não identificado' : ''
    return { period: historical.period, origin, eligible: priorEligible.size, renewals, others, rate, reason }
  })
  const usable = vetAudit.filter((row) => !row.reason && row.rate !== null)
  const vetValues = usable.map((row) => Math.max(observedRenewals, eligible.size * row.rate!) + Math.max(observedOthers, row.others))
  const vetReason = calendarReason || (current?.matriculadosError || data.find((item) => item.period === previous)?.matriculadosError ? 'Base atual ou anterior indisponível.' : '')
    || (unknownTypes ? 'Há alunos sem classificação única entre calouro e veterano.' : '')
    || (invalidMatriculaCpf || missingCurrentPeriod ? 'Há matrículas atuais sem CPF ou período letivo válido.' : '')
    || (!previousPeople.size ? 'A base ativa do período anterior ainda não está disponível.' : '')
    || (vetValues.length < 2 ? 'São necessárias duas transições históricas comparáveis para veteranos.' : '')
  const vetRate = usable.length ? medianAge(usable.map((row) => row.rate!)) : null
  const otherVets = usable.length ? medianAge(usable.map((row) => row.others)) : null
  const veteranos: ForecastScenario = vetReason ? blocked(currentVets.length, vetReason) : {
    observed: currentVets.length, low: Math.max(currentVets.length, Math.floor(Math.min(...vetValues))), reference: Math.max(currentVets.length, Math.round(medianAge(vetValues)!)), high: Math.max(currentVets.length, Math.ceil(Math.max(...vetValues))), reason: '', method: 'cohort', complete: true,
    note: `${eligible.size} elegíveis da base anterior; retenção histórica mediana de ${Math.round(vetRate! * 1000) / 10}% e ${Math.round(otherVets!)} demais vínculos históricos. É cenário de renovação da base, não extrapolação de ${currentVets.length} matrícula(s) por dia.`,
  }
  const sum = (key: 'low' | 'reference' | 'high') => calouros.scenario[key] === null || veteranos[key] === null ? null : calouros.scenario[key]! + veteranos[key]!
  const total: ForecastScenario = { observed: currentPeople.size, low: sum('low'), reference: sum('reference'), high: sum('high'), method: 'mixed', complete: calouros.scenario.complete !== false && veteranos.reference !== null,
    reason: calouros.scenario.reference === null || veteranos.reference === null ? 'Aguardando cenários utilizáveis de captação e renovação.' : '',
    note: capture.medicine.inScope && !capture.medicine.complete ? 'Cenário parcial: soma demais cursos projetados, Medicina já confirmada e renovação condicional de veteranos. A expansão de Medicina não foi presumida.' : calouros.scenario.complete === false ? 'Cenário parcial: a coorte de inscritos e matrículas precisa de conciliação. Vínculos confirmados são preservados, sem presumir futuras matrículas fora da coorte.' : 'Soma o cenário de captação por demanda/conversão com a renovação condicional da base anterior.',
  }
  return { inscritos, calouros, veteranos, total, vetAudit, unknownTypes, activeCurrent: currentPeople.size, eligiblePrevious: eligible.size, observedRenewals, observedOthers, medicine: capture.medicine, historicalTotals: capture.historicalTotals, capture }
}
