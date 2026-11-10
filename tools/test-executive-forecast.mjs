import assert from 'node:assert/strict'
import { buildCampaignForecast, dateDay } from '../src/lib/campaignForecast.ts'
import { executiveOverview } from '../src/lib/executiveAnalytics.ts'

const periods = ['2024.1', '2024.2', '2025.1', '2025.2', '2026.1', '2026.2', '2027.1']
const cpf = (number) => String(number).padStart(11, '0')
const registration = (number, period, date) => ({ cpf: cpf(number), candidato: `Candidato ${number}`, data_inscricao: date, curso: 'DIREITO', campus: 'ASA SUL', turno: 'NOTURNO', forma_de_ingresso: 'VESTIBULAR' })
const enrollment = (number, period, type, date = '01/01/2019') => ({ cpf: cpf(number), periodo_letivo: period, contrato: 'ATIVO', tipo_aluno: type, data_de_matricula: date, data_baixa_do_pagamento: date, curso: 'DIREITO', filial: 'ASA SUL', turno: 'NOTURNO', periodo: '4', tipo_de_ingresso: 'VESTIBULAR' })
export function executiveFixture() {
  const data = periods.map((period) => ({ period, inscritos: [], matriculados: [] }))
  const get = (period) => data.find((item) => item.period === period)
  for (const [year, size] of [[2024, 100], [2025, 200], [2026, 300], [2027, 60]]) {
    const period = year + '.1'
    const current = year === 2027
    for (let i = 0; i < size; i++) get(period).inscritos.push(registration(year * 10000 + i, period, i < 60 ? `${String(1 + i % (current ? 20 : (year - 2023) * 5)).padStart(2, '0')}/10/${year - 1}` : `01/02/${year}`))
    for (let i = 0; i < size / 10; i++) get(period).matriculados.push(enrollment(year * 10000 + i, period, 'CALOURO', i < 6 || current ? `01/10/${year - 1}` : `01/02/${year}`))
  }
  for (const [prior, target, baseSize, renewed, others, offset] of [
    ['2024.2', '2025.1', 100, 80, 20, 1000],
    ['2025.2', '2026.1', 200, 100, 30, 3000],
    ['2026.2', '2027.1', 300, 50, 10, 5000],
  ]) {
    for (let i = 0; i < baseSize; i++) get(prior).matriculados.push(enrollment(offset + i, prior, 'VETERANO'))
    for (let i = 0; i < renewed; i++) get(target).matriculados.push(enrollment(offset + i, target, 'VETERANO'))
    for (let i = 0; i < others; i++) get(target).matriculados.push(enrollment(offset + 1000 + i, target, 'VETERANO'))
  }
  return data
}

export const config = { currentPeriod: '2027.1', start: '2026-09-29', end: '2027-03-31', asOf: '2026-11-06', references: ['2024.1', '2025.1', '2026.1'] }
// This module is also imported by the browser fixture, without running the checks.
if (process.argv[1] && new URL(import.meta.url).pathname.replace(/\\/g, '/').endsWith('/' + process.argv[1].replace(/\\/g, '/').split('/').at(-1))) {
  const data = executiveFixture()
  const result = buildCampaignForecast(data, config)
  assert.equal(result.inscritos.scenario.observed, 60)
  assert.equal(result.inscritos.scenario.reference, 200)
  assert.equal(result.inscritos.scenario.low, 100)
  assert.equal(result.inscritos.scenario.high, 300)
  assert.equal(result.calouros.scenario.observed, 6)
  assert.equal(result.calouros.scenario.reference, 20)
  assert.equal(result.veteranos.observed, 60)
  assert.equal(result.veteranos.low, 180)
  assert.equal(result.veteranos.reference, 220)
  assert.equal(result.veteranos.high, 260)
  assert.equal(result.total.observed, 66)
  assert.equal(result.total.reference, 240)
  assert.equal(result.total.low, 190)
  assert.equal(result.total.high, 290)
  assert.equal(result.inscritos.backtest.period, '2026.1')
  assert.equal(result.inscritos.backtest.predicted, 150)
  assert.equal(result.inscritos.backtest.actual, 300)
  assert.equal(dateDay('31/02/2026'), null)
  assert.equal(dateDay('2026-10-01'), dateDay('01/10/2026'))
  const overview = executiveOverview(data, '2027.1')
  assert.equal(overview.current, 66)
  assert.equal(overview.previous, 300)
  assert.equal(overview.previous + overview.entering - overview.absent, overview.current)
  assert.equal(overview.common + overview.entering, overview.current)

  const missing = structuredClone(data)
  missing.at(-1).matriculados[0].data_de_matricula = ''
  missing.at(-1).matriculados[0].data_baixa_do_pagamento = ''
  const missingResult = buildCampaignForecast(missing, config)
  assert.equal(missingResult.calouros.scenario.observed, 6)
  assert.equal(missingResult.calouros.scenario.reference, null)
  assert.equal(missingResult.total.reference, null)
  const conflict = structuredClone(data)
  conflict.at(-1).matriculados.push({ ...conflict.at(-1).matriculados[0], tipo_aluno: 'VETERANO' })
  const conflictResult = buildCampaignForecast(conflict, config)
  assert.equal(conflictResult.unknownTypes, 1)
  assert.equal(conflictResult.total.reference, null)
  assert.equal(conflictResult.total.observed, 66)
  assert.equal(buildCampaignForecast(data, { ...config, references: [] }).inscritos.scenario.reference, null)
  assert.equal(buildCampaignForecast(data, { ...config, end: '2026-09-01' }).total.reference, null)
  const future = structuredClone(data)
  future.at(-1).inscritos[0].data_inscricao = '01/02/2027'
  assert.equal(buildCampaignForecast(future, config).inscritos.scenario.reference, null)
  const duplicate = structuredClone(data)
  duplicate.at(-1).inscritos.push({ ...duplicate.at(-1).inscritos[0] })
  duplicate.at(-1).matriculados.push({ ...duplicate.at(-1).matriculados[0] })
  assert.equal(buildCampaignForecast(duplicate, config).total.reference, 240)
  assert.equal(buildCampaignForecast(duplicate, config).inscritos.scenario.reference, 200)
  console.log('Executivo: cenários separados, soma, renovação, janelas, teste retrospectivo, CPF único e bloqueios de qualidade verificados.')
}
