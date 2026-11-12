import assert from 'node:assert/strict'
import { cohortOutcomes } from '../src/lib/executiveAnalytics.ts'

const cpf = (id) => String(id).padStart(11, '0')
const row = (id, period, extra = {}) => ({ cpf: cpf(id), aluno: `Aluno ${id}`, periodo_letivo: period, tipo_aluno: period === '2024.1' ? 'CALOURO' : 'VETERANO', contrato: 'ATIVO', curso: 'DIREITO', filial: 'ASA SUL', periodo: '4', ...extra })
export function cohortFixture() {
  const data = ['2024.1', '2024.2', '2025.1', '2025.2', '2026.1', '2026.2', '2027.1'].map((period) => ({ period, inscritos: [], matriculados: [] }))
  const get = (period) => data.find((source) => source.period === period).matriculados
  for (let id = 1; id <= 10; id++) get('2024.1').push(row(id, '2024.1'))
  get('2024.1').push(row(3, '2024.1'))
  get('2024.2').push(row(3, '2024.2', { periodo: '10' }), row(4, '2024.2', { curso: 'MEDICINA', periodo: '12' }), row(7, '2024.2', { periodo: '10' }), row(8, '2024.2', { periodo: '10' }), row(8, '2024.2', { curso: 'PSICOLOGIA', periodo: '4' }), row(9, '2024.2', { periodo: '' }))
  get('2025.1').push(row(1, '2025.1'), row(2, '2025.1', { curso: 'PSICOLOGIA' }), row(7, '2025.1'), row(10, '2025.1'), row(5, '2025.1', { contrato: 'CANCELADO' }))
  get('2025.2').push(row(6, '2025.2', { periodo: '10' }))
  get('2026.1').push(row(99, '2026.1'))
  get('2026.2').push(row(99, '2026.2'))
  get('2027.1').push(row(99, '2027.1'))
  return data
}

const data = cohortFixture(), scoped = data.map((source) => ({ ...source, matriculados: source.matriculados.filter((row) => row.curso === 'DIREITO') }))
const result = cohortOutcomes(scoped, data, '2024.1', '2025.1', '2027.1')
assert.equal(result.total, 10)
assert.equal(result.activeInScope, 3)
assert.equal(result.activeElsewhere, 1, 'A course change must not be called departure from the institution')
assert.equal(result.likelyGraduates, 2, 'Use the last active link, with Medicine at 12 and other courses at 10')
assert.equal(result.notLocated, 4, 'Future observations must not affect earlier outcomes')
assert.equal(result.unknownGraduation, 1)
assert.equal(result.pending, 0)
assert.equal(result.activeInScope + result.activeElsewhere + result.likelyGraduates + result.notLocated + result.pending, result.total)
assert.equal(result.partial, false)
assert.equal(cohortOutcomes(data, data, '2024.1', '2027.1', '2027.1').partial, true)
const gap = data.map((source) => source.period === '2024.2' ? { ...source, matriculados: [], matriculadosError: 'permission denied' } : source)
const uncertain = cohortOutcomes(scoped, gap, '2024.1', '2025.1', '2027.1')
assert.equal(uncertain.pending, 6)
assert.equal(uncertain.likelyGraduates, 0)
assert.equal(uncertain.notLocated, 0)
assert.match(uncertain.reason, /2024.2/)
const emptyTarget = data.map((source) => source.period === '2025.1' ? { ...source, matriculados: [] } : source)
assert.equal(cohortOutcomes(scoped, emptyTarget, '2024.1', '2025.1', '2027.1').pending, 10)
const unknownContract = structuredClone(data)
unknownContract.find((source) => source.period === '2025.1').matriculados.find((row) => row.cpf === cpf(5)).contrato = ''
assert.equal(cohortOutcomes(scoped, unknownContract, '2024.1', '2025.1', '2027.1').pending, 1)
const emptyContracts = data.map((source) => source.period === '2025.1' ? { ...source, matriculados: source.matriculados.map((row) => ({ ...row, contrato: '' })) } : source)
assert.equal(cohortOutcomes(scoped, emptyContracts, '2024.1', '2025.1', '2027.1').pending, 10)
assert.equal(cohortOutcomes(scoped, data, '2024.1', '2024.1', '2027.1').activeInScope, 10)
assert.equal(cohortOutcomes(scoped, data, '2025.1', '2024.1', '2027.1').reason.length > 0, true)
assert.equal(cohortOutcomes(scoped, data, '', '', '2027.1').reason.length > 0, true)
console.log('Turmas: CPF unico, decomposicao de 100%, mudanca de curso, conclusao provavel, retornos, ausencia, dados futuros, bases faltantes e semestre parcial verificados.')
