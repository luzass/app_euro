import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const rpc = async (name, args = []) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args,
)).rows[0].result
const actor = n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(n)])
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8')
const metadata = async () => (await db.query(`select oid,proowner,proacl,prosecdef,proconfig
  from pg_proc where oid='public.crm_kanban_activity_v2(uuid,text,text,timestamptz,uuid,text,text,timestamptz)'::regprocedure`)).rows[0]
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const n of [1, 2]) await db.query("insert into public.profiles values($1,$2,'captacao')", [uid(n), 'Seller ' + n])
  await db.exec(await read('crm_kanban_estrutura.sql'))
  await actor(1)
  let c = await rpc('crm_kanban_create', ['12345678901', { nome: 'Retroactive test' }, null])
  c = await rpc('crm_kanban_save', [c.id, { stage: 'abordagem' }, c.version])
  await db.query("update public.crm_kanban_contacts set stage_entered_at=now()-interval '2 days',next_action_at=now()+interval '1 day' where id=$1", [c.id])
  const current = async () => (await db.query('select * from public.crm_kanban_contacts where id=$1', [c.id])).rows[0]
  c = await current()
  const anchor = c.stage_entered_at
  const dates = (await db.query("select (now()-interval '3 days')::text old,(now()-interval '1 day')::text recent,(now()+interval '1 day')::text future")).rows[0]
  const send = (code, when, at = anchor, direction = 'outbound') => rpc('crm_kanban_activity_v2', [c.id, 'Retroactive test note', 'whatsapp', when, null, direction, code, at])
  const installed = (await db.query("select pg_get_functiondef('public.crm_kanban_activity_v2(uuid,text,text,timestamptz,uuid,text,text,timestamptz)'::regprocedure) def")).rows[0].def
  await db.exec(installed.replace('if p_code is not null then', "if p_code is not null and p_occurred<c.stage_entered_at then raise exception 'Cadencia desatualizada' using errcode='PT409'; end if; if p_code is not null then"))
  await assert.rejects(() => send('A1', dates.old), e => e.code === 'PT409')
  const beforeMetadata = await metadata()
  const hotfix = await read('crm_kanban_atendimento_retroativo.sql')
  await db.exec(hotfix)
  await db.exec(hotfix)
  assert.deepEqual(await metadata(), beforeMetadata)
  const definition = (text) => {
    const start = text.indexOf('create or replace function public.crm_kanban_activity_v2(')
    return text.slice(start, text.indexOf('end $$;', start) + 7).replaceAll('\r', '')
  }
  assert.equal(definition(hotfix), definition(await read('crm_kanban_estrutura.sql')))
  assert.equal(definition(hotfix), definition(await read('crm_kanban_funil_cadencias.sql')))
  const before = await current()
  const retro = await send('A1', dates.old)
  let after = await current()
  assert.deepEqual(after.checklist, before.checklist)
  assert.equal(after.stage, before.stage)
  assert.equal(after.owner_id, before.owner_id)
  assert.deepEqual(after.next_action_at, before.next_action_at)
  const events = (await db.query('select * from public.crm_kanban_events where contact_id=$1', [c.id])).rows
  assert.ok(!events.some(e => e.event_type === 'cadence_completed' && e.payload.activity_id === retro))
  assert.ok(events.some(e => e.event_type === 'activity' && e.payload.activity_id === retro && e.payload.retroactive_cadence.code === 'A1'))
  const valid = await send('A1', dates.recent)
  after = await current()
  assert.ok(Object.keys(after.checklist).some(k => k.startsWith('cadence:') && k.endsWith(':A1')))
  await send('A1', dates.old)
  assert.deepEqual((await current()).last_outreach_at, after.last_outreach_at, 'Old contact cannot move the latest interaction clock backwards')
  await assert.rejects(() => send('A1', dates.recent), /ja foi registrada/)
  await rpc('crm_kanban_activity_v2', [c.id, 'Reply', 'whatsapp', dates.recent, null, 'inbound', null, null])
  const paused = await current()
  await send('A2', dates.old)
  assert.deepEqual((await current()).checklist, paused.checklist)
  await assert.rejects(() => send('A2', dates.recent), /pausada/)
  await assert.rejects(() => send('A2', dates.old, dates.old), e => e.code === 'PT409')
  await assert.rejects(() => send('N1', dates.old), e => e.code === 'PT409')
  await assert.rejects(() => send('A2', dates.future), /ja realizado/)
  await actor(2)
  await assert.rejects(() => send('A2', dates.old), e => e.code === '42501')
  await actor(1)
  await db.query("update public.crm_kanban_contacts set stage='negociacao' where id=$1", [c.id])
  await assert.rejects(() => send('A2', dates.old), e => e.code === 'PT409')
  assert.ok(valid)
  console.log('PASS: reproduced old guard; retroactive contacts retained without completing cadence; normal cadence, pause, duplicates, stale phase, future dates, permissions, clocks, audit, idempotence and fresh/upgrade parity preserved. Local database only.')
} finally {
  await db.close()
}
