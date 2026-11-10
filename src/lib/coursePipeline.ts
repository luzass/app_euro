import { activePeople, cpfKey, dateDay, matriculasForPeriod, registrationsForPeriod, type CampaignData, type ForecastConfig } from './campaignForecast.ts'
import { medianAge, normalizedText, profileField } from './studentProfile.ts'

export function coursePipelineGaps(data: CampaignData[], config: ForecastConfig) {
  const start = dateDay(config.start), cut = dateDay(config.asOf)
  if (start === null || cut === null || cut < start) return []
  if (data.some((item) => item.period === config.currentPeriod && (item.inscritosError || item.matriculadosError))) return []
  const active = new Set<string>()
  for (const person of activePeople(matriculasForPeriod(data, config.currentPeriod)).values()) {
    for (const row of person.rows) active.add(`${person.cpf}|${normalizedText(profileField(row, 'curso')).replace(/\s+/g, ' ')}`)
  }
  const registrations = new Map<string, { course: string; label: string; day: number }>()
  for (const row of registrationsForPeriod(data, config.currentPeriod)) {
    const cpf = cpfKey(row), label = profileField(row, 'curso')
    const course = normalizedText(label).replace(/\s+/g, ' '), day = dateDay(profileField(row, 'data_inscricao'))
    if (!cpf || !course || ['NAO INFORMADO', 'SEM CURSO', '-'].includes(course) || day === null || day < start || day > cut) continue
    const key = `${cpf}|${course}`, previous = registrations.get(key)
    if (!previous || day < previous.day) registrations.set(key, { course, label, day })
  }
  const groups = new Map<string, { course: string; label: string; total: number; active: number; waits: number[] }>()
  for (const [key, registration] of registrations) {
    const group = groups.get(registration.course) ?? { course: registration.course, label: registration.label, total: 0, active: 0, waits: [] }
    group.total++
    if (active.has(key)) group.active++
    else group.waits.push(cut - registration.day)
    groups.set(registration.course, group)
  }
  return [...groups.values()].map(({ waits, ...group }) => ({ ...group, pending: waits.length, medianWait: medianAge(waits) }))
    .sort((a, b) => b.pending - a.pending || (b.medianWait ?? 0) - (a.medianWait ?? 0) || a.course.localeCompare(b.course))
}
