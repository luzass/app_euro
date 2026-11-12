import type { GenericRow } from './dashboardHelpers'
import { activePeople, dateDay, matriculasForPeriod, matriculaDateFields, personEvents, registrationsForPeriod, shiftedDay, type CampaignData, type ForecastConfig } from './campaignForecast.ts'

export function comparisonRows(data: CampaignData[], period: string, kind: 'inscritos' | 'calouros'): GenericRow[] {
  if (kind === 'inscritos') return registrationsForPeriod(data, period)
  return [...activePeople(matriculasForPeriod(data, period)).values()]
    .filter((person) => person.type === 'calouro').flatMap((person) => person.rows)
}

export function buildCampaignComparison(data: CampaignData[], config: ForecastConfig, kind: 'inscritos' | 'calouros') {
  const start = dateDay(config.start), end = dateDay(config.end), cut = dateDay(config.asOf)
  if (start === null || end === null || cut === null || end < start || end - start > 730) return null
  const last = Math.min(cut, end)
  if (last < start) return null
  const periods = [...new Set([...config.references.filter((period) => period < config.currentPeriod && period.endsWith(config.currentPeriod.slice(-2))), config.currentPeriod])].sort()
  const series = periods.map((period) => {
    const delta = Number(period.slice(0, 4)) - Number(config.currentPeriod.slice(0, 4))
    const fields = kind === 'inscritos' ? ['data_inscricao'] : matriculaDateFields(config)
    const events = personEvents(comparisonRows(data, period, kind), fields)
    const first = shiftedDay(start, delta), target = shiftedDay(end, delta), cutoff = shiftedDay(last, delta)
    const dates = [...events.people.values()].filter((day): day is number => day !== null && day >= first && day <= target).sort((a, b) => a - b)
    const source = data.find((item) => item.period === period)
    const error = !source || (kind === 'inscritos' ? source.inscritosError : source.matriculadosError)
    const hasDates = events.people.size === 0 || events.missingDates < events.people.size
    return { period, delta, dates, cutoff, missing: events.missingDates, invalidCpf: events.invalidCpf,
      available: !error && hasDates, atCut: error || !hasDates ? null : dates.filter((day) => day <= cutoff).length,
      total: error || !hasDates ? null : dates.length }
  })
  const points: Array<Record<string, number | string | null>> = []
  for (let day = start; day <= last; day++) {
    const point: Record<string, number | string | null> = { day, date: new Date(day * 86400000).toISOString().slice(0, 10) }
    for (const item of series) point[item.period] = item.available ? item.dates.filter((date) => date <= shiftedDay(day, item.delta)).length : null
    points.push(point)
  }
  const current = series.find((item) => item.period === config.currentPeriod)!
  const recent = current.dates.filter((day) => day > last - 7 && day <= last).length
  const prior = current.dates.filter((day) => day > last - 14 && day <= last - 7).length
  return { series, points, recent, prior, fullWeeks: last - start >= 13, cutoff: last }
}
