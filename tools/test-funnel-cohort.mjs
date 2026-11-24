import assert from 'node:assert/strict'
import { analyzeLeadFunnel } from '../src/lib/funnelCohort.ts'
const cpf = n => String(n).padStart(11, '0')
const row = (origin, id, fields = {}) => ({ origin, cpf: cpf(id), curso: 'Não informado', campus: 'Não informado', processo: 'Não informado', turno: 'Não informado', studentType: 'calouro', ...fields })
const selections = fields => ({ origin: [], status: [], curso: [], campus: [], processo: [], turno: [], ...fields })
const options = { includeMedicine: true, studentType: 'all' }
const data = [
  row('Lead', 1, { cpf: '000.000.000-01', curso: 'Interesse antigo' }),
  row('Lead', 2), row('Lead', 2), row('Lead', 3, { curso: 'Psicologia' }),
  row('Lead', 5), row('Lead', 6, { curso: 'Medicina' }),
  row('Inscrito', 1, { curso: 'Direito', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 1, { curso: 'Direito', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 2, { curso: 'Farmácia', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 2, { curso: 'Biomedicina', campus: 'Águas Claras', processo: 'ENEM', turno: 'Matutino' }),
  row('Matriculado', 1, { curso: 'Direito', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 4, { curso: 'Medicina' }), row('Matriculado', 4, { curso: 'Medicina' }),
  row('Matriculado', 5, { curso: 'Enfermagem', campus: 'Águas Claras', turno: 'Noturno' }),
]
const original = structuredClone(data)
const run = (filters = {}, opts = options, source = data) => analyzeLeadFunnel(source, selections(filters), opts)
const counts = model => [model.leadsCount, model.inscritosCount, model.matriculadosCount]
const stages = model => Object.fromEntries(model.sourceData.map(row => [row.label, row.value]))
const all = run()
assert.deepEqual(counts(all), [5, 2, 2], 'All lead records are eligible, not only matched inscriptions')
assert.deepEqual(stages(all), { 'Não inscritos': 2, 'Inscritos sem matrícula': 1, Matriculados: 2 })
assert.equal(all.sourceData.reduce((sum, row) => sum + row.value, 0), all.leadsCount)
assert.equal(all.enrollmentWithoutInscription, 1, 'A matricula-only match must not fabricate an inscription')
assert.deepEqual(data, original)
assert.deepEqual(counts(run({ status: ['Não inscritos'] })), [2, 0, 0])
assert.deepEqual(counts(run({ status: ['Inscritos sem matrícula'] })), [1, 1, 0])
assert.deepEqual(counts(run({ status: ['Matriculados'] })), [2, 1, 2])
assert.deepEqual(counts(run({ origin: ['Inscrito'] })), [2, 2, 1], 'Cumulative inscription KPI includes matriculated people with inscriptions')
assert.deepEqual(counts(run({ origin: ['Matriculado'] })), [2, 1, 2])
assert.deepEqual(counts(run({ origin: ['Lead'] })), counts(all))
assert.deepEqual(counts(run({ status: ['Não inscritos', 'Inscritos sem matrícula'] })), [3, 1, 0])
assert.deepEqual(counts(run({ curso: ['Direito'] })), [1, 1, 1])
assert.equal(run({ curso: ['Farmácia'], campus: ['Águas Claras'] }).leadsCount, 0, 'Actual registration tuples are never mixed')
assert.deepEqual(counts(run({ curso: ['Enfermagem'] })), [1, 0, 1])
assert.ok(!all.courseData.some(row => row.label === 'Interesse antigo'))
assert.ok(all.courseData.some(row => row.label === 'Psicologia' && row.value === 1))
assert.equal(run({}, { includeMedicine: false, studentType: 'all' }).leadsCount, 4)
const unknowns = [row('Lead', 0, { cpf: '', leadId: 'unknown-1' }), row('Lead', 0, { cpf: '', leadId: 'unknown-2' }), row('Inscrito', 0, { cpf: '' }), row('Matriculado', 0)]
const unknownResult = run({}, options, unknowns)
assert.deepEqual(counts(unknownResult), [2, 0, 0])
assert.equal(unknownResult.unknownCpfCount, 2)
assert.equal(stages(unknownResult)['Sem CPF para cruzar'], 2)
assert.equal(stages(unknownResult)['Não inscritos'], 0, 'Unknown identity is not evidence of non-conversion')
const shortCpf = run({}, options, [row('Lead', 2, { cpf: '2' }), row('Inscrito', 2)])
assert.deepEqual(counts(shortCpf), [1, 1, 0])
const transfer = [row('Lead', 7), row('Inscrito', 7, { studentType: 'veterano' })]
assert.deepEqual(counts(run({}, { includeMedicine: true, studentType: 'veterano' }, transfer)), [1, 1, 0])
const changedCourse = [row('Lead', 8), row('Inscrito', 8, { curso: 'Direito' }), row('Matriculado', 8, { curso: 'Enfermagem' })]
assert.deepEqual(counts(run({ curso: ['Enfermagem'] }, options, changedCourse)), [1, 0, 1])
for (let n = 0; n < 40; n++) {
  const source = [...Array.from({ length: n }, (_, i) => row('Lead', i + 1)), ...Array.from({ length: n }, (_, i) => row(i % 3 ? 'Inscrito' : 'Matriculado', i + 1))]
  const result = run({}, options, source)
  assert.equal(result.sourceData.reduce((sum, row) => sum + row.value, 0), n)
  assert.ok(result.inscritosCount <= n && result.matriculadosCount <= n)
}
assert.deepEqual(counts(run({}, options, [])), [0, 0, 0])
console.log('PASS: total lead base independent of conversion, CPF intersections, exclusive statuses summing to the total, cumulative KPI filters, status/dimension filters, duplicates, real multi-course tuples, enrollment-only matches, invalid/short/formatted CPFs, medicine/student scope, empty data and source immutability.')
