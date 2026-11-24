import assert from 'node:assert/strict'
import { filterFunnelCohort, linkFunnelLeads } from '../src/lib/funnelCohort.ts'
const cpf = n => String(n).padStart(11, '0')
const row = (origin, id, fields = {}) => ({ origin, cpf: cpf(id), curso: 'Não informado', campus: 'Não informado', processo: 'Não informado', turno: 'Não informado', ...fields })
const selections = fields => ({ origin: [], curso: [], campus: [], processo: [], turno: [], ...fields })
const data = [
  row('Lead', 1, { cpf: '000.000.000-01', curso: 'Interesse antigo' }),
  row('Lead', 2), row('Lead', 2), row('Lead', 3, { curso: 'Psicologia' }),
  row('Inscrito', 1, { curso: 'Direito', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 1, { curso: 'Direito', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 2, { curso: 'Farmácia', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 2, { curso: 'Biomedicina', campus: 'Águas Claras', processo: 'ENEM', turno: 'Matutino' }),
  row('Matriculado', 1, { curso: 'Direito', campus: 'Asa Sul', processo: 'Vestibular', turno: 'Noturno' }),
  row('Inscrito', 4, { curso: 'Medicina', campus: 'Asa Sul', turno: 'Integral' }),
  row('Matriculado', 4, { curso: 'Medicina', campus: 'Asa Sul', turno: 'Integral' }),
  row('Lead', 5), row('Matriculado', 5, { curso: 'Enfermagem', campus: 'Águas Claras', turno: 'Noturno' }),
]
const original = structuredClone(data), linked = linkFunnelLeads(data)
const counts = rows => ['Lead', 'Inscrito', 'Matriculado'].map(origin => new Set(rows.filter(row => row.origin === origin).map(row => row.cpf.replace(/\D/g, '').padStart(11, '0'))).size)
assert.deepEqual(data, original, 'Analytical enrichment must not mutate the source lead')
const leads = filterFunnelCohort(linked, selections({ origin: ['Lead'] }))
assert.deepEqual(counts(leads), [4, 2, 2], 'Lead selection retains all actual linked stages, not zeroes')
assert.ok(!leads.some(row => row.cpf === cpf(4)), 'Unrelated enrolments are not attributed to leads')
assert.ok(leads.some(row => row.origin === 'Lead' && row.curso === 'Direito'))
assert.ok(!leads.some(row => row.curso === 'Interesse antigo'))
assert.ok(leads.some(row => row.origin === 'Lead' && row.cpf === cpf(5) && row.curso === 'Enfermagem'), 'Official enrollment can provide missing lead attributes without fabricating an inscription')
const diritto = filterFunnelCohort(linked, selections({ origin: ['Lead'], curso: ['Direito'] }))
assert.deepEqual(counts(diritto), [1, 1, 1])
const tuple = filterFunnelCohort(linked, selections({ origin: ['Lead'], curso: ['Farmácia'], campus: ['Águas Claras'] }))
assert.equal(tuple.length, 0, 'Do not combine course from one inscription and campus from another')
assert.deepEqual(counts(filterFunnelCohort(linked, selections({ origin: ['Inscrito'] }))), [2, 3, 2])
assert.deepEqual(counts(filterFunnelCohort(linked, selections({ origin: ['Matriculado'] }))), [2, 2, 3])
assert.deepEqual(counts(filterFunnelCohort(linked, selections({ origin: ['Lead', 'Inscrito'] }))), [4, 3, 3])
assert.deepEqual(filterFunnelCohort(linked, selections()), linked)
const unknowns = [row('Lead', 0, { cpf: '' }), row('Inscrito', 0, { cpf: '' }), row('Matriculado', 0)]
assert.deepEqual(filterFunnelCohort(linkFunnelLeads(unknowns), selections({ origin: ['Lead'] })), [unknowns[0]])
assert.deepEqual(filterFunnelCohort(linkFunnelLeads([row('Lead', 2, { cpf: '2' }), row('Inscrito', 2)]), selections({ origin: ['Lead'] })).map(row => row.origin), ['Lead', 'Inscrito'])
console.log('PASS: CPF cohorts preserve lead/inscription/enrollment stages; source data unchanged, registration attributes, duplicate people, multiple courses as intact tuples, course/campus filters, enrollment fallback, absent/invalid/short/formatted CPFs, multi-selection and clearing.')
