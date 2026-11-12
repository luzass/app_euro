import assert from 'node:assert/strict'
import { executiveFixture, config } from './test-executive-forecast.mjs'
import { buildCampaignComparison } from '../src/lib/campaignComparison.ts'
import { buildCampaignForecast, dateDay, shiftedDay } from '../src/lib/campaignForecast.ts'
import { buildCoursePersona } from '../src/lib/coursePersona.ts'
import { isDashboardEnrollment } from '../src/lib/academicScope.ts'

const data = executiveFixture()
const comparison = buildCampaignComparison(data, config, 'inscritos')
assert.ok(comparison)
assert.equal(comparison.series.find((s) => s.period === '2024.1').cutoff, dateDay('2023-11-06'))
assert.equal(comparison.points.at(-1)['2027.1'], 60)
assert.equal(comparison.points.at(-1)['2026.1'], 60)
assert.equal(shiftedDay(dateDay('2028-02-29'), -1), dateDay('2027-02-28'))
assert.equal(buildCampaignComparison(data, { ...config, end: '2040-03-31' }, 'inscritos'), null)
const added = structuredClone(data)
added.at(-1).inscritos.push({ ...added.at(-1).inscritos[0], cpf: '99999999999', data_inscricao: '06/11/2026' })
assert.equal(buildCampaignComparison(added, config, 'inscritos').points.at(-1)['2027.1'], 61)
assert.equal(buildCampaignForecast(added, config).inscritos.scenario.reference, 201)
added.at(-1).inscritos.push({ ...added.at(-1).inscritos[0] })
assert.equal(buildCampaignComparison(added, config, 'inscritos').points.at(-1)['2027.1'], 61)
const unavailable = structuredClone(data)
unavailable[0].inscritosError = 'unavailable'
assert.equal(buildCampaignComparison(unavailable, config, 'inscritos').series[0].atCut, null)
assert.equal(buildCampaignComparison(unavailable, config, 'inscritos').points.at(-1)['2024.1'], null)
assert.equal(isDashboardEnrollment({ codcoligada: '2', codigo_do_processo: '292', ano_semestre: '20242' }, 'inscritos_20242'), false)
assert.equal(isDashboardEnrollment({ codcoligada: '2', codigo_do_processo: '357', ano_semestre: '20251' }, 'inscritos_20252'), false)
assert.equal(isDashboardEnrollment({ codcoligada: '2', codigo_do_processo: '274', ano_semestre: '20251' }, 'inscritos_20252'), true)
assert.equal(isDashboardEnrollment({ codigo_do_processo: '292', ano_semestre: '20271' }, 'inscritos_20271'), true)
assert.equal(isDashboardEnrollment({ nivel_de_ensino: 'PÓS-GRADUAÇÃO' }, 'matriculados_20271'), false)
const mixed = structuredClone(data)
mixed.find((s) => s.period === '2025.2').inscritos.push({ ...mixed.find((s) => s.period === '2025.1').inscritos[0], ano_semestre: '2025.1' })
assert.equal(buildCampaignComparison(mixed, config, 'inscritos').series.find((s) => s.period === '2025.1').atCut, 60)

const baseline = buildCoursePersona(data, '2027.1', config.asOf)
assert.equal(baseline.records.length, 60)
assert.equal(baseline.records[0].score, 100)
assert.equal(baseline.records[0].sample, 60)
const duplicate = structuredClone(data)
duplicate.at(-1).inscritos.push({ ...duplicate.at(-1).inscritos[0] })
duplicate[0].matriculados.push({ ...duplicate[0].matriculados[0] })
assert.deepEqual(buildCoursePersona(duplicate, '2027.1', config.asOf), baseline)
const future = structuredClone(data)
future.at(-1).matriculados.push({ ...future[0].matriculados[0], periodo_letivo: '2027.1', cpf: '88888888888', curso: 'DIREITO', turno: 'MATUTINO' })
const changed = buildCoursePersona(future, '2027.1', config.asOf)
assert.equal(changed.records[0].score, baseline.records[0].score)
assert.equal(changed.records[0].sample, baseline.records[0].sample)
const incomplete = structuredClone(data)
incomplete.at(-1).inscritos[0].turno = ''
const missing = buildCoursePersona(incomplete, '2027.1', config.asOf).records.find((r) => r.key === baseline.records[0].key)
assert.equal(missing.score, null)
const newCourse = structuredClone(data)
newCourse.at(-1).inscritos[0].curso = 'CURSO SEM HISTORICO'
assert.equal(buildCoursePersona(newCourse, '2027.1', config.asOf).records.find((r) => r.course === 'CURSO SEM HISTORICO').score, null)
const protectedData = structuredClone(data)
for (const source of protectedData) for (const row of [...source.inscritos, ...source.matriculados]) { row.sexo = 'F'; row.nacionalidade = 'TESTE'; row.idade_atual = 99 }
assert.deepEqual(buildCoursePersona(protectedData, '2027.1', config.asOf), baseline)
console.log('Executivo: mesma data, ano bissexto, dados novos, CPF unico, periodos mistos, exclusoes, referencia temporal da persona e falta de dados verificados.')
