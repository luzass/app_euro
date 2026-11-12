import type { GenericRow } from './dashboardHelpers'
import { activePeople, matriculasForPeriod, previousPeriod, type CampaignData } from './campaignForecast.ts'
import { academicPeriod, compareRenewal, indexRenewalRows, nextAcademicPeriod, probableGraduate } from './enrollmentRenewal.ts'
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

export function cohortOutcomes(data: CampaignData[], institutionData: CampaignData[], entry: string, target: string, currentPeriod: string) {
  const entrants = [...activePeople(matriculasForPeriod(data, entry)).values()].filter((person) => person.type === 'calouro')
  const index = indexRenewalRows(institutionData.map((source) => ({ period: source.period, rows: source.matriculados })))
  const inScope = activePeople(matriculasForPeriod(data, target))
  const available = (period: string) => institutionData.some((source) => source.period === period && !source.matriculadosError) && Boolean([...index.periods.get(period)?.values() ?? []].some((enrollments) => enrollments.some((enrollment) => enrollment.hasContract)))
  const validRange = Boolean(academicPeriod(entry) && academicPeriod(target) && entry <= target && target <= currentPeriod)
  const sourceAvailable = available(entry)
  const destinationAvailable = available(target)
  const gaps: string[] = []
  if (validRange) for (let period = entry; period <= target; period = nextAcademicPeriod(period)) if (!available(period)) gaps.push(period)
  let activeInScope = 0, activeElsewhere = 0, likelyGraduates = 0, notLocated = 0, pending = 0, unknownGraduation = 0
  for (const person of entrants) {
    if (!validRange || !sourceAvailable || !destinationAvailable) { pending++; continue }
    const destination = index.periods.get(target)?.get(person.cpf) ?? []
    if (destination.some((enrollment) => enrollment.active)) {
      if (inScope.has(person.cpf)) activeInScope++
      else activeElsewhere++
      continue
    }
    let missingContract = destination.some((enrollment) => !enrollment.hasContract)
    for (let period = entry; period < target; period = nextAcademicPeriod(period)) {
      if (index.periods.get(period)?.get(person.cpf)?.some((enrollment) => !enrollment.hasContract)) missingContract = true
    }
    if (gaps.length || missingContract) { pending++; continue }
    // A return in the destination takes precedence; otherwise inspect the last active link before it.
    let lastActive = index.periods.get(entry)?.get(person.cpf)?.filter((enrollment) => enrollment.active) ?? []
    for (let period = nextAcademicPeriod(entry); period < target; period = nextAcademicPeriod(period)) {
      const active = index.periods.get(period)?.get(person.cpf)?.filter((enrollment) => enrollment.active) ?? []
      if (active.length) lastActive = active
    }
    if (lastActive.length && lastActive.every(probableGraduate)) likelyGraduates++
    else {
      notLocated++
      if (!lastActive.length || lastActive.some((enrollment) => !enrollment.course || enrollment.level === null)) unknownGraduation++
    }
  }
  const reason = !validRange ? 'Escolha um período igual ou posterior à entrada da turma.' : !sourceAvailable || !destinationAvailable ? 'Base de entrada ou acompanhamento indisponível ou vazia.' : gaps.length ? `Há bases intermediárias indisponíveis ou vazias: ${gaps.join(', ')}.` : ''
  return { total: entrants.length, activeInScope, activeElsewhere, likelyGraduates, notLocated, pending, unknownGraduation, reason, partial: target === currentPeriod }
}
