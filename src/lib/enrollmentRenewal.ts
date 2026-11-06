import { normalizedText, profileField, type ProfileSource } from './studentProfile.ts'

export type RenewalStatus = 'renovou' | 'nao_localizado' | 'provavel_concluinte' | 'aguardando_base'

export interface RenewalEnrollment {
  cpf: string
  name: string
  course: string
  campus: string
  shift: string
  ingresso: string
  level: number | null
  active: boolean
  hasContract: boolean
}

export interface RenewalRecord {
  cpf: string
  name: string
  origins: RenewalEnrollment[]
  destinations: RenewalEnrollment[]
  status: RenewalStatus
  changedCourse: boolean
  inactiveAtDestination: boolean
  uncertainGraduation: boolean
}

export function academicPeriod(value: unknown) {
  const match = /^(20\d{2})\s*(?:[./-]\s*)?0?([12])$/.exec(String(value ?? '').trim())
  return match ? `${match[1]}.${match[2]}` : ''
}

export function nextAcademicPeriod(value: string) {
  const period = academicPeriod(value)
  if (!period) return ''
  const [year, semester] = period.split('.')
  return semester === '1' ? `${year}.2` : `${Number(year) + 1}.1`
}

function courseLevel(value: string) {
  const cleaned = normalizedText(value).replace(/[º°]/g, '').replace(/\s*PERIODO$/, '').trim()
  if (!/^\d{1,2}(?:[.,]0+)?$/.test(cleaned)) return null
  const number = Number(cleaned.replace(',', '.'))
  return number > 0 ? number : null
}

export function probableGraduate(enrollment: RenewalEnrollment) {
  if (!enrollment.course || enrollment.level === null) return false
  return enrollment.level === (enrollment.course === 'MEDICINA' ? 12 : 10)
}

export function indexRenewalRows(sources: ProfileSource[]) {
  const periods = new Map<string, Map<string, RenewalEnrollment[]>>()
  let invalidPeriodRows = 0
  let invalidCpfRows = 0
  let missingContractRows = 0
  const seen = new Set<string>()
  for (const source of sources) {
    for (const row of source.rows) {
      const period = academicPeriod(profileField(row, 'periodo_letivo', 'PERIODO LETIVO'))
      const cpfDigits = profileField(row, 'cpf').replace(/\D/g, '')
      if (!period) invalidPeriodRows += 1
      const validCpf = /^\d{1,11}$/.test(cpfDigits) && !/^0+$/.test(cpfDigits)
      if (!validCpf) invalidCpfRows += 1
      const contract = normalizedText(profileField(row, 'contrato'))
      if (!contract) missingContractRows += 1
      if (!period || !validCpf) continue
      const course = normalizedText(profileField(row, 'curso')).replace(/\s+/g, ' ')
      const unknownCourse = ['', '-', 'NAO INFORMADO', 'NAO INFORMADA', 'NAO SE APLICA', 'SEM CURSO'].includes(course)
      const enrollment: RenewalEnrollment = {
        cpf: cpfDigits.padStart(11, '0'),
        name: profileField(row, 'aluno', 'candidato'),
        course: unknownCourse ? '' : course,
        campus: normalizedText(profileField(row, 'filial', 'campus')),
        shift: normalizedText(profileField(row, 'turno')),
        ingresso: normalizedText(profileField(row, 'tipo_de_ingresso')),
        level: courseLevel(profileField(row, 'periodo')),
        active: contract === 'ATIVO' || contract === 'CONTRATO ATIVO',
        hasContract: Boolean(contract),
      }
      const key = JSON.stringify([period, enrollment.cpf, enrollment.course, enrollment.campus, enrollment.shift, enrollment.ingresso, enrollment.level, contract])
      if (seen.has(key)) continue
      seen.add(key)
      if (!periods.has(period)) periods.set(period, new Map())
      const people = periods.get(period)!
      const enrollments = people.get(enrollment.cpf) ?? []
      enrollments.push(enrollment)
      people.set(enrollment.cpf, enrollments)
    }
  }
  return { periods, invalidPeriodRows, invalidCpfRows, missingContractRows }
}

export function compareRenewal(
  index: ReturnType<typeof indexRenewalRows>,
  origin: string,
  include: (enrollment: RenewalEnrollment) => boolean = () => true,
) {
  const destination = nextAcademicPeriod(origin)
  const target = index.periods.get(destination)
  const hasTargetData = Boolean(target && [...target.values()].some((enrollments) => enrollments.some((enrollment) => enrollment.hasContract)))
  const records: RenewalRecord[] = []
  for (const [cpf, enrollments] of index.periods.get(origin) ?? []) {
    const origins = enrollments.filter((enrollment) => enrollment.active && include(enrollment))
    if (!origins.length) continue
    const observations = target?.get(cpf) ?? []
    const destinations = observations.filter((enrollment) => enrollment.active)
    // Exclude a person only when every selected active enrollment is in its final period.
    const graduating = origins.every(probableGraduate)
    const status: RenewalStatus = graduating ? 'provavel_concluinte'
      : !hasTargetData ? 'aguardando_base'
        : destinations.length ? 'renovou' : 'nao_localizado'
    const originCourses = new Set(origins.map((enrollment) => enrollment.course).filter(Boolean))
    const targetCourses = destinations.map((enrollment) => enrollment.course).filter(Boolean)
    records.push({
      cpf,
      name: origins.find((enrollment) => enrollment.name)?.name || 'Nome não informado',
      origins,
      destinations,
      status,
      changedCourse: status === 'renovou' && originCourses.size > 0 && targetCourses.length > 0 && !targetCourses.some((course) => originCourses.has(course)),
      inactiveAtDestination: !destinations.length && observations.some((enrollment) => enrollment.hasContract),
      uncertainGraduation: origins.some((enrollment) => !enrollment.course || enrollment.level === null),
    })
  }
  const graduating = records.filter((record) => record.status === 'provavel_concluinte').length
  const eligible = records.length - graduating
  const renewed = records.filter((record) => record.status === 'renovou').length
  const missing = records.filter((record) => record.status === 'nao_localizado').length
  return {
    records, origin, destination, hasTargetData,
    base: records.length, graduating, eligible, renewed, missing,
    rate: hasTargetData && eligible > 0 ? renewed / eligible : null,
    changedCourse: records.filter((record) => record.changedCourse).length,
    uncertainGraduation: records.filter((record) => record.uncertainGraduation).length,
  }
}

export function renewalGroups(records: RenewalRecord[], labels: (enrollment: RenewalEnrollment) => string) {
  const groups = new Map<string, { label: string; renovou: number; nao_localizado: number; provavel_concluinte: number; aguardando_base: number; total: number }>()
  for (const record of records) {
    for (const label of new Set(record.origins.map(labels))) {
      const group = groups.get(label) ?? { label, renovou: 0, nao_localizado: 0, provavel_concluinte: 0, aguardando_base: 0, total: 0 }
      group[record.status] += 1
      group.total += 1
      groups.set(label, group)
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'))
}
