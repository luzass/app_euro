import assert from 'node:assert/strict'
import { activeCalouroRows, cpfKey, matriculaDateFields } from '../src/lib/campaignData.ts'
import { buildCampaignComparison } from '../src/lib/campaignComparison.ts'
import { scopeHistoryByDate } from '../src/lib/historyDateScope.ts'

export function enrollmentParityFixture() {
  return [2024, 2025, 2026, 2027].map(year => {
    const period = `${year}.1`, date = `${year - 1}-11-26`
    const row = (cpf, patch = {}) => ({ cpf, periodo_letivo: period, ano_semestre: period,
      tipo_aluno: 'CALOURO', contrato: 'ATIVO', curso: 'DIREITO', turno: 'NOTURNO',
      campus: 'Asa Sul', filial: 'Asa Sul', forma_de_ingresso: 'Vestibular', tipo_de_ingresso: 'Vestibular',
      data_de_matricula: date, data_baixa_do_pagamento: date, data_inscricao: date, ...patch })
    return { period, inscritos: [row('11111111111')], matriculados: [
      row('11111111111'),
      row('22222222222', { data_de_matricula: `${year - 1}-11-27` }),
      row('33333333333', { data_baixa_do_pagamento: `${year - 1}-12-01` }),
      row('44444444444', { data_de_matricula: '' }),
      row('55555555555', { tipo_aluno: 'VETERANO' }),
      row('66666666666', { contrato: 'CANCELADO' }),
      row('77777777777', { tipo_aluno: '' }),
      row('88888888888', { curso: 'MEDICINA' }),
      row('12345'), row('00000012345'),
      row('99999999999'), row('99999999999', { tipo_aluno: 'VETERANO', curso: 'MEDICINA' }),
      row('0'), row('123456789012'),
      row('11111111112', { periodo_letivo: '' }),
      row('11111111111', { contrato: 'CANCELADO', tipo_aluno: 'VETERANO' }),
    ] }
  })
}
const config = { currentPeriod: '2027.1', start: '2026-09-29', end: '2027-03-31', asOf: '2026-11-26', references: ['2024.1', '2025.1', '2026.1'], matriculaDate: 'enrollment' }
const fixture = enrollmentParityFixture(), original = JSON.stringify(fixture)
const periods = data => data.map(source => ({ ...source, label: source.period, semester: '1' }))
function parity(data, predicate = () => true, expected = 4) {
  const historical = scopeHistoryByDate(periods(data), 'sameDate', config.asOf, predicate)
  const executive = buildCampaignComparison(data.map(source => ({ ...source, matriculados: source.matriculados.filter(predicate) })), config, 'calouros')
  for (const source of historical.periods) {
    const count = new Set(source.matriculados.map(cpfKey)).size
    assert.equal(count, expected, source.period)
    assert.equal(executive.series.find(series => series.period === source.period).atCut, count)
    assert.equal(executive.points.at(-1)[source.period], count)
  }
  return historical
}
const cut = parity(fixture)
assert.ok(cut.periods.every(source => source.matriculados.some(row => row.curso === 'MEDICINA')))
parity(fixture.map(source => ({ ...source, matriculados: source.matriculados.filter(row => row.curso !== 'MEDICINA') })), () => true, 4)
parity(fixture, row => row.curso === 'DIREITO', 4)
parity(fixture, row => row.curso === 'MEDICINA', 1)
parity(fixture, row => row.curso === 'INEXISTENTE', 0)
const full = scopeHistoryByDate(periods(fixture), 'full', config.asOf)
for (const source of full.periods) {
  assert.equal(new Set(source.matriculados.map(cpfKey)).size, 6)
  assert.equal(source.matriculados.some(row => row.tipo_aluno !== 'CALOURO' || row.contrato !== 'ATIVO'), false)
}
const later = structuredClone(fixture)
for (const source of later) source.matriculados.push({ ...source.matriculados[0], cpf: '11111111119' })
parity(later, () => true, 5)
const defaultDate = buildCampaignComparison(fixture, { ...config, matriculaDate: undefined }, 'calouros')
assert.deepEqual(defaultDate, buildCampaignComparison(fixture, config, 'calouros'))
assert.deepEqual(matriculaDateFields({}), ['data_de_matricula'], 'Never substitute payment when enrollment date is absent')
assert.ok(activeCalouroRows(fixture[0].matriculados).every(row => cpfKey(row)))
assert.equal(JSON.stringify(fixture), original)
console.log('PASS: Historical/Executive parity by enrollment date, active calouros, medicine and course scopes, conflicting types before date cut, invalid/missing identifiers and dates, duplicates, leading zeroes, stock/full vs date cut and new loads.')
