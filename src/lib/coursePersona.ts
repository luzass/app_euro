import type { GenericRow } from './dashboardHelpers'
import { academicPeriod } from './enrollmentRenewal.ts'
import { cpfKey, dateDay, registrationsForPeriod, type CampaignData } from './campaignForecast.ts'
import { ageBand, enrollmentAge, normalizedText, profileField } from './studentProfile.ts'
import { isDashboardEnrollment } from './academicScope.ts'

const dimensions = ['idade', 'campus', 'turno', 'ingresso'] as const
type Dimension = typeof dimensions[number]
export const personaLabels = ['Maior aderência', 'Aderência intermediária', 'Menor aderência', 'Dados insuficientes'] as const

function known(value: string) {
  const text = normalizedText(value).replace(/\s+/g, ' ')
  return ['', '-', '--', 'NULL', 'N/A', 'NAO INFORMADO', 'NAO INFORMADA', 'SEM INFORMACAO'].includes(text) ? '' : text
}

function campus(value: string) {
  const text = known(value)
  return text.includes('AGUAS CLARAS') ? 'AGUAS CLARAS' : text.includes('ASA SUL') ? 'ASA SUL' : text
}
function ingresso(value: string) {
  const text = known(value)
  if (text.includes('PROUNI')) return 'PROUNI'
  if (text.includes('FIES')) return 'FIES'
  if (/GRADUADO|2[ªA°]? GRADUACAO|SEGUNDA GRADUACAO/.test(text)) return 'GRADUADO'
  if (text.includes('REINGRESSO')) return 'REINGRESSO'
  if (text.includes('READMISSAO')) return 'READMISSAO'
  if (/TRANS.*INTERNA/.test(text)) return 'TRANSFERENCIA INTERNA'
  if (/TRANS.*EXT/.test(text)) return 'TRANSFERENCIA EXTERNA'
  if (text.includes('ENEM')) return 'ENEM'
  if (/VESTIBULAR|DIGITAL|MEDICINA PRESENCIAL/.test(text)) return 'VESTIBULAR'
  return text
}
function registrationAge(row: GenericRow) {
  const birth = dateDay(profileField(row, 'data_de_nascimento'))
  const event = dateDay(profileField(row, 'data_inscricao'))
  if (birth !== null && event !== null && birth <= event) {
    const b = new Date(birth * 86400000), d = new Date(event * 86400000)
    const age = d.getUTCFullYear() - b.getUTCFullYear() - (d.getUTCMonth() < b.getUTCMonth() || d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate() ? 1 : 0)
    return age >= 10 && age <= 100 ? age : null
  }
  const value = profileField(row, 'idade_na_inscricao')
  const age = Number(value)
  return /^\d{1,3}$/.test(value) && age >= 10 && age <= 100 ? age : null
}
function features(row: GenericRow, enrolled: boolean): Record<Dimension, string> {
  return {
    idade: ageBand(enrolled ? enrollmentAge(row) : registrationAge(row)),
    campus: campus(profileField(row, ...(enrolled ? ['filial', 'campus'] : ['campus', 'filial']))),
    turno: known(profileField(row, 'turno')),
    ingresso: ingresso(profileField(row, ...(enrolled ? ['tipo_de_ingresso', 'forma_de_ingresso'] : ['forma_de_ingresso', 'tipo_de_ingresso']))),
  }
}

export function buildCoursePersona(data: CampaignData[], currentPeriod: string, asOf: string) {
  const historical = new Map<string, { period: string; course: string; row: GenericRow }>()
  const enrolledNow = new Set<string>()
  for (const source of data) for (const row of source.matriculados) {
    if (!isDashboardEnrollment(row, `matriculados_${source.period.replace('.', '')}`)) continue
    const cpf = cpfKey(row), course = known(profileField(row, 'curso'))
    const period = academicPeriod(profileField(row, 'periodo_letivo'))
    const active = ['ATIVO', 'CONTRATO ATIVO'].includes(normalizedText(profileField(row, 'contrato')))
    if (!cpf || !course || !period || !active) continue
    const key = `${cpf}|${course}`
    if (period === currentPeriod) enrolledNow.add(key)
    if (period >= currentPeriod || normalizedText(profileField(row, 'tipo_aluno')) !== 'CALOURO') continue
    const prior = historical.get(key)
    if (!prior || period > prior.period) historical.set(key, { period, course, row })
  }
  const courses = new Map<string, { size: number; counts: Record<Dimension, Map<string, number>> }>()
  for (const person of historical.values()) {
    const course = courses.get(person.course) ?? { size: 0, counts: { idade: new Map(), campus: new Map(), turno: new Map(), ingresso: new Map() } }
    course.size++
    const fields = features(person.row, true)
    for (const key of dimensions) if (fields[key]) course.counts[key].set(fields[key], (course.counts[key].get(fields[key]) ?? 0) + 1)
    courses.set(person.course, course)
  }
  const candidates = new Map<string, GenericRow>()
  let invalidCpf = 0, future = 0
  for (const row of registrationsForPeriod(data, currentPeriod)) {
    if (!isDashboardEnrollment(row, `inscritos_${currentPeriod.replace('.', '')}`)) continue
    const cpf = cpfKey(row)
    if (!cpf) { invalidCpf++; continue }
    const day = dateDay(profileField(row, 'data_inscricao')), cutoff = dateDay(asOf)
    if (day !== null && cutoff !== null && day > cutoff) { future++; continue }
    const course = known(profileField(row, 'curso'))
    const key = `${cpf}|${course}`
    if (!candidates.has(key)) candidates.set(key, row)
  }
  const records = [...candidates].map(([key, row]) => {
    const course = known(profileField(row, 'curso'))
    const baseline = courses.get(course)
    const fields = features(row, false)
    const evidence = dimensions.map((dimension) => {
      const counts = baseline?.counts[dimension] ?? new Map<string, number>()
      const total = [...counts.values()].reduce((a, b) => a + b, 0)
      const count = counts.get(fields[dimension]) ?? 0
      const maximum = Math.max(0, ...counts.values())
      return { dimension, value: fields[dimension], count, total, ratio: fields[dimension] && total >= 10 && maximum > 0 ? count / maximum : null }
    })
    const usable = evidence.filter((item) => item.ratio !== null)
    const hasDate = dateDay(profileField(row, 'data_inscricao')) !== null
    const score = baseline && baseline.size >= 20 && usable.length >= 3 && hasDate
      ? Math.round(100 * usable.reduce((sum, item) => sum + item.ratio!, 0) / usable.length) : null
    const label = score === null ? personaLabels[3] : score >= 70 ? personaLabels[0] : score >= 40 ? personaLabels[1] : personaLabels[2]
    return { key, name: profileField(row, 'candidato', 'nome') || 'Nome não informado', course: course || 'Curso não informado',
      score, label, sample: baseline?.size ?? 0, coverage: usable.length, evidence, enrolled: enrolledNow.has(key),
      reason: !course ? 'Curso ausente' : !baseline || baseline.size < 20 ? 'Menos de 20 CPFs históricos neste curso'
        : !hasDate ? 'Data da inscrição ausente ou inválida' : usable.length < 3 ? 'Menos de três características comparáveis' : '' }
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, 'pt-BR'))
  return { records, invalidCpf, future, historyUnavailable: data.some((item) => item.period < currentPeriod && item.matriculadosError), currentUnavailable: Boolean(data.find((item) => item.period === currentPeriod)?.inscritosError) }
}
