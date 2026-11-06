import assert from 'node:assert/strict'
import { academicPeriod, compareRenewal, indexRenewalRows, nextAcademicPeriod, renewalGroups } from '../src/lib/enrollmentRenewal.ts'

assert.equal(academicPeriod('2026.2'), '2026.2')
assert.equal(academicPeriod('2026/02'), '2026.2')
assert.equal(academicPeriod('20271'), '2027.1')
assert.equal(academicPeriod('2026.10'), '')
assert.equal(academicPeriod(''), '')
assert.equal(nextAcademicPeriod('2026.1'), '2026.2')
assert.equal(nextAcademicPeriod('2026.2'), '2027.1')

const row = (cpf, course, level, period = '2026.2', extra = {}) => ({
  cpf, aluno: 'Aluno de teste ' + cpf, curso: course, periodo: level,
  periodo_letivo: period, contrato: 'ATIVO', filial: 'ASA SUL', turno: 'NOTURNO', ...extra,
})
const origins = [
  row('1', 'DIREITO', 5), row('00000000001', 'DIREITO', 5),
  row('2', 'DIREITO', 7), row('3', 'PSICOLOGIA', 5),
  row('4', 'DIREITO', 10), row('5', 'MEDICINA', 12),
  row('6', 'MEDICINA', 10), row('7', 'BIOMEDICINA', '10º'),
  row('8', 'DIREITO', ''), row('9', 'DIREITO', 5, '2026.2', { contrato: 'CANCELADO' }),
  row('10', 'DIREITO', 5), row('11', 'DIREITO', 10), row('11', 'PSICOLOGIA', 3),
  row('', 'DIREITO', 5), row('123', 'DIREITO', 1, ''),
]
const targets = [
  row('1', 'DIREITO', 6, '2027.1'), row('2', 'PSICOLOGIA', 1, '2027.1'),
  row('6', 'MEDICINA', 11, '2027.1'), row('10', 'DIREITO', 6, '2027.1', { contrato: 'CANCELADO' }),
  row('11', 'DIREITO', 11, '2027.1'), row('12', 'DIREITO', 1, '2027.1'),
]
// Table labels intentionally differ from periodo_letivo: the row field must win.
const index = indexRenewalRows([{ period: '2024.1', rows: [...origins, ...targets, ...targets] }])
assert.equal(index.periods.has('2024.1'), false)
assert.equal(index.invalidPeriodRows, 1)
assert.equal(index.invalidCpfRows, 1)
const result = compareRenewal(index, '2026.2')
assert.equal(result.base, 10)
assert.equal(result.graduating, 3)
assert.equal(result.eligible, 7)
assert.equal(result.renewed, 4)
assert.equal(result.missing, 3)
assert.equal(result.rate, 4 / 7)
assert.equal(result.changedCourse, 1)
assert.equal(result.uncertainGraduation, 1)
assert.equal(result.records.find((item) => item.cpf === '00000000010').inactiveAtDestination, true)
assert.equal(result.records.find((item) => item.cpf === '00000000006').status, 'renovou')
assert.equal(result.records.find((item) => item.cpf === '00000000007').status, 'provavel_concluinte')
assert.equal(result.base, result.graduating + result.eligible)
assert.equal(result.eligible, result.renewed + result.missing)
assert.equal(result.records.some((item) => item.cpf === '00000000012'), false)

const law = compareRenewal(index, '2026.2', (enrollment) => enrollment.course === 'DIREITO')
assert.equal(law.base, 6)
assert.equal(law.graduating, 2)
assert.equal(law.renewed, 2)
assert.equal(law.changedCourse, 1, 'A course filter must not filter out renewal in another course')
assert.equal(compareRenewal(index, '2026.2', () => false).rate, null)
const groups = renewalGroups(result.records, (enrollment) => enrollment.course)
assert.equal(groups.find((group) => group.label === 'DIREITO').total, 6)
assert.equal(groups.reduce((sum, group) => sum + group.total, 0), 11)

const emptyTarget = compareRenewal(indexRenewalRows([{ period: '2026.2', rows: origins }]), '2026.2')
assert.equal(emptyTarget.hasTargetData, false)
assert.equal(emptyTarget.rate, null)
assert.equal(emptyTarget.missing, 0)
assert.equal(emptyTarget.records.filter((item) => item.status === 'aguardando_base').length, 7)
const unclassifiedTarget = compareRenewal(indexRenewalRows([{ period: '2026.2', rows: [origins[0], row('1', 'DIREITO', 6, '2027.1', { contrato: '' })] }]), '2026.2')
assert.equal(unclassifiedTarget.hasTargetData, false)
assert.equal(unclassifiedTarget.rate, null)
const unknownCourse = compareRenewal(indexRenewalRows([{ period: '2026.2', rows: [row('1', 'Não informado', 10), targets[0]] }]), '2026.2')
assert.equal(unknownCourse.graduating, 0)
assert.equal(unknownCourse.uncertainGraduation, 1)
console.log('Renovação: CPF único, período letivo real, concluintes, mudança de curso, contratos inativos e base pendente verificados.')
