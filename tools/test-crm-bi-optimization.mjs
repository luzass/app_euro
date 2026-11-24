import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildCrmManagement } from '../src/lib/crmManagement.ts'

const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8')
const core = text => {
  const start = text.indexOf('create or replace function public.crm_kanban_bi_snapshot(')
  assert.ok(start >= 0)
  return text.slice(start, text.indexOf('end $$;', start) + 7).replaceAll('\r', '')
}
const actor = n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? uid(n) : ''])
const metadata = async () => (await db.query("select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid='public.crm_kanban_bi_snapshot(date,date,boolean)'::regprocedure")).rows[0]
const event = (n, type, at, payload, actorId = null) => db.query('insert into public.crm_kanban_events(contact_id,event_type,created_at,payload,actor_id) values($1,$2,$3,$4,$5)', [uid(n), type, at, payload, actorId])
const plain = model => JSON.parse(JSON.stringify(model, (_key, value) => value instanceof Map ? [...value] : value))
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const [n, role] of [[1, 'admin'], [2, 'captacao'], [3, 'funcionario'], [4, 'reitoria'], [5, 'captacao_gerente'], [6, 'spike']]) await db.query('insert into public.profiles values($1,$2,$3)', [uid(n), 'Member ' + n, role])
  const base = await read('crm_kanban_estrutura.sql')
  const migration = await read('crm_kanban_otimizar_bi.sql')
  const rollback = await read('crm_kanban_reverter_otimizacao_bi.sql')
  for (const path of ['crm_kanban_estrutura.sql', 'crm_kanban_gestao_bi.sql', 'crm_kanban_recorte_20261115.sql']) assert.equal(core(await read(path)), core(migration))
  await db.exec(base)
  await db.exec(core(rollback).replace('public.crm_kanban_bi_snapshot(', 'public.audit_legacy_bi_snapshot('))
  await actor(1)
  for (const n of [100, 101, 102, 103]) await db.query("insert into public.crm_kanban_contacts(id,cpf,owner_id,test_only,source_data,created_at,stage_entered_at) values($1,$2,$3,$4,$5,'2019-12-01','2019-12-01')", [uid(n), String(n).padStart(11, '0'), n === 103 ? null : uid(3), n === 101, { nome: 'Test ' + n, curso: n === 103 ? 'Enfermagem' : 'Direito', campus: n === 103 ? 'Águas Claras' : 'Asa Sul', turno: 'NOTURNO', forma_ingresso: n === 103 ? 'ENEM' : 'Vestibular', email: 'PRIVATE_EMAIL', extra: 'PRIVATE_RAW'.repeat(1000) }])
  await event(100, 'created', '2019-12-01T12:00:00Z', { source: 'leads_cursos', stage: 'primeiro_contato' })
  await event(100, 'assignment', '2019-12-02T12:00:00Z', { from: uid(2), to: uid(3) })
  await event(100, 'assignment', '2020-01-03T12:00:00Z', { from: uid(3), to: uid(2) })
  await event(100, 'assignment', '2020-02-01T12:00:00Z', { from: uid(2), to: uid(3) })
  await event(100, 'source_update', '2020-01-02T12:00:00Z', { source: 'inscritos_20271' })
  for (const [at, key, status] of [['2020-01-03T12:00:00Z', 'A', 'ATIVO'], ['2020-01-04T12:00:00Z', 'B', 'ATIVO'], ['2020-01-05T12:00:00Z', 'A', 'CANCELADO'], ['2020-02-01T12:00:00Z', 'B', 'CANCELADO']]) await event(100, 'source_update', at, { source: 'matriculados_20271', source_key: key, after: { CONTRATO: status, extra: 'PRIVATE_CONTRACT' } })
  await event(101, 'created', '2019-12-01T12:00:00Z', { source: 'leads_cursos', is_test: true })
  await event(103, 'created', '2020-01-01T02:59:59Z', { source: 'inscritos_20271', stage: 'inscrito' })
  await event(100, 'loss_closed', '2019-12-15T12:00:00Z', { id: 'old-loss', reason_id: 'old-reason', reason_label: 'Former reason', course: 'Arquitetura', campus: 'Former campus', admission: 'Transferência', owner_id: uid(2), evidence: 'candidate_reported', note: 'PRIVATE_NOTE' })
  await event(100, 'loss_closed', '2020-01-04T12:00:00Z', { id: 'period-loss', reason_id: 'old-reason', reason_label: 'Former reason', course: 'Direito', campus: 'Asa Sul', admission: 'Vestibular', owner_id: uid(2), evidence: 'staff_inferred' })
  await event(100, 'loss_reopened', '2020-01-05T12:00:00Z', { previous: { id: 'period-loss' } })
  await event(100, 'stage', '2020-01-02T12:00:00Z', { from: 'abordagem', to: 'negociacao' }, uid(2))
  await event(100, 'stage', '2020-01-06T02:59:59Z', { from: 'negociacao', to: 'fechamento' }, uid(2))
  await event(100, 'stage', '2020-01-06T03:00:00Z', { from: 'fechamento', to: 'inscrito' }, uid(2))
  await db.query("insert into public.crm_kanban_events(contact_id,event_type,created_at,payload,actor_id) select $1,'stage','2019-12-10T12:00:00Z'::timestamptz+n*interval '1 second','{\"from\":\"primeiro_contato\",\"to\":\"abordagem\"}'::jsonb,$2 from generate_series(1,400)n", [uid(100), uid(6)])
  const activity = (n, id, when, direction = 'outbound', author = 2) => db.query("insert into public.crm_kanban_activities(id,contact_id,author_id,note,channel,direction,occurred_at) values($1,$2,$3,'PRIVATE_ACTIVITY','whatsapp',$4,$5)", [uid(id), uid(n), uid(author), direction, when])
  await activity(100, 10000, '2019-11-01T12:00:00Z')
  await activity(100, 10002, '2019-12-03T12:00:00Z', 'outbound', 3)
  await activity(100, 10001, '2019-12-03T12:00:00Z', 'outbound', 2)
  await activity(103, 10003, '2020-01-01T03:00:00Z')
  await activity(102, 10004, '2019-12-04T12:00:00Z')
  for (const [id, when, direction] of [[10005, '2020-01-02T12:00:00Z', 'outbound'], [10006, '2020-01-03T12:00:00Z', 'inbound'], [10007, '2020-01-04T12:00:00Z', 'unknown'], [10008, '2020-01-05T12:00:00Z', 'note'], [10009, '2020-01-06T02:59:59Z', 'outbound'], [10010, '2020-01-06T03:00:00Z', 'outbound'], [10011, '2099-01-01T12:00:00Z', 'outbound']]) await activity(100, id, when, direction)
  await db.query("insert into public.crm_kanban_activities(id,contact_id,author_id,note,channel,direction,occurred_at) select ('00000000-0000-0000-0000-'||lpad((20000+n)::text,12,'0'))::uuid,$1,$2,'PRIVATE_ACTIVITY','whatsapp','outbound','2019-12-05T12:00:00Z'::timestamptz+n*interval '1 second' from generate_series(1,400)n", [uid(100), uid(2)])
  const before = { metadata: await metadata(), counts: (await db.query('select (select count(*) from public.crm_kanban_contacts) contacts,(select count(*) from public.crm_kanban_events) events,(select count(*) from public.crm_kanban_activities) activities')).rows }
  await db.exec(migration)
  await db.exec(migration)
  assert.deepEqual(await metadata(), before.metadata)
  let comparisons = 0
  let example
  for (const [from, to] of [['2020-01-01', '2020-01-05'], ['2019-12-01', '2019-12-31'], ['2020-01-04', '2020-01-04'], ['2019-12-01', '2020-02-02'], ['2020-02-02', '2020-02-03']]) for (const includeTests of [false, true]) {
    const pair = (await db.query('select public.audit_legacy_bi_snapshot($1,$2,$3) old,public.crm_kanban_bi_snapshot($1,$2,$3) optimized', [from, to, includeTests])).rows[0]
    assert.deepEqual(pair.optimized.contacts, pair.old.contacts)
    assert.deepEqual(pair.optimized.members, pair.old.members)
    assert.ok(!JSON.stringify(pair.optimized).includes('PRIVATE_'))
    for (const owner of ['', uid(2), uid(3), 'unassigned']) for (const bucket of ['day', 'week']) for (const attributes of [{}, { course: 'Direito' }, { campus: 'Águas Claras', admission: 'ENEM' }, { origin: 'inscritos_20271' }]) {
      const filters = { from, to, includeTests, owner, bucket, tab: 'Resumo', course: '', campus: '', origin: '', admission: '', ...attributes }
      assert.deepEqual(plain(buildCrmManagement(pair.optimized, filters)), plain(buildCrmManagement(pair.old, filters)), JSON.stringify(filters))
      comparisons++
    }
    if (from === '2020-01-01' && !includeTests) example = pair
  }
  assert.ok(example.optimized.events.length < example.old.events.length)
  assert.ok(example.optimized.activities.length < example.old.activities.length)
  assert.ok(example.optimized.activities.some(a => a.id === uid(10001)), 'Keep the real first contact before the period')
  assert.ok(!example.optimized.activities.some(a => a.id === uid(10002)), 'Tie uses the same stable ID ordering as legacy')
  for (const n of [4, 5]) { await actor(n); await db.query("select public.crm_kanban_bi_snapshot('2020-01-01','2020-01-05',false)") }
  for (const n of [2, 3, 6, null]) { await actor(n); await assert.rejects(() => db.query("select public.crm_kanban_bi_snapshot('2020-01-01','2020-01-05',false)"), e => e.code === '42501') }
  await actor(1)
  assert.deepEqual((await db.query('select (select count(*) from public.crm_kanban_contacts) contacts,(select count(*) from public.crm_kanban_events) events,(select count(*) from public.crm_kanban_activities) activities')).rows, before.counts)
  await db.exec(rollback)
  const restored = (await db.query("select public.audit_legacy_bi_snapshot('2020-01-01','2020-01-05',false) old,public.crm_kanban_bi_snapshot('2020-01-01','2020-01-05',false) restored")).rows[0]
  assert.deepEqual(restored.restored, restored.old)
  await db.exec(migration)
  console.log(`PASS: ${comparisons} complete BI-model comparisons match legacy (owners, first contact, cohorts, multiple contracts, cancellations, losses/options, BRT boundaries, tests and filters); permissions, metadata, records, rollback and reapply preserved. Synthetic payload: events ${example.old.events.length}->${example.optimized.events.length}; activities ${example.old.activities.length}->${example.optimized.activities.length}. Not a production RAM benchmark.`)
} finally {
  await db.close()
}
