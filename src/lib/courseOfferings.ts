import type { GenericRow } from './dashboardHelpers'
import { normalizedText, profileField } from './studentProfile.ts'

export interface CourseOffering {
  curso: string
  campus: 'Asa Sul' | 'Águas Claras'
  turno: 'Matutino' | 'Noturno' | 'Integral'
  modalidade: 'Presencial' | 'Semipresencial'
}
const key = (value: string) => normalizedText(value).replace(/\s+/g, ' ')
export function offeringCourseKey(value: string) {
  const result = key(value)
  return result === 'BACHARELADO EM INTELIGENCIA ARTIFICIAL' ? 'INTELIGENCIA ARTIFICIAL' : result
}
export const offeringCourseLabel = (value: string) => offeringCourseKey(value) === 'INTELIGENCIA ARTIFICIAL' ? 'Inteligência Artificial' : value
export function offeringCampus(value: string) {
  const text = key(value)
  return text.includes('AGUAS CLARAS') ? 'Águas Claras' : /ASA SUL|EUROAM/.test(text) ? 'Asa Sul' : ''
}
export function offeringShift(value: string) {
  return key(value).replace(/\s+(SEMI|SEMIPRESENCIAL)$/, '')
}

const block = (campus: CourseOffering['campus'], turno: CourseOffering['turno'], modalidade: CourseOffering['modalidade'], courses: string[]): CourseOffering[] =>
  courses.map(curso => ({ curso, campus, turno, modalidade }))
const ai = 'Bacharelado em Inteligência Artificial'
export const courseOfferings20271: CourseOffering[] = [
  ...block('Asa Sul', 'Matutino', 'Presencial', ['Direito', 'Biomedicina', 'Enfermagem', 'Fisioterapia', 'Nutrição', 'Psicologia', ai]),
  ...block('Asa Sul', 'Integral', 'Presencial', ['Medicina', 'Odontologia']),
  ...block('Asa Sul', 'Noturno', 'Presencial', ['Enfermagem', 'Direito', 'Odontologia', 'Psicologia']),
  ...block('Asa Sul', 'Noturno', 'Semipresencial', ['Administração', 'Ciências Contábeis', ai, 'Educação Física', 'Biomedicina', 'Nutrição']),
  ...block('Águas Claras', 'Matutino', 'Presencial', ['Sistemas de Informação', ai, 'Biomedicina', 'Educação Física', 'Enfermagem', 'Direito', 'Farmácia', 'Fisioterapia', 'Nutrição', 'Psicologia']),
  ...block('Águas Claras', 'Integral', 'Presencial', ['Odontologia']),
  ...block('Águas Claras', 'Noturno', 'Presencial', ['Sistemas de Informação', 'Direito', 'Biomedicina', 'Enfermagem', 'Fisioterapia', 'Odontologia', 'Psicologia']),
  ...block('Águas Claras', 'Noturno', 'Semipresencial', ['Administração', 'Ciências Contábeis', ai, 'Educação Física', 'Farmácia', 'Nutrição']),
]
export const courseOfferingsForPeriod = (period: string) => period === '2027.1' ? courseOfferings20271 : undefined

export function filterCourseOfferings(offerings: CourseOffering[], filters: { curso: string[] | null; campus: string[] | null; turno: string[] | null }, includeMedicine: boolean) {
  return offerings.filter(offer => (includeMedicine || offeringCourseKey(offer.curso) !== 'MEDICINA')
    && (filters.curso === null || filters.curso.some(course => offeringCourseKey(course) === offeringCourseKey(offer.curso)))
    && (filters.campus === null || filters.campus.some(campus => offeringCampus(campus) === offer.campus))
    && (filters.turno === null || filters.turno.some(shift => offeringShift(shift) === key(offer.turno)
      && (!key(shift).includes('SEMI') || offer.modalidade === 'Semipresencial'))))
}

export function matchesCourseOffering(row: GenericRow, enrollment: boolean, offer: CourseOffering) {
  if (offeringCourseKey(profileField(row, 'curso')) !== offeringCourseKey(offer.curso)
    || offeringCampus(profileField(row, ...(enrollment ? ['filial', 'campus'] : ['campus', 'filial']))) !== offer.campus) return false
  const rawShift = profileField(row, 'turno'), shift = offeringShift(rawShift)
  const mode = key(profileField(row, 'modalidade')) || (key(rawShift).includes('SEMI') ? 'SEMIPRESENCIAL' : '')
  return (!shift || shift === key(offer.turno)) && (!mode || mode === key(offer.modalidade))
}

export const offeringRow = (offer: CourseOffering): GenericRow => ({ ...offer, curso: offeringCourseLabel(offer.curso), filial: offer.campus })
