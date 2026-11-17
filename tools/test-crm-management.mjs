import assert from 'node:assert/strict'
import { buildCrmManagement, biMedian, biPercent } from '../src/lib/crmManagement.ts'
import { canAccessPath, getAllowedNavItems } from '../src/lib/navigation.ts'

export const biFilters = {
  from: '2026-11-13',
  to: '2026-11-17',
  owner: '',
  course: '',
  campus: '',
  origin: '',
  admission: '',
  includeTests: false,
  bucket: 'day',
  tab: 'Resumo',
}
export function managementFixture() {
  const at = (day, hour = '12') => `2026-11-${day}T${hour}:00:00Z`
  const contact = (id, patch = {}) => ({
    id,
    owner_id: 'seller-a',
    stage: 'primeiro_contato',
    has_inscription: false,
    official_enrollment: false,
    test_only: false,
    archived: false,
    loss_data: null,
    current_data: {
      nome: 'Candidato ' + id,
      curso: 'Direito',
      campus: 'Asa Sul',
      turno: 'NOTURNO',
      forma_ingresso: 'Vestibular',
    },
    checklist: {},
    created_at: at('13'),
    stage_entered_at: at('13'),
    next_action_at: null,
    last_interaction_at: null,
    last_outreach_at: null,
    last_response_at: null,
    entry_at: at('13'),
    entry_day: '2026-11-13',
    entry_basis: 'event',
    entry_event_id: 1,
    entry_stage: 'primeiro_contato',
    origin: 'leads_cursos',
    first_inscription_at: null,
    first_inscription_day: null,
    first_inscription_event_id: null,
    first_enrollment_at: null,
    first_enrollment_day: null,
    first_enrollment_event_id: null,
    enrolled_as_of: false,
    history_complete: true,
    ...patch,
  })
  const inscribed = {
    has_inscription: true,
    first_inscription_at: at('14'),
    first_inscription_day: '2026-11-14',
    first_inscription_event_id: 3,
  }
  const enrolled = {
    official_enrollment: true,
    stage: 'matriculado',
    first_enrollment_at: at('16'),
    first_enrollment_day: '2026-11-16',
    first_enrollment_event_id: 5,
    enrolled_as_of: true,
  }
  const contacts = [
    contact('lead-converted', { ...inscribed, ...enrolled, owner_id: 'seller-b' }),
    contact('direct', {
      ...inscribed,
      first_inscription_at: at('13'),
      first_inscription_day: '2026-11-13',
      origin: 'inscritos_20271',
      entry_stage: 'inscrito',
      stage: 'aguardando_matricula',
    }),
    contact('baseline', {
      ...inscribed,
      ...enrolled,
      first_inscription_at: at('13'),
      first_enrollment_at: at('13'),
      first_enrollment_day: '2026-11-13',
    }),
    contact('cancelled', {
      ...inscribed,
      ...enrolled,
      official_enrollment: false,
      enrolled_as_of: false,
      stage: 'inscrito',
    }),
    contact('lost', {
      archived: true,
      loss_data: { id: 'loss-2' },
      owner_id: 'seller-b',
      current_data: {
        nome: 'Candidato lost',
        curso: 'Psicologia',
        campus: 'Águas Claras',
        forma_ingresso: 'ENEM',
      },
    }),
    contact('test', { test_only: true, entry_basis: 'test' }),
    contact('became-real', { created_at: at('10'), entry_at: at('15'), entry_day: '2026-11-15' }),
    contact('incomplete', { has_inscription: true, history_complete: false }),
    contact('fallback', { entry_basis: 'fallback' }),
    contact('claimed', { owner_id: 'seller-b' }),
  ]
  const loss = (id, day, evidence) => ({
    id,
    contact_id: 'lost',
    at: at(day),
    day: `2026-11-${day}`,
    actor_id: 'seller-a',
    type: 'loss_closed',
    data: {
      id: 'loss-' + id,
      reason_id: 'price',
      reason_label: 'Preço acima do orçamento',
      evidence,
      owner_id: 'seller-a',
      course: 'Direito',
      campus: 'Asa Sul',
      admission: 'Vestibular',
    },
  })
  return {
    version: 1,
    generated_at: at('17', '18'),
    from: biFilters.from,
    to: biFilters.to,
    from_at: '2026-11-13T03:00:00Z',
    cutoff_at: '2026-11-18T03:00:00Z',
    tracking_started_at: at('10'),
    include_tests: false,
    sync: { at: at('17', '17'), result: {} },
    contacts,
    events: [
      {
        id: 9,
        contact_id: 'lead-converted',
        at: at('17'),
        day: '2026-11-17',
        actor_id: 'manager',
        type: 'assignment',
        data: { from: 'seller-a', to: 'seller-b' },
      },
      {
        id: 10,
        contact_id: 'claimed',
        at: at('16'),
        day: '2026-11-16',
        actor_id: 'seller-a',
        type: 'assignment',
        data: { from: null, to: 'seller-a' },
      },
      {
        id: 11,
        contact_id: 'claimed',
        at: at('17'),
        day: '2026-11-17',
        actor_id: 'manager',
        type: 'assignment',
        data: { from: 'seller-a', to: 'seller-b' },
      },
      loss(20, '14', 'candidate_reported'),
      loss(21, '16', 'staff_inferred'),
      {
        id: 22,
        contact_id: 'lost',
        at: at('15'),
        day: '2026-11-15',
        type: 'loss_reopened',
        actor_id: 'seller-a',
        data: {},
      },
    ],
    activities: [
      {
        id: 'act1',
        contact_id: 'lead-converted',
        author_id: 'seller-a',
        at: at('13', '14'),
        day: '2026-11-13',
        direction: 'outbound',
      },
      {
        id: 'act2',
        contact_id: 'lead-converted',
        author_id: 'seller-a',
        at: at('14'),
        day: '2026-11-14',
        direction: 'inbound',
      },
      {
        id: 'act3',
        contact_id: 'direct',
        author_id: 'seller-a',
        at: at('13'),
        day: '2026-11-13',
        direction: 'note',
      },
      {
        id: 'act4',
        contact_id: 'direct',
        author_id: 'seller-a',
        at: at('13'),
        day: '2026-11-13',
        direction: 'unknown',
      },
    ],
    members: [
      { id: 'seller-a', nome: 'Atendente A', role: 'captacao' },
      { id: 'seller-b', nome: 'Atendente B', role: 'captacao' },
      { id: 'manager', nome: 'Supervisão', role: 'captacao_gerente' },
    ],
    reasons: [{ id: 'price', name: 'Preço / condições', active: true }],
  }
}
const data = managementFixture(),
  model = buildCrmManagement(data, biFilters)
assert.equal(
  model.stock.active.some((c) => c.id === 'test'),
  false,
)
assert.equal(
  model.entries.some((c) => c.id === 'fallback'),
  false,
)
assert.equal(
  model.entries.some((c) => c.id === 'became-real'),
  true,
)
assert.equal(model.cohortUnknown.length, 1)
assert.equal(model.baselineEnrolled.length, 1)
assert.equal(model.cohortGroups[0].registered.length, 2)
assert.equal(model.cohortGroups[0].converted.length, 1)
assert.equal(model.cohortGroups[1].base.length, 1)
assert.equal(model.losses.length, 2)
assert.equal(new Set(model.losses.map((e) => e.contact_id)).size, 1)
assert.equal(model.reasons[0].reported, 1)
assert.equal(model.reasons[0].inferred, 1)
assert.equal(model.outgoing.length, 1)
assert.equal(model.firstContactMedian, 2)
assert.equal(
  model.team.find((m) => m.id === 'seller-a').enrollments.some((c) => c.id === 'lead-converted'),
  true,
)
assert.equal(
  model.team.find((m) => m.id === 'seller-b').portfolio.some((c) => c.id === 'lead-converted'),
  true,
)
const seller = buildCrmManagement(data, { ...biFilters, owner: 'seller-a' })
assert.equal(
  seller.entries.some((c) => c.id === 'claimed'),
  true,
  'First claim must not be retroactively replaced by the current owner',
)
assert.equal(seller.outgoing.length, 1)
const unassignedPast = buildCrmManagement(
  { ...data, cutoff_at: '2026-11-16T03:00:00Z' },
  { ...biFilters, to: '2026-11-15', owner: 'unassigned' },
)
assert.equal(
  unassignedPast.entries.some((c) => c.id === 'claimed'),
  true,
  'Initial null owner must remain null before first assignment',
)
const historic = buildCrmManagement(data, {
  ...biFilters,
  course: 'Direito',
  campus: 'Asa Sul',
  admission: 'Vestibular',
})
assert.equal(historic.losses.length, 2, 'Loss uses historical attributes, not current profile')
assert.equal(historic.lossRow(historic.losses[0]).course, 'Direito')
assert.equal(buildCrmManagement(data, { ...biFilters, course: 'Psicologia' }).losses.length, 0)
assert.equal(biMedian([]), null)
assert.equal(biMedian([1, 4, 2, 3]), 2.5)
assert.equal(biPercent(0, 0), '—')
for (const group of model.cohortGroups) assert.ok(group.converted.length <= group.base.length)
assert.equal(
  buildCrmManagement(data, { ...biFilters, includeTests: true }).stock.active.length,
  model.stock.active.length + 1,
)
assert.equal(
  buildCrmManagement(data, { ...biFilters, bucket: 'week' }).trend.reduce(
    (s, b) => s + (b.entries || 0),
    0,
  ),
  model.entries.length,
)
assert.equal(canAccessPath('/app/gestao-crm', 'captacao'), false)
assert.equal(canAccessPath('/app/gestao-crm', 'reitoria'), true)
assert.equal(
  getAllowedNavItems('captacao_gerente').some((n) => n.path === '/app/gestao-crm'),
  true,
)
console.log(
  'CRM management: cohorts, historical attribution, test exclusion, losses and permissions passed.',
)
