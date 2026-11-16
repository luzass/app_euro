import assert from 'node:assert/strict'
import { crmFixture } from './test-crm-kanban.mjs'
import { crmMovePreview } from '../src/lib/crmKanban.ts'
import { matchesCrmArchiveView } from '../src/lib/crmLoss.ts'
import { crmReminders } from '../src/lib/crmWorkflow.ts'
const c = {
  ...crmFixture()[0],
  last_outreach_at: '2026-11-10T12:00:00Z',
  last_interaction_at: '2026-11-10T12:00:00Z',
}
assert.ok(crmReminders([c], Date.parse('2026-11-16T12:00:00Z')).some((r) => r.kind === 'response'))
assert.equal(c.archived, false, 'No response must never archive a lead automatically')
assert.equal(c.loss_data, undefined, 'No response must never generate a loss reason')
assert.equal(matchesCrmArchiveView(c, 'active'), true)
const lost = {
  ...c,
  archived: true,
  loss_data: {
    id: 'loss-1',
    reason_id: 'reason-1',
    reason_label: 'Preço',
    evidence: 'staff_inferred',
    note: 'Orçamento',
    closed_at: '2026-11-16T12:00:00Z',
    closed_by: 'seller-1',
    stage: 'negociacao',
    owner_id: 'seller-1',
    course: 'Direito',
    campus: 'Asa Sul',
    shift: 'NOTURNO',
    category: 'Lead',
  },
}
assert.equal(matchesCrmArchiveView(lost, 'active'), false)
assert.equal(matchesCrmArchiveView(lost, 'lost'), true)
assert.equal(matchesCrmArchiveView(lost, 'archived'), false)
assert.equal(matchesCrmArchiveView({ ...c, archived: true }, 'archived'), true)
assert.equal(crmReminders([lost], Date.parse('2026-12-01T12:00:00Z')).length, 0)
assert.equal(
  crmReminders([{ ...lost, archived: false }], Date.parse('2026-12-01T12:00:00Z')).length,
  0,
)
assert.equal(crmMovePreview([lost], lost.id, 'stage:fechamento', true)[0].stage, lost.stage)
console.log(
  'CRM desistencia: sem resposta nao vira perda, filtros separados, cadencias suspensas e bloqueio de movimentacao verificados.',
)
