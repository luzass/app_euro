import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8')
const core = text => { const start = text.indexOf('create or replace function public.crm_kanban_detail_section('); return text.slice(start, text.indexOf('end $$;', start) + 7).replaceAll('\r', '') }
const actor = async (n, role = 'authenticated') => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [n ? uid(n) : '', role])
  await db.exec('set role ' + role)
}
const page = async (id, section, cursor = null) => (await db.query('select public.crm_kanban_detail_section($1,$2,$3) result', [uid(id), section, cursor])).rows[0].result
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const [n, role] of [[1, 'admin'], [2, 'captacao'], [3, 'funcionario'], [4, 'reitoria'], [5, 'captacao_gerente'], [6, 'spike']]) await db.query('insert into public.profiles values($1,$2,$3)', [uid(n), 'Member ' + n, role])
  const base = await read('crm_kanban_estrutura.sql'), migration = await read('crm_kanban_ficha_por_aba.sql')
  assert.equal(core(base), core(migration))
  await db.exec(base)
  await db.exec(migration)
  await db.exec(migration)
  for (const [id, owner] of [[100, 2], [101, 3], [102, null]]) await db.query('insert into public.crm_kanban_contacts(id,cpf,owner_id,source_data,manual_data) values($1,$2,$3,$4,$5)', [uid(id), String(id).padStart(11, '0'), owner ? uid(owner) : null, { nome: 'Candidate ' + id, private_raw: 'RAW_COPY' }, { nome: 'Manual name' }])
  for (const id of [100, 101]) {
    await db.query("insert into public.crm_kanban_activities(id,contact_id,author_id,note,channel,occurred_at,direction) select ('00000000-0000-0000-0000-'||lpad(($3::int+n)::text,12,'0'))::uuid,$1,$2,'note-'||n,'whatsapp','2020-01-01T12:00:00Z'::timestamptz+(n%3)*interval '1 second','outbound' from generate_series(1,123)n", [uid(id), uid(2), id * 1000])
    await db.query("insert into public.crm_kanban_events(contact_id,event_type,payload,created_at,actor_id) select $1,'stage',jsonb_build_object('from','abordagem','to','negociacao'),'2020-01-01T12:00:00Z',$2 from generate_series(1,123)n", [uid(id), uid(2)])
    await db.query("insert into public.crm_kanban_sources(source,source_key,contact_id,source_date,is_test,payload,payload_hash,canonical_data) select 'leads_cursos',$2||'-'||n,$1,'2020-01-01'::date+(n%3),false,jsonb_build_object('original',n),'hash',jsonb_build_object('extra','CANONICAL_COPY') from generate_series(1,23)n", [uid(id), String(id)])
  }
  const originals = {}
  for (const [section, table, order] of [['events', 'crm_kanban_events', 'id desc'], ['activities', 'crm_kanban_activities', 'occurred_at desc,id desc'], ['sources', 'crm_kanban_sources', 'source_date desc,source,source_key']]) originals[section] = (await db.query(`select * from public.${table} where contact_id=$1 order by ${order}`, [uid(100)])).rows
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(1)])
  const legacy = (await db.query('select public.crm_kanban_detail($1,null) result', [uid(100)])).rows[0].result
  const counts = (await db.query('select (select count(*) from crm_kanban_contacts)c,(select count(*) from crm_kanban_events)e,(select count(*) from crm_kanban_activities)a,(select count(*) from crm_kanban_sources)s')).rows
  await actor(2)
  const contact = await page(100, 'contact')
  assert.equal(contact.items.length, 0); assert.equal(contact.next_cursor, null); assert.deepEqual(contact.visited_stages, [])
  assert.ok(!('manual_data' in contact.contact)); assert.ok(!('source_data' in contact.contact))
  assert.equal(contact.contact.current_data.nome, 'Manual name')
  for (const section of ['events', 'activities', 'sources']) {
    let cursor = null, all = [], loops = 0
    do {
      const response = await page(100, section, cursor)
      assert.ok(response.items.length <= (section === 'sources' ? 10 : 50))
      assert.equal(response.section, section)
      assert.ok(response.items.every(item => !item.contact_id || item.contact_id === uid(100)))
      if (section === 'events') assert.deepEqual([...response.visited_stages].sort(), [...legacy.visited_stages].sort())
      else assert.deepEqual(response.visited_stages, [])
      if (section === 'sources') assert.ok(response.items.every(item => !('canonical_data' in item) && !('payload_hash' in item)))
      all.push(...response.items); cursor = response.next_cursor
      assert.ok(++loops < 10)
    } while (cursor)
    const key = item => section === 'sources' ? item.source + '|' + item.source_key : item.id
    assert.deepEqual(all.map(key), originals[section].map(key), section + ': no repeats, omissions or tie reordering')
    assert.equal(new Set(all.map(key)).size, all.length)
  }
  for (const section of ['contact', 'events', 'activities', 'sources']) await assert.rejects(() => page(101, section), e => e.code === '42501')
  const foreignCursor = (await page(100, 'activities')).next_cursor
  await assert.rejects(() => page(101, 'activities', foreignCursor), e => e.code === '42501')
  for (const section of ['contact', 'events', 'activities', 'sources']) assert.equal((await page(102, section)).items.length, 0)
  for (const section of ['wrong', null]) await assert.rejects(() => page(100, section), e => e.code === '22023')
  for (const [section, cursor] of [['contact', {}], ['events', {}], ['activities', { id: uid(1) }], ['sources', { date: null, source: 'x', key: 'y' }]]) await assert.rejects(() => page(100, section, cursor), e => e.code === '22023')
  await assert.rejects(() => page(999, 'contact'), e => e.code === '42501')
  for (const n of [1, 4, 5]) { await actor(n); assert.equal((await page(101, 'contact')).contact.id, uid(101)) }
  await actor(6); await assert.rejects(() => page(100, 'contact'), e => e.code === '42501')
  await actor(null, 'anon'); await assert.rejects(() => page(102, 'contact'), e => e.code === '42501')
  await db.exec('reset role')
  assert.deepEqual((await db.query('select (select count(*) from crm_kanban_contacts)c,(select count(*) from crm_kanban_events)e,(select count(*) from crm_kanban_activities)a,(select count(*) from crm_kanban_sources)s')).rows, counts)
  await actor(1)
  assert.deepEqual((await db.query('select public.crm_kanban_detail($1,null) result', [uid(100)])).rows[0].result, legacy)
  console.log('PASS: detail sections paginate 123 activities, 123 events and 23 sources without omissions/tie duplicates; contact-only response, raw source fields, visited stages, empty lists, owner/manager/anonymous permissions, forged cursors, invalid requests, repeatability, unchanged data and legacy RPC preserved.')
} finally { await db.close() }
