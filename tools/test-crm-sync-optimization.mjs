import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const cpf = n => String(11100000000n + BigInt(n))
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8')
const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result
const actor = (n, role = 'authenticated') => db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [n ? uid(n) : '', role])
const contacts = async () => (await db.query('select to_jsonb(c) d from public.crm_kanban_contacts c order by id')).rows.map(r => r.d)
const contact = async n => (await db.query('select to_jsonb(c) d from public.crm_kanban_contacts c where cpf=$1', [cpf(n)])).rows[0]?.d
const calls = async () => Number((await db.query('select count(*) n from public.audit_sync_imports')).rows[0].n)
const events = async () => (await db.query('select to_jsonb(e) d from public.crm_kanban_events e order by id')).rows.map(r => r.d)
const sources = async () => (await db.query('select to_jsonb(s) d from public.crm_kanban_sources s order by source,source_key')).rows.map(r => r.d)
const metadata = async () => (await db.query("select oid,proowner,proacl,prosecdef,proconfig from pg_proc where proname in ('crm_kanban_sync','crm_kanban_refresh_intake_scope') order by proname")).rows
const definition = (text, name) => {
  const start = text.indexOf('create or replace function public.' + name + '(')
  assert.ok(start >= 0)
  return text.slice(start, text.indexOf('end $$;', start) + 7).replaceAll('\r', '')
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table public.profiles(id uuid primary key,nome text,role text);
    create table public.inscritos_20271(id integer primary key,chave_inscricao text,cpf text,candidato text,curso text,data_inscricao text);
    create table public.leads_cursos(id integer primary key,cpf text,nome text,curso text,created_at timestamptz,vendedor_crm text);
    create table public.matriculados_20271(id integer primary key,chave_unica text,cpf text,curso text,contrato text,periodo_letivo text,data_de_matricula text);`)
  await db.query("insert into public.profiles values($1,'Admin','admin'),($2,'Seller','captacao')", [uid(1), uid(2)])
  const base = await read('crm_kanban_estrutura.sql')
  const migration = await read('crm_kanban_otimizar_sincronizacao.sql')
  const intake = await read('crm_kanban_recorte_20261115.sql')
  for (const name of ['crm_kanban_sync', 'crm_kanban_refresh_intake_scope']) {
    assert.equal(definition(base, name), definition(migration, name))
    assert.equal(definition(base, name), definition(intake, name))
  }
  assert.ok(!definition(base, 'crm_kanban_refresh_intake_scope').includes('perform 1 from public.crm_kanban_contacts'))
  await db.exec(base)
  const beforeMetadata = await metadata()
  await db.exec(migration)
  await db.exec(migration)
  assert.deepEqual(await metadata(), beforeMetadata, 'Migration preserves function identity and permissions')
  await actor(1)
  for (let n = 1; n <= 20; n++) await db.query('insert into public.inscritos_20271 values($1,$2,$3,$4,$5,$6)', [n, 'key-' + n, cpf(n), 'Person ' + n, n === 20 ? 'MEDICINA' : 'DIREITO', n === 2 ? null : '01/10/2026'])
  await db.query("insert into public.leads_cursos values(1,$1,'Lead same CPF','DIREITO','2026-11-16T12:00:00Z','Seller'),(2,$2,'Old lead','DIREITO','2026-10-01T12:00:00Z',null),(3,'0','Invalid CPF','DIREITO','2026-11-16T12:00:00Z',null)", [cpf(1), cpf(30)])
  await db.query("insert into public.matriculados_20271 values(1,'ra-1',$1,'DIREITO','ATIVO','2027.1','16/11/2026'),(2,'ra-99',$2,'DIREITO','ATIVO','2027.1','16/11/2026'),(3,'old-period',$1,'DIREITO','ATIVO','2026.2','16/11/2026')", [cpf(1), cpf(99)])
  await db.exec(`create table public.audit_sync_imports(source text,source_key text);
    alter function public.crm_kanban_import(text,text,jsonb,date,boolean) rename to audit_original_import;
    create function public.crm_kanban_import(p_source text,p_key text,p_raw jsonb,p_date date,p_test boolean) returns boolean language plpgsql as $$begin
      insert into public.audit_sync_imports values(p_source,p_key);
      return public.audit_original_import(p_source,p_key,p_raw,p_date,p_test);
    end$$;`)
  const first = await rpc('crm_kanban_sync')
  assert.equal(first.conflicts, 0)
  assert.equal(first.invalid, 1)
  assert.equal((await contacts()).length, 19)
  assert.equal(await contact(20), undefined, 'No Medicine card')
  assert.equal(await contact(99), undefined, 'Enrollment alone cannot create a card')
  assert.equal((await contact(1)).official_enrollment, true)
  assert.equal((await db.query("select source_date_inferred from public.crm_kanban_sources where source_key='key-2'")).rows[0].source_date_inferred, true)
  let c = await contact(1)
  await rpc('crm_kanban_save', [c.id, { owner_id: uid(2), manual_data: { observacao: 'Keep manual note' } }, c.version])
  const stable = { contacts: await contacts(), sources: await sources(), events: await events() }
  await db.exec('truncate public.audit_sync_imports')
  const noop = await rpc('crm_kanban_sync')
  assert.equal(noop.updated, 0)
  assert.equal(noop.unchanged, 21)
  assert.equal(await calls(), 0, 'No import/advisory-per-CPF work for identical source snapshots, including enrollments')
  assert.deepEqual(await contacts(), stable.contacts)
  assert.deepEqual(await sources(), stable.sources)
  assert.deepEqual(await events(), stable.events)
  await db.query("update public.inscritos_20271 set candidato='Corrected retroactively' where id=1")
  await db.exec('truncate public.audit_sync_imports')
  const change = await rpc('crm_kanban_sync')
  assert.equal(change.updated, 1)
  assert.equal(await calls(), 1)
  c = await contact(1)
  assert.equal(c.owner_id, uid(2))
  assert.equal(c.current_data.observacao, 'Keep manual note')
  await db.query("update public.matriculados_20271 set contrato='CANCELADO' where id=1")
  await db.exec('truncate public.audit_sync_imports')
  await rpc('crm_kanban_sync')
  assert.equal(await calls(), 1)
  assert.equal((await contact(1)).official_enrollment, false)
  // Changing the date/cutoff metadata must not be hidden by an equal payload hash.
  await db.exec("update public.crm_kanban_config set cutoff='2026-11-16'")
  await db.exec('truncate public.audit_sync_imports')
  await rpc('crm_kanban_sync')
  assert.equal(await calls(), 1)
  assert.equal((await db.query("select source_date::text as d from public.crm_kanban_sources where source_key='key-2'")).rows[0].d, '2026-11-16')
  // Repeated source keys retain all import attempts, including the previous equal snapshot.
  await db.query("insert into public.inscritos_20271 select 100,chave_inscricao,cpf,'Duplicate variant',curso,data_inscricao from public.inscritos_20271 where id=3")
  await db.exec('truncate public.audit_sync_imports')
  await rpc('crm_kanban_sync')
  assert.equal(await calls(), 2)
  assert.equal((await db.query("select count(*) n from public.audit_sync_imports where source_key='key-3'")).rows[0].n, 2)
  await db.exec('delete from public.inscritos_20271 where id=100')
  await rpc('crm_kanban_sync')
  // A source key moving to a different CPF is still a conflict, never silently skipped.
  await db.query('update public.inscritos_20271 set cpf=$1 where id=4', [cpf(400)])
  await db.exec('truncate public.audit_sync_imports')
  const conflict = await rpc('crm_kanban_sync')
  assert.equal(conflict.conflicts, 1)
  assert.equal(await contact(400), undefined)
  assert.ok(await contact(4))
  await db.query('update public.inscritos_20271 set cpf=$1 where id=4', [cpf(4)])
  await actor(2)
  await assert.rejects(() => rpc('crm_kanban_sync'), e => e.code === '42501')
  await actor(1)
  const oldRaw = (await db.query('select to_jsonb(l) d from public.leads_cursos l where id=2')).rows[0].d
  await rpc('audit_original_import', ['leads_cursos', '2', oldRaw, '2026-10-01', true])
  const oldContact = await contact(30)
  await rpc('crm_kanban_sync')
  assert.equal((await contact(30)).intake_visible, false)
  assert.equal((await contact(30)).id, oldContact.id)
  await rpc('crm_kanban_create', [cpf(30), { nome: 'Manual return' }, uid(2)])
  await rpc('crm_kanban_sync')
  assert.equal((await contact(30)).intake_visible, true)
  assert.equal((await contact(30)).owner_id, uid(2))
  await db.exec('drop table public.leads_cursos')
  const missing = await rpc('crm_kanban_sync')
  assert.ok(missing.missing_sources.includes('leads_cursos'))
  assert.equal((await contact(1)).intake_visible, true)
  await actor(null, 'service_role')
  await rpc('crm_kanban_sync')
  const beforeReapply = { contacts: await contacts(), sources: await sources(), events: await events() }
  await db.exec(migration)
  assert.deepEqual({ contacts: await contacts(), sources: await sources(), events: await events() }, beforeReapply)
  const verification = await db.exec(await read('crm_kanban_conferir_sincronizacao.sql'))
  assert.equal(verification[0].rows[0].resultado.updated, 0)
  assert.ok(Number(verification[0].rows[0].duracao_ms) >= 0)
  await db.exec(await read('crm_kanban_reverter_otimizacao_sincronizacao.sql'))
  assert.deepEqual({ contacts: await contacts(), sources: await sources(), events: await events() }, beforeReapply)
  await db.exec('truncate public.audit_sync_imports')
  await rpc('crm_kanban_sync')
  assert.equal(await calls(), 20, 'Rollback restores the previous import path without reverting other CRM fixes')
  await db.exec(migration)
  await db.exec('truncate public.audit_sync_imports')
  await rpc('crm_kanban_sync')
  assert.equal(await calls(), 0)
  assert.deepEqual(await metadata(), beforeMetadata)
  console.log('PASS: zero import calls for unchanged snapshots; selective source/enrollment updates; metadata, duplicates, CPF conflicts, Medicine, scope, manual data, seller, history, permissions, missing sources and migration identity/idempotence preserved. Synthetic single-connection database; not a production RAM or concurrency benchmark.')
} finally {
  await db.close()
}
