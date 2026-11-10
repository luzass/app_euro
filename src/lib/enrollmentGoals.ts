import type { ProfileSource } from './studentProfile.ts'
import { normalizedText, profileField } from './studentProfile.ts'
import { activePeople, dateDay, matriculasForPeriod, personEvents, type CampaignData } from './campaignForecast.ts'
import { compareRenewal, indexRenewalRows } from './enrollmentRenewal.ts'
import type { GenericRow } from './dashboardHelpers'

export const initialEnrollmentGoals = { period: '2027.1', regular: 307, prouni: 204, includeMedicine: false }
export type EnrollmentGoals = typeof initialEnrollmentGoals

export function calouroAdmissionSegment(rows: GenericRow[]): 'regular' | 'prouni' | null {
  if (!rows.length) return null
  const types = rows.map((row) => normalizedText(profileField(row, 'tipo_de_ingresso')))
  if (types.some((value) => !value || ['-', 'NAO INFORMADO', 'NAO INFORMADA'].includes(value))) return null
  const flags = new Set(types.map((value) => value.includes('PROUNI')))
  return flags.size !== 1 ? null : flags.has(true) ? 'prouni' : 'regular'
}

export function buildEnrollmentGoals(sources: ProfileSource[], origin: string, dates?: { asOf: string; end: string }, goals: EnrollmentGoals = initialEnrollmentGoals) {
  const data: CampaignData[] = sources.map((source) => ({ period: source.period, matriculados: source.rows, inscritos: [] }))
  const index = indexRenewalRows(sources)
  const renewal = compareRenewal(index, origin)
  const prior = activePeople(matriculasForPeriod(data, origin))
  const current = activePeople(matriculasForPeriod(data, renewal.destination))
  const retained = [...current.keys()].filter((cpf) => prior.has(cpf)).length
  const arrivals = current.size - retained
  const deadline = dates ? dateDay(dates.end) : null
  const cutoff = dates ? dateDay(dates.asOf) : null
  const daysLeft = deadline !== null && cutoff !== null ? Math.max(0, deadline - cutoff) : null
  const eligibleCalouros = [...current.values()].filter((person) => person.type === 'calouro')
  const rowsFor = (person: typeof eligibleCalouros[number]) => person.rows.filter((row) => goals.includeMedicine || normalizedText(profileField(row, 'curso')) !== 'MEDICINA')
  const regular: typeof eligibleCalouros = [], prouni: typeof eligibleCalouros = []
  let unclassifiedAdmission = 0
  for (const person of eligibleCalouros) {
    const rows = rowsFor(person)
    if (!rows.length) continue
    const segment = calouroAdmissionSegment(rows)
    if (!segment) { unclassifiedAdmission++; continue }
    if (segment === 'prouni') prouni.push(person)
    else regular.push(person)
  }
  const goalRow = (key: 'regular' | 'prouni', people: typeof eligibleCalouros) => {
    const observed = people.length, target = goals[key], gap = Math.max(0, target - observed)
    const events = personEvents(people.flatMap(rowsFor), ['data_de_matricula', 'data_baixa_do_pagamento'])
    const recent = cutoff === null ? null : [...events.people.values()].filter((day) => day !== null && day > cutoff - 14 && day <= cutoff).length
    return { key, observed, target, gap, progress: target ? observed / target : 0,
      dailyRequired: daysLeft !== null && daysLeft > 0 ? gap / daysLeft : gap === 0 ? 0 : null,
      recent14: recent, dailyRecent: recent === null ? null : recent / 14, missingDates: events.missingDates }
  }
  return {
    origin, destination: renewal.destination, hasOrigin: prior.size > 0,
    base: prior.size, current: current.size, remaining: prior.size ? Math.max(0, prior.size - current.size) : null,
    retained, arrivals, graduating: renewal.graduating, eligible: renewal.eligible,
    renewed: renewal.renewed, missingRenewal: renewal.hasTargetData ? renewal.missing : null,
    replacementIfAllRenew: Math.max(0, renewal.graduating - arrivals),
    oneRenewalPoint: renewal.eligible / 100,
    hasInitialGoals: renewal.destination === goals.period, goals,
    rows: [goalRow('regular', regular), goalRow('prouni', prouni)], daysLeft,
    unclassifiedAdmission, unclassifiedStudent: [...current.values()].filter((person) => person.type === null).length,
  }
}
