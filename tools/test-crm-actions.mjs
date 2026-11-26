import assert from 'node:assert/strict'
import { buildCrmActions, crmActionDay, crmActionDescription, crmActionInWindow, summarizeCrmActions } from '../src/lib/crmActions.ts'
import { crmCadenceKey, crmPauseKey } from '../src/lib/crmWorkflow.ts'
import { crmFixture } from './test-crm-kanban.mjs'

// At 01:00 UTC it is still the previous day in Brasilia.
const now = Date.parse('2026-11-25T01:00:00Z')
const base = { ...crmFixture()[0], owner_id: 'seller-1', stage: 'abordagem',
  stage_entered_at: '2026-11-24T12:00:00Z', last_interaction_at: new Date(now).toISOString(),
  created_at: new Date(now).toISOString(), last_outreach_at: null, last_response_at: null,
  next_action_at: null,
}
const manual = (id, due, patch = {}) => ({ ...base, id, next_action_at: due, ...patch })
const rows = [
  manual('recent', '2026-11-24T23:00:00Z'),
  manual('oldest', '2026-11-20T12:00:00Z'),
  manual('today-later', '2026-11-25T02:30:00Z'),
  manual('tomorrow', '2026-11-25T03:00:00Z'),
  manual('other-seller', '2026-11-19T12:00:00Z', { owner_id: 'seller-2' }),
  manual('unassigned', '2026-11-18T12:00:00Z', { owner_id: null }),
  manual('hidden', '2026-11-17T12:00:00Z', { intake_visible: false }),
  manual('archived', '2026-11-17T12:00:00Z', { archived: true }),
  manual('lost', '2026-11-17T12:00:00Z', { loss_data: { reason: 'test' } }),
  manual('enrolled', '2026-11-17T12:00:00Z', { official_enrollment: true }),
  manual('stage-enrolled', '2026-11-17T12:00:00Z', { stage: 'matriculado' }),
]
const original = JSON.stringify(rows)
const own = buildCrmActions(rows, now, 'seller-1')
assert.deepEqual(own.map(action => action.contact.id), ['oldest', 'recent', 'today-later', 'tomorrow'])
assert.deepEqual(own.filter(action => crmActionInWindow(action, now, 'pending')).map(action => action.contact.id), ['oldest', 'recent', 'today-later'])
assert.deepEqual(own.filter(action => crmActionInWindow(action, now, 'overdue')).map(action => action.contact.id), ['oldest', 'recent'])
assert.deepEqual(own.filter(action => crmActionInWindow(action, now, 'today')).map(action => action.contact.id), ['recent', 'today-later'])
assert.deepEqual(own.filter(action => crmActionInWindow(action, now, 'future')).map(action => action.contact.id), ['tomorrow'])
assert.equal(own.filter(action => crmActionInWindow(action, now, 'all')).length, 4)
assert.equal(crmActionDay(now), '2026-11-24')
assert.equal(buildCrmActions(rows, now).length, 6, 'Managers keep visibility of other sellers and unassigned work')
assert.equal(JSON.stringify(rows), original)
assert.deepEqual(buildCrmActions([], now), [])
assert.deepEqual(buildCrmActions([{ ...base, stage_entered_at: 'invalid', next_action_at: 'invalid' }], now), [])
const due = buildCrmActions([{ ...base, checklist: { [crmCadenceKey(base, 'A1')]: true } }], now)
assert.equal(due[0].code, 'A2', 'Only the next unfinished cadence step becomes an action')
assert.ok(crmActionDescription(due[0]).length > 15)
assert.ok(!crmActionDescription(due[0]).includes('{nome}'))
assert.deepEqual(buildCrmActions([{ ...base, checklist: { [crmPauseKey(base)]: true } }], now), [])
assert.equal(buildCrmActions([{ ...base, checklist: { [crmCadenceKey(base, 'A1')]: true } }], now)
  .filter(action => crmActionInWindow(action, now, 'pending')).length, 0,
  'Completing the due step removes it from today and leaves the next step scheduled')
const idle = buildCrmActions([{ ...base, stage_entered_at: '2026-11-15T12:00:00Z', last_interaction_at: '2026-11-16T12:00:00Z', last_outreach_at: '2026-11-17T12:00:00Z' }], now)
assert.deepEqual(new Set(idle.map(action => action.kind)), new Set(['cadence', 'idle', 'response']))
assert.equal(new Set(idle.map(action => action.id)).size, idle.length)
assert.deepEqual(buildCrmActions([manual('future', '2026-11-28T12:00:00Z', { last_interaction_at: '2026-11-16T12:00:00Z' })], now).map(action => action.kind), ['manual'], 'Scheduled return keeps existing suppression of automatic inactivity alerts')
assert.match(crmActionDescription(own[0]), /retorno agendado/)
assert.deepEqual(summarizeCrmActions(own, now), { overdue: 2, today: 2, idle: 0, response: 0 })
assert.deepEqual(summarizeCrmActions(idle, now), { overdue: 1, today: 0, idle: 1, response: 1 }, 'Inactivity and missing response are separate contact counts, not extra scheduled overdue actions')
assert.deepEqual(summarizeCrmActions([], now), { overdue: 0, today: 0, idle: 0, response: 0 })
console.log('CRM actions: chronological priority, seller scope, managers, BRT midnight/today/future, inactive contacts, pending cadence, pause, callbacks, inactivity and immutable inputs passed.')
