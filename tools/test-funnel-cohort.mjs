import assert from 'node:assert/strict'
import { analyzeLeadFunnel, analyzeFunnelOverview, funnelLeadCutoff, funnelLeadDay, scopeFunnelLeadsByDate } from '../src/lib/funnelCohort.ts'
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
const overview = analyzeFunnelOverview(data, selections({}), options)
assert.deepEqual(counts(overview), [5, 3, 3], 'General view includes inscriptions/enrollments whose CPFs are absent from leads')
assert.deepEqual(overview.sourceData, [{ label: 'Lead', value: 5 }, { label: 'Inscrito', value: 3 }, { label: 'Matriculado', value: 3 }])
assert.deepEqual(counts(analyzeFunnelOverview(data, selections({ curso: ['Medicina'] }), options)), [1, 1, 1], 'General course filter keeps the independent non-lead academic records')
assert.deepEqual(counts(analyzeFunnelOverview(data, selections({ origin: ['Inscrito'] }), options)), [0, 3, 0])
assert.deepEqual(counts(all), [5, 2, 2], 'All lead records are eligible, not only matched inscriptions')
assert.deepEqual(stages(all), { Leads: 2, 'Leads Inscritos': 1, Matriculados: 2 })
assert.equal(all.sourceData.reduce((sum, row) => sum + row.value, 0), all.leadsCount)
assert.equal(all.enrollmentWithoutInscription, 1, 'A matricula-only match must not fabricate an inscription')
assert.deepEqual(data, original)
assert.deepEqual(counts(run({ status: ['Leads'] })), [2, 0, 0])
assert.deepEqual(counts(run({ status: ['Leads Inscritos'] })), [1, 1, 0])
assert.deepEqual(counts(run({ status: ['Matriculados'] })), [2, 1, 2])
assert.deepEqual(counts(run({ origin: ['Inscrito'] })), [2, 2, 1], 'Cumulative inscription KPI includes matriculated people with inscriptions')
assert.deepEqual(counts(run({ origin: ['Matriculado'] })), [2, 1, 2])
assert.deepEqual(counts(run({ origin: ['Lead'] })), counts(all))
assert.deepEqual(counts(run({ status: ['Leads', 'Leads Inscritos'] })), [3, 1, 0])
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
assert.equal(stages(unknownResult).Leads, 0, 'Unknown identity is not evidence of non-conversion')
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
assert.equal(funnelLeadCutoff, '2026-11-15')
for (const [input, expected] of [
  ['2026-11-15', '2026-11-15'], ['15/11/2026', '2026-11-15'],
  ['2026-11-15 00:00:00', '2026-11-15'], ['15/11/2026 00:00', '2026-11-15'],
  ['2026-11-15T02:59:59.999999Z', '2026-11-14'], ['2026-11-15T03:00:00Z', '2026-11-15'],
  ['2026-11-15T00:00:00-03:00', '2026-11-15'], ['2026-11-15T00:00:00+00:00', '2026-11-14'],
  ['2026-11-15 03:00:00+00:00', '2026-11-15'],
  ['2026-11-15T00:00:00-0300', '2026-11-15'],
  ['', null], [null, null], ['31/11/2026', null], ['2026-02-30', null], ['2026-11-15T25:00:00Z', null],
]) assert.equal(funnelLeadDay(input), expected, String(input))
const leadInputs = [
  { id: 1, cpf: cpf(1), created_at: '2026-11-15T03:00:00Z' },
  { id: 2, cpf: cpf(2), created_at: '2026-11-15T02:59:59Z' },
  { id: 3, cpf: cpf(3) },
  { id: 4, cpf: cpf(4), data_criacao: '15/11/2026' },
  { id: 5, cpf: cpf(5), DATA: '2026-11-16' },
  { id: 6, cpf: cpf(6), created_at: 'invalid', data_criacao: '2026-11-16' },
  { id: 7, cpf: cpf(7), created_at: '14/11/2026' },
]
const inputCopy = structuredClone(leadInputs), dated = scopeFunnelLeadsByDate(leadInputs)
assert.deepEqual(dated.rows.map(row => row.id), [1, 4, 5])
assert.equal(dated.excludedBefore, 2)
assert.equal(dated.missingOrInvalidDates, 2)
assert.deepEqual(leadInputs, inputCopy)
const datedModel = run({}, options, [
  ...dated.rows.map(lead => row('Lead', lead.id)),
  ...[1, 2, 3].flatMap(id => [
    row('Inscrito', id, { data_inscricao: '01/11/2026' }),
    row('Matriculado', id, { data_de_matricula: '02/11/2026' }),
  ]),
])
assert.deepEqual(counts(datedModel), [3, 1, 1], 'Only the lead date is scoped; academic dates never apply this cutoff and never rescue old/undated leads')
const datedGeneral = analyzeFunnelOverview([
  ...dated.rows.map(lead => row('Lead', lead.id)),
  ...[1, 2, 3].flatMap(id => [row('Inscrito', id), row('Matriculado', id)]),
], selections({}), options)
assert.deepEqual(counts(datedGeneral), [3, 3, 3], 'Lead date eligibility never restricts general academic totals')
console.log('PASS: general totals independent across three tables, separate lead-only intersections/statuses, lead cutoff/BRT/aliases, academic dates and unrelated registrations preserved in overview, filters, duplicates and source immutability.')
