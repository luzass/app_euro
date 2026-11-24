import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create table public.profiles(id uuid primary key, nome text, role text);
    insert into public.profiles values(auth.uid(),'Audit manager','admin');
    create table public.leads_cursos(id int primary key,cpf text,nome text,curso text,created_at timestamptz);
    create table public.inscritos_20271(id int primary key,chave_inscricao text,cpf text,candidato text,curso text,data_inscricao text,data_referencia_perfil text);
    create table public.matriculados_20271(id int primary key,chave_unica text,cpf text,curso text,contrato text,periodo_letivo text);
  `)
  await db.exec(await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8'))
  await db.exec(`
    insert into public.inscritos_20271 select n,'2|532|'||n,(11100000000::bigint+n)::text,'Registration '||n,'DIREITO','16/11/2026','23/11/2026' from generate_series(1,20) n;
    insert into public.leads_cursos select n,(22200000000::bigint+n)::text,'Lead '||n,'DIREITO',case when n<=10 then '2026-11-16T12:00:00Z'::timestamptz else '2026-10-01T12:00:00Z'::timestamptz end from generate_series(1,40) n;
    create table public.audit_import_calls(source text);
    alter function public.crm_kanban_import(text,text,jsonb,date,boolean) rename to audit_original_import;
    create function public.crm_kanban_import(p_source text,p_key text,p_raw jsonb,p_date date,p_test boolean) returns boolean
      language plpgsql as $$begin
        insert into public.audit_import_calls values(p_source);
        return public.audit_original_import(p_source,p_key,p_raw,p_date,p_test);
      end$$;
  `)
  const sync = async () => (await db.query('select public.crm_kanban_sync() as result')).rows[0].result
  const first = await sync()
  assert.equal(first.updated, 30)
  await db.exec('truncate public.audit_import_calls')
  const second = await sync()
  const calls = Number((await db.query('select count(*) as n from public.audit_import_calls')).rows[0].n)
  assert.equal(second.updated, 0)
  assert.equal(second.unchanged, 30)
  assert.equal(calls, 0)
  console.log(`CONFIRMED: optimized unchanged sync invokes import ${calls} times for 30 eligible rows (30 before optimization); source contains 30 additional old leads.`)

  const before = (await db.query("select version,current_data from public.crm_kanban_contacts where cpf='11100000001'")).rows[0]
  const eventsBefore = Number((await db.query('select count(*) n from public.crm_kanban_events')).rows[0].n)
  await db.exec("update public.inscritos_20271 set data_referencia_perfil='24/11/2026' where id=1")
  const cosmetic = await sync()
  const after = (await db.query("select version,current_data from public.crm_kanban_contacts where cpf='11100000001'")).rows[0]
  const eventsAfter = Number((await db.query('select count(*) n from public.crm_kanban_events')).rows[0].n)
  assert.equal(cosmetic.updated, 1)
  assert.deepEqual(after.current_data, before.current_data)
  assert.ok(after.version > before.version)
  assert.equal(eventsAfter - eventsBefore, 1)
  console.log('CONFIRMED: changing only data_referencia_perfil adds a full source_update event and bumps the contact version without changing displayed CRM data.')

  await db.exec(`insert into public.crm_kanban_events(contact_id,event_type,payload,created_at)
    select c.id,'stage','{"from":"primeiro_contato","to":"abordagem"}'::jsonb,now()-interval '100 days'
    from public.crm_kanban_contacts c cross join generate_series(1,3) n`)
  const dates = (await db.query("select (now() at time zone 'America/Sao_Paulo')::date::text as today, ((now() at time zone 'America/Sao_Paulo')::date-1)::text as yesterday")).rows[0]
  const snapshot = (await db.query('select public.crm_kanban_bi_snapshot($1::date,$2::date,false) as result', [dates.yesterday, dates.today])).rows[0].result
  assert.equal(snapshot.events.filter(e => e.type === 'stage' && e.day < dates.yesterday).length, 0)
  console.log('CONFIRMED: optimized BI omits all 90 synthetic stage events from 100 days earlier for a one-day range; historical references remain separately preserved.')
  console.log('PASS: local synthetic functional evidence only; no Supabase access, production timings or RAM measurements.')
} finally {
  await db.close()
}
