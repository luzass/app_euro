import type { GenericRow } from './dashboardHelpers'
import { activePeople, cpfKey, dateDay, matriculasForPeriod, personEvents, registrationsForPeriod, shiftedDay, type CampaignData, type ForecastConfig } from './campaignForecast.ts'
import { calouroAdmissionSegment, initialEnrollmentGoals } from './enrollmentGoals.ts'
import { academicPeriod } from './enrollmentRenewal.ts'
import { medianAge, normalizedText, profileField } from './studentProfile.ts'

export type PaceKind = 'inscritos' | 'calouros' | 'regular' | 'prouni'
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

function sample(data: CampaignData[], period: string, config: ForecastConfig, kind: PaceKind) {
  const delta = Number(period.slice(0, 4)) - Number(config.currentPeriod.slice(0, 4))
  const calendar = [config.start, config.end, config.asOf].map(dateDay)
  if (calendar.some((day) => day === null)) return null
  const [start, end, cutoff] = calendar.map((day) => shiftedDay(day!, delta))
  if (end <= start || cutoff < start || cutoff > end || end - start > 730) return null
  const source = data.find((item) => item.period === period)
  const raw = matriculasForPeriod(data, period)
  const inScope = (row: GenericRow) => kind === 'inscritos' || kind === 'calouros' || initialEnrollmentGoals.includeMedicine || normalizedText(profileField(row, 'curso')) !== 'MEDICINA'
  const people = [...activePeople(raw).values()]
  let rows: GenericRow[]
  let ambiguous = false
  if (kind === 'inscritos') rows = registrationsForPeriod(data, period)
  else {
    const calouros = people.filter((person) => person.type === 'calouro')
    const rowsForAdmission = (rows: GenericRow[]) => rows.filter((row) => initialEnrollmentGoals.includeMedicine || normalizedText(profileField(row, 'curso')) !== 'MEDICINA')
    ambiguous = people.some((person) => person.type === null && (kind === 'calouros' || rowsForAdmission(person.rows).length > 0))
    if (kind === 'calouros') rows = calouros.flatMap((person) => person.rows)
    else {
      const segmentedRows = calouros.map((person) => rowsForAdmission(person.rows)).filter((entries) => entries.length > 0)
      ambiguous ||= segmentedRows.some((entries) => calouroAdmissionSegment(entries) === null)
      rows = segmentedRows.filter((entries) => calouroAdmissionSegment(entries) === kind).flat()
    }
  }
  const events = personEvents(rows, kind === 'inscritos' ? ['data_inscricao'] : ['data_de_matricula', 'data_baixa_do_pagamento'])
  const dates = [...events.people.values()].filter((day): day is number => day !== null && day >= start && day <= end).sort((a, b) => a - b)
  const atCut = dates.filter((day) => day <= cutoff).length
  const recentStart = Math.max(start, cutoff - 13), previousStart = Math.max(start, cutoff - 27)
  const observedDays = cutoff - recentStart + 1
  const previousDays = Math.max(0, recentStart - previousStart)
  const recent = dates.filter((day) => day >= recentStart && day <= cutoff).length
  const previous = dates.filter((day) => day >= previousStart && day < recentStart).length
  const remaining = end - cutoff
  const activeInvalid = kind !== 'inscritos' && raw.some((row) => inScope(row) && ['ATIVO', 'CONTRATO ATIVO'].includes(normalizedText(profileField(row, 'contrato'))) && !cpfKey(row))
  const missingPeriod = kind !== 'inscritos' && (source?.matriculados ?? []).some((row) => inScope(row) && !academicPeriod(profileField(row, 'periodo_letivo')))
  const missingContract = kind !== 'inscritos' && raw.some((row) => inScope(row) && !profileField(row, 'contrato'))
  const reason = !source || (kind === 'inscritos' ? source.inscritosError : source.matriculadosError) ? 'Base indisponível'
    : ambiguous ? 'Classificação de aluno ou ingresso conflitante'
      : activeInvalid || missingPeriod || missingContract || events.invalidCpf ? 'CPF, contrato ou período letivo inválido'
        : events.missingDates ? 'Há CPFs sem data válida' : ''
  return { period, start, end, cutoff, atCut, total: dates.length, base: events.people.size,
    recent, previous, observedDays, remaining, dailyRecent: recent / observedDays,
    dailyPrevious: previousDays ? previous / previousDays : null, fullWindows: cutoff - start >= 27,
    dailyRemaining: remaining ? (dates.length - atCut) / remaining : 0,
    lastEvent: dates.filter((day) => day <= cutoff).at(-1) ?? null, reason }
}

export function buildForecastBenchmarks(data: CampaignData[], config: ForecastConfig, kind: PaceKind) {
  const current = sample(data, config.currentPeriod, config, kind)
  const history = [...new Set(config.references)].filter((period) => period < config.currentPeriod && period.endsWith(config.currentPeriod.slice(-2)))
    .sort().map((period) => sample(data, period, config, kind)).filter((item): item is NonNullable<typeof item> => item !== null)
  const usable = history.filter((item) => !item.reason && item.total > 0)
  const currentReason = !current ? 'Confira o calendário' : current.reason || (current.base !== current.atCut ? 'Há registros atuais fora da janela ou após o corte' : '')
  const recentReason = currentReason || (current && current.observedDays < 7 ? 'São necessários ao menos sete dias de campanha' : '')
  const historicalReason = currentReason || (usable.length < 2 ? 'São necessárias duas referências históricas utilizáveis' : '')
  const recentProjection = !recentReason && current ? Math.round(current.atCut + current.dailyRecent * current.remaining) : null
  const historicalRate = usable.length >= 2 ? mean(usable.map((item) => item.dailyRemaining)) : null
  const historicalProjection = !historicalReason && current && historicalRate !== null ? Math.round(current.atCut + historicalRate * current.remaining) : null
  const exercises: Array<{ period: string; actual: number; seasonal: number; recent: number; historical: number }> = []
  for (const target of usable) {
    const earlier = usable.filter((item) => item.period < target.period && item.atCut > 0)
    if (earlier.length < 2 || target.observedDays < 7) continue
    exercises.push({ period: target.period, actual: target.total,
      seasonal: Math.round(target.atCut * medianAge(earlier.map((item) => item.total / item.atCut))!),
      recent: Math.round(target.atCut + target.dailyRecent * target.remaining),
      historical: Math.round(target.atCut + mean(earlier.map((item) => item.dailyRemaining)) * target.remaining) })
  }
  const errorFor = (key: 'seasonal' | 'recent' | 'historical') => exercises.length ? mean(exercises.map((test) => Math.abs(test[key] - test.actual))) : null
  return { current, history, usableReferences: usable.length, currentReason,
    recentProjection, historicalProjection, historicalRate, recentReason, historicalReason,
    backtest: { exercises, seasonalMAE: errorFor('seasonal'), recentMAE: errorFor('recent'), historicalMAE: errorFor('historical') } }
}
