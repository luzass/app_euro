import assert from 'node:assert/strict'
import { courseOfferings20271, courseOfferingsForPeriod, filterCourseOfferings, matchesCourseOffering, offeringCourseKey } from '../src/lib/courseOfferings.ts'
import { buildCampaignInactivity } from '../src/lib/campaignInactivity.ts'
import { buildCampaignPlanning } from '../src/lib/campaignPlanning.ts'

const offers = courseOfferings20271
const pair = offer => `${offeringCourseKey(offer.curso)} / ${offer.campus}`
assert.equal(offers.length, 43)
assert.equal(new Set(offers.map(pair)).size, 25)
assert.equal(new Set(offers.map(offer => offeringCourseKey(offer.curso))).size, 14)
assert.equal(new Set(offers.map(offer => JSON.stringify(offer))).size, 43)
assert.equal(offers.filter(offer => offer.campus === 'Asa Sul').length, 19)
assert.equal(offers.filter(offer => offer.modalidade === 'Semipresencial').length, 12)
assert.ok(offers.filter(offer => offer.modalidade === 'Semipresencial').every(offer => offer.turno === 'Noturno'))
assert.equal(courseOfferingsForPeriod('2026.1'), undefined)
const all = { curso: null, campus: null, turno: null }
assert.equal(filterCourseOfferings(offers, all, false).length, 42)
assert.equal(filterCourseOfferings(offers, { ...all, curso: [] }, true).length, 0)
assert.equal(filterCourseOfferings(offers, { ...all, curso: ['Inteligência Artificial'] }, true).length, 4)
assert.equal(filterCourseOfferings(offers, { ...all, campus: ['AGUAS CLARAS'], turno: ['Noturno Semi'] }, true).length, 6)
assert.ok(filterCourseOfferings(offers, { ...all, turno: ['Matutino'] }, true).every(offer => offer.turno === 'Matutino'))
const pharmacy = offers.find(offer => offer.curso === 'Farmácia' && offer.modalidade === 'Semipresencial')
assert.ok(matchesCourseOffering({ curso: 'FARMÁCIA', campus: 'AGUAS CLARAS', turno: 'NOTURNO SEMI' }, false, pharmacy))
assert.ok(!matchesCourseOffering({ curso: 'FARMÁCIA', campus: 'ASA SUL' }, false, pharmacy))
assert.ok(!matchesCourseOffering({ curso: 'FARMÁCIA', campus: 'AGUAS CLARAS', modalidade: 'EAD' }, false, pharmacy))
assert.ok(matchesCourseOffering({ curso: 'FARMÁCIA', filial: 'AGUAS CLARAS' }, true, pharmacy), 'Missing schedule must not invent a mismatch')

const config = { currentPeriod: '2027.1', start: '2026-10-01', end: '2027-03-31', asOf: '2026-11-26', references: ['2026.1'] }
const row = (cpf, curso, campus, extra = {}) => ({ cpf, curso, campus, filial: campus, ano_semestre: '2027.1', periodo_letivo: '2027.1', contrato: 'ATIVO', tipo_aluno: 'CALOURO', data_inscricao: '2026-11-20', data_de_matricula: '2026-11-24', ...extra })
const data = [
  { period: '2026.1', inscritos: [row('100', 'BANCO DE DADOS', 'ASA SUL', { ano_semestre: '2026.1' })], matriculados: [] },
  { period: '2027.1', inscritos: [row('1', 'DIREITO', 'ASA SUL'), row('1', 'DIREITO', 'ASA SUL'), row('2', 'INTELIGENCIA ARTIFICIAL', 'AGUAS CLARAS'), row('3', 'BACHARELADO EM INTELIGÊNCIA ARTIFICIAL', 'AGUAS CLARAS'), row('4', 'FARMÁCIA', 'ASA SUL'), row('5', 'BIOMEDICINA', ''), row('6', 'ADMINISTRAÇÃO', 'AGUAS CLARAS', { modalidade: 'EAD' })],
    matriculados: [row('1', 'DIREITO', 'ASA SUL'), row('7', 'MEDICINA', 'ASA SUL'), row('8', 'BANCO DE DADOS', 'ASA SUL'), row('9', 'BANCO DE DADOS', 'ASA SUL', { tipo_aluno: 'VETERANO' })] },
]
const original = JSON.stringify(data)
const result = buildCampaignInactivity(data, config, 'curso_campus')
assert.equal(result.model.groups.length, 25)
assert.deepEqual(result.outside, { registrations: 3, enrollments: 1 })
assert.equal(result.model.groups.find(group => group.label === 'DIREITO / ASA SUL').registrations.count, 1)
assert.equal(result.model.groups.find(group => group.label === 'DIREITO / ASA SUL').enrollments.daysSince, 2)
assert.equal(result.model.groups.find(group => group.label === 'INTELIGENCIA ARTIFICIAL / ÁGUAS CLARAS').registrations.count, 2)
assert.ok(!result.model.groups.some(group => /BANCO|NAO INFORMADO|FARMACIA \/ ASA SUL/.test(group.label)))
const zero = result.model.groups.find(group => group.label === 'CIENCIAS CONTABEIS / ASA SUL')
assert.equal(zero.registrations.count, 0)
assert.equal(zero.enrollments.count, 0)
assert.equal(zero.enrollments.status, 'none')
assert.equal(result.model.elapsed, 57)
assert.equal(buildCampaignInactivity(data, config, 'curso').model.groups.length, 14)
assert.equal(buildCampaignInactivity(data, config, 'campus').model.groups.length, 2)
assert.equal(buildCampaignInactivity(data, config, 'curso', undefined, filterCourseOfferings(offers, all, false)).model.groups.length, 13)
assert.equal(buildCampaignInactivity(data, config, 'curso_campus', undefined, []).model.groups.length, 0)
const onlyCourse = filterCourseOfferings(offers, { ...all, curso: ['Ciências Contábeis'], campus: ['Asa Sul'] }, true)
assert.equal(buildCampaignInactivity(data, config, 'curso_campus', undefined, onlyCourse).model.groups.length, 1)
const missing = buildCampaignInactivity([{ period: '2027.1', inscritos: [], matriculados: [], inscritosError: 'missing', matriculadosError: 'missing' }], config, 'curso_campus')
assert.ok(missing.model.groups.every(group => group.registrations.count === null && group.enrollments.count === null))
assert.equal(buildCampaignInactivity([], config, 'curso_campus').model.groups.length, 25)
assert.ok(buildCampaignInactivity([], config, 'curso_campus').model.groups.every(group => !group.enrollments.available))
assert.equal(buildCampaignPlanning(data, config, 'curso', 'matriculas', undefined, false).groups.some(group => group.label === 'BANCO DE DADOS'), true, 'History and projection sources remain intact')
assert.equal(JSON.stringify(data), original)
console.log('PASS: 43 offers / 25 course-campus groups, aliases, schedules, semi modality, zero-event offers, current-only alerts, filter scope, Medicine, unique CPFs, missing sources and preserved history.')
