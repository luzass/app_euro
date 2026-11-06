import type { GenericRow } from './dashboardHelpers'
import { activePeople, matriculasForPeriod, previousPeriod, type CampaignData } from './campaignForecast.ts'
import { compareRenewal, indexRenewalRows, nextAcademicPeriod } from './enrollmentRenewal.ts'
import { normalizedText, profileField } from './studentProfile.ts'

export function executiveOverview(data: CampaignData[], currentPeriod: string) {
  const index = indexRenewalRows(data.map((item) => ({ period: item.period, rows: item.matriculados })))
  const previous = previousPeriod(currentPeriod)
  const prior = activePeople(matriculasForPeriod(data, previous))
  const current = activePeople(matriculasForPeriod(data, currentPeriod))
  const hasPrior = Boolean(index.periods.get(previous)?.size)
  const hasCurrent = Boolean(index.periods.get(currentPeriod)?.size)
  const comparison = compareRenewal(index, previous)
  const entering = [...current.keys()].filter((cpf) => !prior.has(cpf))
  const absent = [...prior.keys()].filter((cpf) => !current.has(cpf))
  const common = [...current.keys()].filter((cpf) => prior.has(cpf))
  const older = new Set<string>()
  for (const period of data.map((item) => item.period).filter((period) => period < previous)) {
    for (const cpf of activePeople(matriculasForPeriod(data, period)).keys()) older.add(cpf)
  }
  const returning = entering.filter((cpf) => older.has(cpf)).length
  const likelyGraduateAbsences = comparison.records.filter((record) => record.status === 'provavel_concluinte' && !current.has(record.cpf)).length
  const courses = [...new Set([...prior.values()].flatMap((person) => person.rows.map((row) => normalizedText(profileField(row, 'curso')))).filter(Boolean))]
  const priorities = courses.map((course) => ({ course, ...compareRenewal(index, previous, (enrollment) => enrollment.course === course) }))
    .sort((a, b) => b.missing - a.missing || a.course.localeCompare(b.course, 'pt-BR'))
  const evolution = data.map((item) => ({
    period: item.period,
    active: index.periods.has(item.period) ? activePeople(matriculasForPeriod(data, item.period)).size : null,
  }))
  const cohorts = data.map((item) => {
    const people = activePeople(matriculasForPeriod(data, item.period))
    const entrants = new Set([...people.values()].filter((person) => person.type === 'calouro').map((person) => person.cpf))
    const cells: Array<{ period: string; count: number | null; rate: number | null }> = []
    let period = item.period
    while (period <= currentPeriod) {
      const population = activePeople(matriculasForPeriod(data, period))
      const count = index.periods.has(period) ? [...entrants].filter((cpf) => population.has(cpf)).length : null
      cells.push({ period, count, rate: count !== null && entrants.size ? count / entrants.size : null })
      period = nextAcademicPeriod(period)
    }
    return { period: item.period, entrants: entrants.size, cells }
  })
  return {
    current: current.size, previous: prior.size, hasPrior, hasCurrent, previousPeriod: previous,
    entering: entering.length, returning, firstObserved: entering.length - returning,
    absent: absent.length, common: common.length, likelyGraduateAbsences,
    otherAbsences: absent.length - likelyGraduateAbsences,
    delta: hasPrior && hasCurrent ? current.size - prior.size : null,
    comparison, priorities, evolution, cohorts,
    invalidPeriodRows: index.invalidPeriodRows, invalidCpfRows: index.invalidCpfRows,
  }
}

export function countUniqueRows(rows: GenericRow[]) {
  const people = new Set<string>()
  for (const row of rows) {
    const cpf = profileField(row, 'cpf').replace(/\D/g, '')
    if (/^\d{1,11}$/.test(cpf) && !/^0+$/.test(cpf)) people.add(cpf.padStart(11, '0'))
  }
  return people.size
}
