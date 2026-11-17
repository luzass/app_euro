import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function actor(n, role = 'authenticated') {
  await db.exec('reset role')
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [n ? uid(n) : '', role],
  )
  if (['authenticated', 'anon'].includes(role)) await db.exec(`set role ${role}`)
}
const snapshot = async (from = '2020-01-01', to = '2020-01-05', tests = false) =>
  (await db.query('select public.crm_kanban_bi_snapshot($1,$2,$3) result', [from, to, tests]))
    .rows[0].result
const event = async (n, type, at, payload) =>
  db.query(
    'insert into public.crm_kanban_events(contact_id,event_type,created_at,payload)values($1,$2,$3,$4)',
    [uid(n), type, at, payload],
  )
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role()returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const [n, role] of [
    [1, 'admin'],
    [2, 'captacao_gerente'],
    [3, 'captacao'],
    [4, 'funcionario'],
    [5, 'reitoria'],
    [6, 'spike'],
  ])
    await db.query('insert into public.profiles values($1,$2,$3)', [uid(n), 'Perfil ' + n, role])
  const base = await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8')
  const migration = await readFile(
    new URL('../sql/crm_kanban_gestao_bi.sql', import.meta.url),
    'utf8',
  )
  const core = (text) =>
    text
      .slice(
        text.indexOf('create or replace function public.crm_kanban_bi_snapshot'),
        text.indexOf(
          'end $$;',
          text.indexOf('create or replace function public.crm_kanban_bi_snapshot'),
        ) + 7,
      )
      .trim()
  assert.equal(
    core(base),
    core(migration),
    'Fresh installs and migration must share the same function',
  )
  await db.exec(base)
  await db.exec(migration)
  for (const [n, test] of [
    [100, false],
    [101, true],
    [102, false],
    [103, false],
  ])
    await db.query(
      "insert into public.crm_kanban_contacts(id,cpf,owner_id,test_only,source_data,created_at)values($1,$2,$3,$4,$5,'2019-12-01')",
      [
        uid(n),
        String(n).padStart(11, '0'),
        uid(3),
        test,
        {
          nome: 'Contato ' + n,
          curso: 'Direito',
          campus: 'Asa Sul',
          email: 'PRIVATE_EMAIL',
          telefone: 'PRIVATE_PHONE',
          extra: 'PRIVATE_RAW',
        },
      ],
    )
  await event(100, 'created', '2020-01-01T12:00:00Z', {
    source: 'leads_cursos',
    is_test: false,
    stage: 'primeiro_contato',
    data: { cpf: 'PRIVATE_CPF' },
  })
  await event(100, 'source_update', '2020-01-02T12:00:00Z', {
    source: 'inscritos_20271',
    source_key: 'PRIVATE_KEY',
    is_test: false,
    after: {},
  })
  for (const [at, key, status] of [
    ['2020-01-03T12:00:00Z', 'contract-A', 'ATIVO'],
    ['2020-01-04T12:00:00Z', 'contract-B', 'ATIVO'],
    ['2020-01-05T12:00:00Z', 'contract-A', 'CANCELADO'],
  ])
    await event(100, 'source_update', at, {
      source: 'matriculados_20271',
      source_key: key,
      after: { CONTRATO: status, email: 'PRIVATE_EMAIL' },
    })
  await event(101, 'created', '2019-12-01T12:00:00Z', { source: 'leads_cursos', is_test: true })
  await event(102, 'created', '2019-12-01T12:00:00Z', { source: 'leads_cursos', is_test: true })
  await event(102, 'source_update', '2020-01-03T02:30:00Z', {
    source: 'inscritos_20271',
    is_test: false,
    after: {},
  })
  await event(100, 'loss_closed', '2020-01-05T15:00:00Z', {
    id: 'loss-A',
    reason_label: 'Preço',
    note: 'PRIVATE_NOTE',
    owner_id: uid(3),
    course: 'Direito',
  })
  await db.query(
    "insert into public.crm_kanban_activities(contact_id,author_id,note,channel,direction,occurred_at)values($1,$2,'PRIVATE_ACTIVITY','whatsapp','outbound','2020-01-01T13:00:00Z')",
    [uid(100), uid(3)],
  )
  await db.exec(
    'update public.crm_kanban_config set last_sync_result=\'{"conflict_details":"PRIVATE_CONFLICT"}\'',
  )
  await actor(2)
  const data = await snapshot()
  assert.equal(data.contacts.length, 3)
  assert.ok(!data.contacts.some((c) => c.id === uid(101)))
  const converted = data.contacts.find((c) => c.id === uid(102))
  assert.equal(converted.entry_at, '2020-01-03T02:30:00+00:00')
  assert.equal(converted.entry_day, '2020-01-02', 'BRT boundary')
  assert.equal(converted.origin, 'inscritos_20271')
  assert.equal(data.contacts.find((c) => c.id === uid(103)).entry_basis, 'fallback')
  assert.equal(
    data.contacts.find((c) => c.id === uid(100)).enrolled_as_of,
    true,
    'Second active contract survives first cancellation',
  )
  assert.equal(
    (await snapshot('2020-01-01', '2020-01-02')).contacts.find((c) => c.id === uid(100))
      .enrolled_as_of,
    false,
  )
  assert.equal((await snapshot('2020-01-01', '2020-01-05', true)).contacts.length, 4)
  assert.equal(data.from_at, '2020-01-01T03:00:00+00:00')
  for (const secret of [
    'PRIVATE_EMAIL',
    'PRIVATE_PHONE',
    'PRIVATE_CPF',
    'PRIVATE_NOTE',
    'PRIVATE_ACTIVITY',
    'PRIVATE_RAW',
    'PRIVATE_KEY',
    'PRIVATE_CONFLICT',
  ])
    assert.ok(!JSON.stringify(data).includes(secret), secret + ' must not leave RPC')
  for (const n of [1, 5]) {
    await actor(n)
    assert.equal((await snapshot()).contacts.length, 3)
  }
  for (const n of [3, 4, 6]) {
    await actor(n)
    await assert.rejects(() => snapshot(), /restrita/)
  }
  await actor(null, 'anon')
  await assert.rejects(() => snapshot(), /permission denied/)
  await actor(2)
  await assert.rejects(() => snapshot('2020-02-01', '2020-01-01'), /intervalo valido/)
  await assert.rejects(() => snapshot('2099-01-01', '2099-01-02'), /intervalo valido/)
  await actor(null, 'service_role')
  await db.exec(migration)
  assert.equal((await db.query('select count(*) n from public.crm_kanban_contacts')).rows[0].n, 4)
  await db.exec(
    "insert into public.crm_kanban_contacts(cpf)select lpad(n::text,11,'0')from generate_series(10000,11010)n",
  )
  await actor(2)
  assert.equal(
    (await snapshot()).contacts.length,
    1014,
    'Scalar JSON must not truncate to 1000 contacts',
  )
  console.log(
    'CRM management SQL: permissions, BRT dates, cohorts, active contracts, privacy, >1000 rows and repeatable migration passed.',
  )
} finally {
  await db.close()
}
