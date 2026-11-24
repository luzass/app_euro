import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const read = name => readFile(new URL('../sql/' + name, import.meta.url), 'utf8')
const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result
const actor = n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? uid(n) : ''])
const metadata = async () => (await db.query("select oid,proowner,proacl,prosecdef,proconfig from pg_proc where oid='public.crm_kanban_documents(uuid)'::regprocedure")).rows[0]
const normalized = value => ({
  courses: value.courses,
  documents: value.documents,
  stats: value.stats.map(row => ({ ...row, oldest_hours: row.oldest_hours === null ? null : Math.floor(row.oldest_hours) })),
})
const functionText = text => {
  const start = text.indexOf('create or replace function public.crm_kanban_documents(')
  assert.ok(start >= 0)
  return text.slice(start, text.indexOf('end $$;', start) + 7).replaceAll('\r', '')
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const [n, role] of [[1, 'admin'], [2, 'captacao'], [3, 'captacao'], [4, 'spike']]) await db.query('insert into public.profiles values($1,$2,$3)', [uid(n), 'Profile ' + n, role])
  const base = await read('crm_kanban_estrutura.sql')
  const migration = await read('crm_kanban_otimizar_documentacao.sql')
  const rollback = await read('crm_kanban_reverter_otimizacao_documentacao.sql')
  assert.equal(functionText(base), functionText(migration))
  assert.equal(functionText(await read('crm_kanban_documentacao.sql')), functionText(migration))
  assert.ok(!functionText(migration).includes('to_jsonb(t),'))
  await db.exec(base)
  await actor(1)
  const c = await rpc('crm_kanban_create', ['12345678901', { nome: 'Document test', curso: 'Direito' }, uid(2)])
  const other = await rpc('crm_kanban_create', ['12345678902', { nome: 'Other seller', curso: 'Medicina' }, uid(3)])
  const unassigned = await rpc('crm_kanban_create', ['12345678903', { nome: 'No owner', curso: 'Direito' }, null])
  await db.exec(`create table public.leads_cursos(id integer,curso text,"CURSO" text," Curso " text,cpf text,private_text text);
    insert into public.leads_cursos select n,case when n%2=0 then 'Enfermagem' else '' end,
      case when n%3=0 then 'FARMÁCIA' else null end,'Psicologia','11122233344',repeat('PRIVATE ',2000) from generate_series(1,600) n;
    create table public.inscritos_20271(id integer,"Curso" text,private_text text);
    insert into public.inscritos_20271 select n,case when n%2=0 then 'Nutrição' else 'Não informado' end,repeat('PRIVATE ',2000) from generate_series(1,600) n;
    create table public.matriculados_20271(id integer,nome_curso text,private_text text);
    insert into public.matriculados_20271 values(1,'Column not accepted by legacy picker',repeat('PRIVATE ',2000));`)
  const times = (await db.query("select (now()-interval '10 hours')::text sent,(now()-interval '6 hours')::text received")).rows[0]
  for (const [i, person, received] of [[10, c, times.received], [11, c, null], [12, other, times.received], [13, unassigned, times.received]]) {
    await rpc('crm_kanban_document_save', [person.id, uid(i), 'Direito', 'Analysis', times.sent, received, '', '', null, null])
  }
  const before = { documents: (await db.query('select to_jsonb(d) d from public.crm_kanban_documents d order by id')).rows, events: (await db.query('select to_jsonb(e) e from public.crm_kanban_events e order by id')).rows }
  const originalMetadata = await metadata()
  await db.exec(rollback)
  const legacy = new Map()
  for (const n of [1, 2, 3]) {
    await actor(n)
    legacy.set(n, normalized(await rpc('crm_kanban_documents', [n === 3 ? other.id : c.id])))
  }
  await db.exec(migration)
  await db.exec(migration)
  assert.deepEqual(await metadata(), originalMetadata)
  for (const n of [1, 2, 3]) {
    await actor(n)
    const result = await rpc('crm_kanban_documents', [n === 3 ? other.id : c.id])
    assert.deepEqual(normalized(result), legacy.get(n), 'Course aliases, precedence, documents and role-scoped SLA match legacy')
    assert.ok(!JSON.stringify(result).includes('PRIVATE'))
    assert.ok(!result.courses.includes('Column not accepted by legacy picker'))
  }
  await actor(2)
  await assert.rejects(() => rpc('crm_kanban_documents', [other.id]), e => e.code === '42501')
  await actor(4)
  await assert.rejects(() => rpc('crm_kanban_documents', [c.id]), e => e.code === '42501')
  await actor(null)
  await assert.rejects(() => rpc('crm_kanban_documents', [c.id]), e => e.code === '42501')
  await actor(1)
  await db.exec('drop table public.inscritos_20271')
  assert.ok((await rpc('crm_kanban_documents', [c.id])).courses.includes('Medicina'))
  assert.deepEqual({ documents: (await db.query('select to_jsonb(d) d from public.crm_kanban_documents d order by id')).rows, events: (await db.query('select to_jsonb(e) e from public.crm_kanban_events e order by id')).rows }, before)
  console.log('PASS: optimized document query matches legacy aliases/precedence, missing columns/tables, documents and owner-scoped SLA; preserves ACL/OID/data/history, excludes private source fields and supports rollback/reapply. Synthetic database, no production resource measurement.')
} finally {
  await db.close()
}
