import assert from 'node:assert/strict'
import { semesterTransitions } from '../src/lib/executiveAnalytics.ts'
const row = (id, period, extra = {}) => ({
  cpf: String(id).padStart(11, '0'),
  aluno: 'Aluno ' + id,
  periodo_letivo: period,
  tipo_aluno: 'CALOURO',
  contrato: 'ATIVO',
  curso: 'DIREITO',
  filial: 'ASA SUL',
  periodo: '4',
  ...extra,
})
export function transitionsFixture() {
  return [
    {
      period: '2026.1',
      inscritos: [],
      matriculados: [
        row(1, '2026.1'),
        row(1, '2026.1'),
        row(2, '2026.1', { curso: 'MEDICINA', periodo: '12' }),
        row(3, '2026.1', { tipo_aluno: 'VETERANO', periodo: '10' }),
        row(4, '2026.1', { tipo_aluno: 'VETERANO' }),
        row(5, '2026.1'),
        row(6, '2026.1', { curso: 'MEDICINA', tipo_aluno: 'VETERANO', periodo: '10' }),
        row(7, '2026.1', { tipo_aluno: '' }),
        row(8, '2026.1'),
        row(9, '2026.1', { tipo_aluno: 'VETERANO', periodo: '' }),
        row(10, '2026.1', { curso: 'MEDICINA' }),
        row(10, '2026.1', { tipo_aluno: 'VETERANO' }),
        row(11, '2026.1', { contrato: 'CANCELADO' }),
        row(12, '2026.1', { periodo: '10' }),
        row(12, '2026.1', { curso: 'MEDICINA', periodo: '4' }),
      ],
    },
    {
      period: '2026.2',
      inscritos: [],
      matriculados: [
        row(1, '2026.2', { tipo_aluno: 'VETERANO' }),
        row(5, '2026.2', { tipo_aluno: 'VETERANO', curso: 'PSICOLOGIA', filial: 'ÁGUAS CLARAS' }),
        row(7, '2026.2', { tipo_aluno: 'VETERANO' }),
        row(10, '2026.2', { tipo_aluno: 'VETERANO', curso: 'MEDICINA' }),
        row(8, '2026.2', { tipo_aluno: 'VETERANO', contrato: 'CANCELADO' }),
      ],
    },
    {
      period: '2027.1',
      inscritos: [],
      matriculados: [row(1, '2027.1', { tipo_aluno: 'VETERANO' })],
    },
  ]
}
const data = transitionsFixture()
const all = semesterTransitions(data, data, '2027.1', 'all')[0]
assert.equal(all.origin, '2026.1')
assert.equal(all.destination, '2026.2')
assert.equal(all.total, 11)
assert.equal(all.retained, 4)
assert.equal(all.likelyGraduates, 2)
assert.equal(all.notLocated, 5)
assert.equal(all.notActive, 7)
assert.equal(all.absenceRate, 7 / 11)
assert.equal(all.otherAbsenceRate, 5 / 11)
assert.equal(all.unclassifiedType, 2)
assert.equal(all.unknownGraduation, 1)
assert.equal(all.retained + all.notActive + all.pending, all.total)
const cal = semesterTransitions(data, data, '2027.1', 'calouro')[0],
  vet = semesterTransitions(data, data, '2027.1', 'veterano')[0]
assert.equal(cal.total, 5)
assert.equal(cal.retained, 2)
assert.equal(cal.notActive, 3)
assert.equal(cal.absenceRate, 0.6)
assert.equal(vet.total, 4)
assert.equal(vet.retained, 0)
assert.equal(vet.notActive, 4)
assert.equal(vet.absenceRate, 1)
assert.equal(cal.total + vet.total + all.unclassifiedType, all.total)
const scope = (course) =>
  data.map((s) => ({ ...s, matriculados: s.matriculados.filter((r) => r.curso === course) }))
const law = semesterTransitions(scope('DIREITO'), data, '2027.1', 'all')[0]
assert.equal(law.total, 9)
assert.equal(law.retained, 4)
assert.equal(law.activeElsewhere, 2, 'Internal transfers remain enrolled in the IES')
assert.equal(law.likelyGraduates, 1, 'A concurrent non-final enrollment blocks assumed graduation')
const med = semesterTransitions(scope('MEDICINA'), data, '2027.1', 'all')[0]
assert.equal(med.total, 4)
assert.equal(med.retained, 1)
assert.equal(med.likelyGraduates, 1)
assert.equal(med.notLocated, 2)
assert.equal(med.absenceRate, 0.75)
assert.equal(semesterTransitions(data, data, '2027.1', 'all')[1].partial, true)
const failed = data.map((s) =>
  s.period === '2026.2' ? { ...s, matriculadosError: 'indisponivel' } : s,
)
const unavailable = semesterTransitions(failed, failed, '2027.1', 'all')[0]
assert.equal(unavailable.pending, 11)
assert.equal(unavailable.absenceRate, null)
assert.equal(unavailable.destinationAvailable, false)
const empty = data.map((s) => (s.period === '2026.2' ? { ...s, matriculados: [] } : s))
assert.equal(semesterTransitions(empty, empty, '2027.1', 'all')[0].absenceRate, null)
const unknown = structuredClone(data)
unknown[1].matriculados.find((r) => r.cpf === String(8).padStart(11, '0')).contrato = ''
assert.equal(semesterTransitions(unknown, unknown, '2027.1', 'all')[0].pending, 1)
assert.equal(semesterTransitions(unknown, unknown, '2027.1', 'all')[0].absenceRate, null)
assert.equal(semesterTransitions(scope('INEXISTENTE'), data, '2027.1', 'all')[0].absenceRate, null)
const gap = data.filter((s) => s.period !== '2026.2')
assert.equal(
  semesterTransitions(gap, gap, '2027.1', 'all')[0].destination,
  '2026.2',
  'Never skip an unavailable semester',
)
assert.equal(semesterTransitions(gap, gap, '2027.1', 'all')[0].absenceRate, null)
assert.deepEqual(data, transitionsFixture(), 'Input snapshots must not be mutated')
const returnedLater = structuredClone(data)
returnedLater[2].matriculados.push(row(4, '2027.1', { tipo_aluno: 'VETERANO' }))
assert.equal(
  semesterTransitions(returnedLater, returnedLater, '2027.1', 'all')[0].notActive,
  7,
  'A later return must not rewrite an earlier semester transition',
)
console.log(
  'Semester transitions: general/freshmen/veterans, denominators, unique CPF, Medicine, internal transfers, classification, missing data and partial semester passed.',
)
