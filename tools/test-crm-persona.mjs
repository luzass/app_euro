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
    create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
    create table public.profiles(id uuid primary key,nome text,role text);
    insert into public.profiles values(auth.uid(),'Teste','captacao');
  `)
  await db.exec(await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8'))
  for (const ps of ['20241', '20242', '20251', '20252', '20261', '20262']) {
    await db.exec(`create table public.matriculados_${ps} as
      select i id, (11100000000::bigint+i)::text cpf,
        case when i%20=0 then 'FARMÁCIA' else 'DIREITO' end curso,
        'CALOURO'::text tipo_aluno,'ATIVO'::text contrato,'${ps.slice(0, 4)}.${ps.slice(-1)}'::text periodo_letivo,
        19 idade_matricula,'Asa Sul'::text filial,'NOTURNO'::text turno,'VESTIBULAR'::text tipo_de_ingresso,
        'GRADUAÇÃO'::text nivel_de_ensino,'2005-01-01'::text data_de_nascimento,
        '${ps.slice(0, 4)}-02-01'::text data_de_matricula,
        repeat('informacao privada ',40) aluno,repeat('x',600) email
      from generate_series(1,3000) i`)
  }
  await db.exec(`insert into public.matriculados_20262
    select * from public.matriculados_20262 where id=20;
    update public.matriculados_20262 set contrato='CANCELADO' where id=40;
    update public.matriculados_20262 set tipo_aluno='VETERANO' where id=60;
    update public.matriculados_20262 set nivel_de_ensino='PÓS-GRADUAÇÃO' where id=80;`)
  const start = performance.now()
  const scoped = (await db.query("select public.crm_kanban_persona_course('Farmácia') result"))
    .rows[0].result
  const elapsed = Math.round(performance.now() - start)
  assert.equal(scoped.rows.length, 150, 'One person per course across historical periods')
  assert.deepEqual(scoped.missing, [])
  assert.ok(scoped.rows.every((row) => row.curso === 'FARMÁCIA'))
  assert.equal(
    scoped.rows.filter((row) => row.periodo_letivo === '2026.1').length,
    3,
    'Invalid latest rows use a valid earlier calouro reference',
  )
  assert.equal(scoped.rows.filter((row) => row.periodo_letivo === '2026.2').length, 147)
  assert.equal(scoped.rows.find((row) => row.periodo_letivo === '2026.1').idade_matricula, 21)
  assert.equal(JSON.stringify(scoped).includes('11100000020'), false)
  assert.equal(JSON.stringify(scoped).includes('informacao privada'), false)
  assert.ok(
    scoped.rows.every(
      (row) => !Object.hasOwn(row, 'email') && !Object.hasOwn(row, 'data_de_nascimento'),
    ),
  )
  const legacy = (await db.query('select public.crm_kanban_persona_rows() result')).rows[0].result
  assert.equal(legacy.rows.length, 3000, 'Published clients keep the full deidentified response')
  assert.equal(
    (await db.query("select public.crm_kanban_persona_course('Curso inexistente') result")).rows[0]
      .result.rows.length,
    0,
  )
  const definition = (
    await db.query(
      "select pg_get_functiondef('public.crm_kanban_persona_course(text)'::regprocedure) body",
    )
  ).rows[0].body
  assert.equal(
    definition.includes('crm_kanban_pick'),
    false,
    'No repeated scans of all JSON column names',
  )
  await db.exec('set role anon')
  await assert.rejects(
    () => db.query("select public.crm_kanban_persona_course('Direito')"),
    /permission denied/,
  )
  await db.exec("reset role; update public.profiles set role='spike'")
  await assert.rejects(
    () => db.query("select public.crm_kanban_persona_course('Direito')"),
    /Acesso negado/,
  )
  console.log(
    `Persona: 18.001 linhas historicas, recorte por curso, CPF unico, filtros, idade, privacidade e cliente antigo verificados. Consulta por curso: ${elapsed} ms no banco isolado.`,
  )
} finally {
  await db.close()
}
