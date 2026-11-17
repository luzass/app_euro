import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const cpf = (n) => String(n).padStart(11, '0')
async function actor(n, role = 'authenticated') {
  await db.exec('reset role')
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [n ? uid(n) : '', role],
  )
  if (['authenticated', 'anon'].includes(role)) await db.exec(`set role ${role}`)
}
async function rpc(name, args = []) {
  return (
    await db.query(
      `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) result`,
      args,
    )
  ).rows[0].result
}
const contact = async (n) =>
  (await db.query('select * from public.crm_kanban_contacts where cpf=$1', [cpf(n)])).rows[0]
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role()returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table public.profiles(id uuid primary key,nome text,role text);
    create table public.leads_cursos(id int primary key,cpf text,nome text,curso text,created_at timestamptz,vendedor_crm text);
    create table public.inscritos_20271(id int primary key,chave_inscricao text,cpf text,candidato text,curso text,data_inscricao text,ano_semestre text);
    create table public.matriculados_20271(id int primary key,chave_unica text,cpf text,curso text,contrato text,periodo_letivo text);`)
  for (const [n, name, role] of [
    [1, 'Admin', 'admin'],
    [2, 'Vendedor A', 'captacao'],
    [3, 'Vendedor B', 'captacao'],
    [4, 'Supervisao', 'captacao_gerente'],
  ])
    await db.query('insert into public.profiles values($1,$2,$3)', [uid(n), name, role])
  const base = await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8')
  const migration = await readFile(
    new URL('../sql/crm_kanban_recorte_20261115.sql', import.meta.url),
    'utf8',
  )
  const definition = (text, name, last = false) => {
    const start = last
      ? text.lastIndexOf('create or replace function public.' + name + '(')
      : text.indexOf('create or replace function public.' + name + '(')
    return text.slice(start, text.indexOf('end $$;', start) + 7).trim()
  }
  for (const name of [
    'crm_kanban_refresh_intake_scope',
    'crm_kanban_manual_intake_scope',
    'crm_kanban_import',
    'crm_kanban_create',
    'crm_kanban_sync',
    'crm_kanban_bi_snapshot',
  ])
    assert.equal(
      definition(base, name, true),
      definition(migration, name),
      name + ' migration must match fresh install',
    )
  await db.exec(base)
  await db.exec("update public.crm_kanban_config set cutoff='2026-11-13',include_history=true")
  const leads = [
    [11, '2026-11-14T12:00:00Z'],
    [12, '2026-11-15T02:59:59Z'],
    [13, '2026-11-15T03:00:00Z'],
    [14, '2026-11-14T15:00:00Z'],
    [15, '2026-11-16T12:00:00Z'],
    [16, '2026-11-01T12:00:00Z'],
  ]
  for (const [n, at] of leads)
    await db.query('insert into public.leads_cursos values($1,$2,$3,$4,$5,$6)', [
      n,
      cpf(n),
      'Contato ' + n,
      'DIREITO',
      at,
      'Vendedor B',
    ])
  const registrations = [
    [14, '01/09/2026', 'DIREITO', '2027.1'],
    [21, null, 'FARMÁCIA', '2027.1'],
    [22, 'inválida', 'DIREITO', '01/01/2027'],
    [23, '01/01/2027', 'DIREITO', '2027.1'],
    [24, '01/08/2026', 'MEDICINA', '2027.1'],
    [25, '01/08/2026', 'DIREITO', '2027.1'],
  ]
  for (const [n, at, course, period] of registrations)
    await db.query('insert into public.inscritos_20271 values($1,$2,$3,$4,$5,$6,$7)', [
      n,
      '2|541|' + n,
      cpf(n),
      'Inscrito ' + n,
      course,
      at,
      period,
    ])
  const oldRaw = (await db.query('select to_jsonb(i) d from public.inscritos_20271 i where id=25'))
    .rows[0].d
  const oldLead = (await db.query('select to_jsonb(l) d from public.leads_cursos l where id=11'))
    .rows[0].d
  const linkedLead = (await db.query('select to_jsonb(l) d from public.leads_cursos l where id=14'))
    .rows[0].d
  const testLead = (await db.query('select to_jsonb(l) d from public.leads_cursos l where id=16'))
    .rows[0].d
  for (const [source, key, raw, at, test] of [
    ['leads_cursos', '11', oldLead, '2026-11-14', false],
    ['leads_cursos', '14', linkedLead, '2026-11-14', false],
    ['leads_cursos', '16', testLead, '2026-11-01', true],
    ['inscritos_20271', '2|541|25', oldRaw, '2026-08-01', true],
  ])
    await rpc('crm_kanban_import', [source, key, raw, at, test])
  await db.query('update public.crm_kanban_contacts set owner_id=$1 where cpf in ($2,$3,$4)', [
    uid(2),
    cpf(11),
    cpf(14),
    cpf(25),
  ])
  const old = await contact(11)
  await db.query(
    "insert into public.crm_kanban_activities(contact_id,author_id,note,channel,direction,occurred_at)values($1,$2,'Historico preservado','telefone','outbound','2026-11-14T14:00:00Z')",
    [old.id, uid(2)],
  )
  await actor(1)
  const manual = await rpc('crm_kanban_create', [
    cpf(30),
    { nome: 'Cadastro manual', curso: 'Direito' },
    uid(2),
  ])
  await actor(null, 'service_role')
  const before = (await db.query('select count(*) n from public.crm_kanban_events')).rows[0].n
  await db.exec(migration)
  assert.equal((await contact(11)).intake_visible, false)
  assert.equal((await contact(16)).intake_visible, false)
  assert.equal(await contact(12), undefined, 'Before 00:00 in Brasilia must not enter')
  for (const n of [13, 14, 15, 21, 22, 23, 25, 30])
    assert.equal((await contact(n)).intake_visible, true, 'Expected visible CPF ' + n)
  assert.equal(await contact(24), undefined, 'Medicine exclusion preserved')
  for (const n of [11, 14, 25])
    assert.equal((await contact(n)).owner_id, uid(2), 'Existing seller preserved')
  assert.equal(
    (await contact(25)).test_only,
    false,
    'Old inscription becomes real even when payload is unchanged',
  )
  assert.equal(
    (await db.query("select is_test from public.crm_kanban_sources where source_key='2|541|25'"))
      .rows[0].is_test,
    false,
  )
  assert.equal(
    (await db.query('select count(*) n from public.crm_kanban_contacts where cpf=$1', [cpf(14)]))
      .rows[0].n,
    1,
    'Lead and inscription merged by CPF',
  )
  assert.equal(
    (
      await db.query('select count(*) n from public.crm_kanban_activities where contact_id=$1', [
        old.id,
      ])
    ).rows[0].n,
    1,
  )
  assert.ok((await db.query('select count(*) n from public.crm_kanban_events')).rows[0].n >= before)
  for (const n of [21, 22]) {
    const s = (
      await db.query('select * from public.crm_kanban_sources where source_key=$1', ['2|541|' + n])
    ).rows[0]
    assert.equal(s.source_date_inferred, true)
    assert.equal(
      s.payload.data_inscricao,
      n === 21 ? null : 'inválida',
      'Academic date is not fabricated',
    )
  }
  const stableEvents = (await db.query('select count(*) n from public.crm_kanban_events')).rows[0].n
  await db.exec(migration)
  assert.equal(
    (await db.query('select count(*) n from public.crm_kanban_events')).rows[0].n,
    stableEvents,
    'Reapplying migration is idempotent',
  )
  await actor(2)
  await assert.rejects(() => rpc('crm_kanban_refresh_intake_scope'), /permission denied/)
  await assert.rejects(() => rpc('crm_kanban_sync'), /gestores/)
  const oldVersion = (await contact(11)).version
  await assert.rejects(
    () => rpc('crm_kanban_save', [old.id, { intake_visible: true }, oldVersion]),
    /nao permitida/,
  )
  await actor(1)
  const renewed = await rpc('crm_kanban_create', [
    cpf(11),
    { nome: 'Contato retomado manualmente' },
    uid(2),
  ])
  assert.equal(
    renewed.intake_visible,
    true,
    'Explicit manual registration must become visible immediately',
  )
  await rpc('crm_kanban_sync')
  assert.equal((await contact(11)).intake_visible, true, 'Manual registration survives next sync')
  const snapshot = await rpc('crm_kanban_bi_snapshot', ['2020-01-01', '2026-11-17', false])
  assert.equal(snapshot.contacts.find((c) => c.id === manual.id).intake_visible, true)
  const testContactId = (await contact(16)).id
  assert.equal(
    snapshot.contacts.find((c) => c.id === testContactId)?.intake_visible,
    undefined,
    'Test-only contacts excluded by BI default',
  )
  await actor(null, 'service_role')
  const oldId = (await contact(16)).id
  await db.query('insert into public.inscritos_20271 values(16,$1,$2,$3,$4,$5,$6)', [
    '2|541|16',
    cpf(16),
    'Inscrito novo',
    'DIREITO',
    '01/10/2026',
    '2027.1',
  ])
  await rpc('crm_kanban_sync')
  assert.equal((await contact(16)).id, oldId)
  assert.equal(
    (await contact(16)).intake_visible,
    true,
    'Hidden lead reappears when an inscription arrives',
  )
  assert.equal((await contact(16)).test_only, false)
  await db.exec('drop table public.leads_cursos')
  const partial = await rpc('crm_kanban_sync')
  assert.ok(partial.missing_sources.includes('leads_cursos'))
  assert.equal(
    (await contact(13)).intake_visible,
    true,
    'Missing source does not erase its last known eligible snapshot',
  )
  console.log(
    'CRM intake: all inscriptions including missing dates, leads cutoff/BRT, hidden history, ownership, deduplication, promotion, manual registration, permissions and repeatability passed.',
  )
} finally {
  await db.close()
}
