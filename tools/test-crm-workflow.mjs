import assert from 'node:assert/strict'
import { crmStages } from '../src/lib/crmKanban.ts'
import {
  crmAcademicProgress,
  crmCadence,
  crmCadenceKey,
  crmPauseKey,
  crmNegotiationScripts,
  crmReminders,
} from '../src/lib/crmWorkflow.ts'
import { crmFixture } from './test-crm-kanban.mjs'
const now = Date.parse('2026-11-16T12:00:00Z')
const contact = {
  ...crmFixture()[1],
  stage: 'abordagem',
  stage_entered_at: '2026-11-10T12:00:00Z',
  created_at: '2026-11-10T12:00:00Z',
  last_interaction_at: '2026-11-12T12:00:00Z',
  last_outreach_at: '2026-11-12T12:00:00Z',
  last_response_at: null,
  checklist: {},
}
assert.equal(crmStages.length, 8)
assert.deepEqual(
  crmCadence(contact).map((t) => t.day),
  [0, 2, 5],
)
assert.deepEqual(
  crmCadence({ ...contact, stage: 'negociacao' }).map((t) => t.day),
  [0, 1, 5],
)
assert.deepEqual(
  crmCadence({ ...contact, stage: 'aguardando_matricula' }).map((t) => t.day),
  [0, 3, 10],
)
let alerts = crmReminders([contact], now)
assert.ok(alerts.some((a) => a.kind === 'idle'))
assert.ok(alerts.some((a) => a.kind === 'response'))
const done = { ...contact, checklist: { [crmCadenceKey(contact, 'A1')]: true } }
assert.equal(crmReminders([done], now).find((r) => r.kind === 'cadence').code, 'A2')
const daily = {
  ...done,
  updated_at: new Date(now).toISOString(),
  current_data: { ...done.current_data, telefone: '61911111111' },
}
assert.deepEqual(
  crmReminders([daily], now).map((r) => [r.id, r.due]),
  crmReminders([done], now).map((r) => [r.id, r.due]),
  'Daily imports and field edits do not reset interaction clocks or cadence dates',
)
assert.equal(
  crmCadence({ ...done, stage_entered_at: '2026-11-16T12:00:00Z' })[0].done,
  false,
  'A new phase visit has its own cadence',
)
const replied = {
  ...done,
  last_response_at: '2026-11-15T12:00:00Z',
  last_interaction_at: '2026-11-15T12:00:00Z',
  checklist: { ...done.checklist, [crmPauseKey(done)]: true },
}
assert.equal(crmReminders([replied], now).length, 0)
assert.deepEqual(
  crmReminders([{ ...contact, next_action_at: '2026-11-20T12:00:00Z' }], now).map((r) => r.kind),
  ['manual'],
  'An agreed callback overrides automatic reminders and inactivity alerts',
)
assert.equal(crmReminders([{ ...contact, official_enrollment: true }], now).length, 0)
assert.equal(crmReminders([{ ...contact, archived: true }], now).length, 0)
const enem = {
  ...contact,
  has_inscription: true,
  current_data: { ...contact.current_data, forma_ingresso: 'ENEM', boleto_matricula: 'EM ABERTO' },
}
assert.match(
  crmAcademicProgress(enem, now).label,
  /análise documental/,
  'ENEM does not imply an issued bill or approval',
)
assert.match(
  crmAcademicProgress(
    { ...enem, current_data: { ...enem.current_data, matricula_idlan: '123' } },
    now,
  ).label,
  /Boleto emitido/,
)
assert.equal(
  crmAcademicProgress({ ...enem, official_enrollment: true }, now).category,
  'Matriculado',
)
assert.deepEqual(
  crmNegotiationScripts({
    ...contact,
    current_data: { primeira_graduacao: 'Sim', via_ingresso_opcao: 'ENEM' },
  }).map((s) => s.code),
  ['N4', 'N5', 'N6'],
)
assert.deepEqual(
  crmNegotiationScripts({
    ...contact,
    current_data: { primeira_graduacao: 'Sim', via_ingresso_opcao: 'Vestibular' },
  }).map((s) => s.code),
  ['N4', 'N5', 'N7'],
)
assert.ok(
  crmNegotiationScripts({
    ...contact,
    current_data: { primeira_graduacao: 'Não', situacao_graduacao: 'Concluída' },
  }).some((s) => s.code === 'F5'),
)
console.log(
  'CRM jornada: oito etapas, cadencias, N4-N7, contrato/pagamento, retorno agendado e alertas independentes de contato/resposta verificados.',
)
