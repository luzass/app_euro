import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const sql = await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8')
const db = new PGlite()
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const cpf = (n) => String(n).padStart(11, '0')
async function actor(id, role = 'authenticated') {
  await db.exec('reset role')
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [id ? uid(id) : '', role],
  )
  if (role === 'authenticated' || role === 'anon') await db.exec(`set role ${role}`)
}
async function rpc(name, args = []) {
  return (
    await db.query(
      `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) as value`,
      args,
    )
  ).rows[0].value
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated,anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create table public.profiles(id uuid primary key,nome text,role text);
    create table public.leads_cursos(id int primary key,cpf text,nome text,telefone text,curso text,campus text,turno text,created_at timestamptz,vendedor_crm text);
    create table public.inscritos_20271(id int primary key,chave_inscricao text,cpf text,candidato text,curso text,campus text,turno text,contato_2 text,data_inscricao text,ano_semestre text);
    create table public.matriculados_20271(id int primary key,chave_unica text,cpf text,aluno text,curso text,filial text,turno text,contrato text,periodo_letivo text,data_baixa_do_pagamento text);
  `)
  for (const [id, nome, role] of [
    [1, 'Admin', 'admin'],
    [2, 'William', 'captacao'],
    [3, 'Jordana', 'funcionario'],
    [4, 'Gestor', 'captacao_gerente'],
    [5, 'Spike', 'spike'],
  ])
    await db.query('insert into public.profiles values($1,$2,$3)', [uid(id), nome, role])
  await db.exec(sql)
  await db.exec("update public.crm_kanban_config set cutoff='2026-11-13',include_history=true")
  const personaMigration = await readFile(
    new URL('../sql/crm_kanban_otimizar_persona.sql', import.meta.url),
    'utf8',
  )
  await db.exec(personaMigration)
  await db.exec(personaMigration)
  for (let i = 1; i <= 250; i++)
    await db.query('insert into public.leads_cursos values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
      i,
      cpf(i),
      'Contato ' + i,
      '61900000000',
      'DIREITO',
      'Asa Sul',
      'NOTURNO',
      '2026-10-20T12:00:00Z',
      i === 1 ? 'William' : null,
    ])
  await db.query('insert into public.leads_cursos values(999,$1,$2,$3,$4,$5,$6,$7,null)', [
    cpf(999),
    'Contato novo',
    '61900000001',
    'DIREITO',
    'Asa Sul',
    'NOTURNO',
    '2026-11-13T12:00:00Z',
  ])
  for (const [id, candidate, course] of [
    [1, 999, 'FARMÁCIA'],
    [2, 888, 'MEDICINA'],
  ])
    await db.query('insert into public.inscritos_20271 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
      id,
      '2|541|' + id,
      cpf(candidate),
      'Inscrito ' + candidate,
      course,
      'Águas Claras',
      'NOTURNO',
      '61900000002',
      '13/11/2026',
      '2027.1',
    ])
  await actor(1)
  const first = await rpc('crm_kanban_sync')
  assert.equal(first.conflicts, 0)
  await actor(null, '')
  assert.equal(
    Number((await db.query('select count(*) as n from public.crm_kanban_contacts')).rows[0].n),
    201,
  )
  assert.equal(
    Number(
      (await db.query('select count(distinct position) as n from public.crm_kanban_contacts'))
        .rows[0].n,
    ),
    201,
    'Imported contacts need distinct initial ranks to support same-column ordering',
  )
  assert.equal(
    Number(
      (await db.query('select count(*) as n from public.crm_kanban_contacts where test_only'))
        .rows[0].n,
    ),
    200,
  )
  assert.equal(
    Number(
      (
        await db.query('select count(*) as n from public.crm_kanban_contacts where cpf=$1', [
          cpf(888),
        ])
      ).rows[0].n,
    ),
    0,
  )
  let c = (await db.query('select * from public.crm_kanban_contacts where cpf=$1', [cpf(999)]))
    .rows[0]
  assert.equal(c.has_inscription, true)
  assert.equal(c.current_data.curso, 'FARMÁCIA')
  const version = c.version
  await actor(1)
  assert.equal((await rpc('crm_kanban_sync')).updated, 0)
  await actor(null, '')
  assert.equal(
    (await db.query('select version from public.crm_kanban_contacts where id=$1', [c.id])).rows[0]
      .version,
    version,
  )
  await actor(2)
  await assert.rejects(
    () =>
      rpc('crm_kanban_activity', [c.id, 'Sem assumir', 'telefone', '2026-11-12T12:00:00Z', null]),
    /Atendimento nao permitido/,
  )
  c = await rpc('crm_kanban_save', [c.id, { owner_id: uid(2) }, c.version])
  assert.equal(c.owner_id, uid(2))
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { owner_id: uid(3) }, c.version]),
    /transferir/,
  )
  await assert.rejects(() => rpc('crm_kanban_sync'), /gestores/)
  await actor(3)
  assert.equal(
    Number(
      (await db.query('select count(*) as n from public.crm_kanban_contacts where id=$1', [c.id]))
        .rows[0].n,
    ),
    0,
  )
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { owner_id: uid(3) }, c.version]),
    /indisponivel/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_create', [cpf(999), { nome: 'Duplicado' }, uid(3)]),
    /ja possui atendimento/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_create', ['123', { nome: 'CPF incompleto' }, null]),
    /CPF obrigatorio/,
  )
  await actor(2)
  c = await rpc('crm_kanban_save', [
    c.id,
    { stage: 'negociacao', manual_data: { telefone: '61911111111' } },
    c.version,
  ])
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { stage: 'abordagem' }, c.version - 1]),
    /atualizado/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { stage: 'abordagem' }, null]),
    /atualizado/,
  )
  await assert.rejects(
    () => db.query('update public.crm_kanban_contacts set owner_id=$1 where id=$2', [uid(3), c.id]),
    /permission denied/,
  )
  const activity = await rpc('crm_kanban_activity', [
    c.id,
    'Contato realizado',
    'telefone',
    '2026-11-12T12:00:00Z',
    null,
  ])
  await rpc('crm_kanban_activity', [
    c.id,
    'Contato corrigido',
    'whatsapp',
    '2026-11-11T12:00:00Z',
    activity,
  ])
  const detail = await rpc('crm_kanban_detail', [c.id, null])
  assert.equal(detail.activities.length, 1)
  assert.equal(detail.activities[0].note, 'Contato corrigido')
  assert.equal(detail.events.filter((e) => e.event_type === 'activity').length, 2)
  assert.ok(detail.events.some((e) => e.event_type === 'stage' && e.payload.to === 'negociacao'))
  assert.ok(
    detail.visited_stages.includes('primeiro_contato') &&
      detail.visited_stages.includes('negociacao'),
  )
  await actor(null, '')
  await db.exec("update public.inscritos_20271 set contato_2='61922222222' where id=1")
  await actor(1)
  await rpc('crm_kanban_sync')
  const refreshed = (await rpc('crm_kanban_detail', [c.id, null])).contact
  assert.equal(refreshed.owner_id, uid(2))
  assert.equal(refreshed.current_data.telefone, '61911111111')
  assert.equal(refreshed.source_data.telefone, '61922222222')
  assert.equal(refreshed.stage, 'negociacao')
  await actor(null, '')
  await db.query(
    "insert into public.matriculados_20271 values(1,'20271|RA1',$1,'Aluno oficial','FARMÁCIA','Águas Claras','NOTURNO','ATIVO','2027.1','13/11/2026')",
    [cpf(999)],
  )
  await actor(1)
  await rpc('crm_kanban_sync')
  let official = (await rpc('crm_kanban_detail', [c.id, null])).contact
  assert.equal(official.stage, 'matriculado')
  assert.equal(official.official_enrollment, true)
  assert.equal(official.owner_id, uid(2))
  await actor(null, '')
  await db.exec("update public.matriculados_20271 set contrato='CANCELADO' where id=1")
  await db.query('update public.inscritos_20271 set cpf=$1 where id=1', [cpf(777)])
  await actor(1)
  const conflict = await rpc('crm_kanban_sync')
  assert.equal(conflict.conflicts, 1)
  assert.match(conflict.conflict_details[0].reason, /mudou de CPF/)
  official = (await rpc('crm_kanban_detail', [c.id, null])).contact
  assert.equal(official.official_enrollment, false)
  assert.equal(
    official.stage,
    'matriculado',
    'Source cancellation must not invent a backwards stage transition',
  )
  await actor(2)
  const sellerWorkspace = await rpc('crm_kanban_workspace')
  assert.equal(Object.hasOwn(sellerWorkspace.config.last_sync_result, 'conflict_details'), false)
  await actor(null, '')
  assert.equal(
    Number(
      (
        await db.query('select count(*) as n from public.crm_kanban_contacts where cpf=$1', [
          cpf(777),
        ])
      ).rows[0].n,
    ),
    0,
  )
  await db.query('update public.inscritos_20271 set cpf=$1 where id=1', [cpf(999)])
  await actor(1)
  await rpc('crm_kanban_save', [c.id, { owner_id: uid(3) }, official.version])
  await actor(2)
  await assert.rejects(() => rpc('crm_kanban_detail', [c.id, null]), /indisponivel/)
  await actor(5)
  await assert.rejects(() => rpc('crm_kanban_workspace'), /Acesso negado/)
  await actor(99)
  await assert.rejects(
    () => rpc('crm_kanban_create', [cpf(5000), { nome: 'Sem perfil' }, null]),
    /Acesso negado/,
  )
  await actor(null, 'anon')
  await assert.rejects(
    () => rpc('crm_kanban_import', ['leads_cursos', 'x', {}, '2026-11-13', false]),
    /permission denied/,
  )
  await actor(null, '')
  await db.exec(
    `create table public.matriculados_20241(id int,cpf text,curso text,tipo_aluno text,contrato text,periodo_letivo text,idade_matricula int,filial text,turno text,tipo_de_ingresso text);`,
  )
  for (let i = 6000; i < 6025; i++)
    await db.query(
      "insert into public.matriculados_20241 values($1,$2,'DIREITO','CALOURO','ATIVO','2024.1',18,'Asa Sul','NOTURNO','VESTIBULAR')",
      [i, cpf(i)],
    )
  await actor(2)
  const persona = await rpc('crm_kanban_persona_rows')
  assert.equal(persona.rows.length, 25)
  assert.equal(persona.missing.length, 5)
  assert.equal(persona.rows[0].idade_matricula, 18)
  assert.equal(
    JSON.stringify(persona).includes(cpf(6000)),
    false,
    'Persona must not expose actual historical CPF',
  )
  assert.equal(Object.hasOwn(persona.rows[0], 'aluno'), false)
  assert.deepEqual(await rpc('crm_kanban_persona_course', ['Direito']), persona)
  assert.equal((await rpc('crm_kanban_persona_course', ['Farmácia'])).rows.length, 0)
  await rpc('crm_kanban_create', [cpf(1), { nome: 'Cadastro manual real' }, null])
  await actor(1)
  await assert.rejects(() => rpc('crm_kanban_finish_tests', ['SEM CONFIRMACAO']), /Confirmacao/)
  const cleaned = await rpc('crm_kanban_finish_tests', ['ENCERRAR TESTES 13/11/2026'])
  assert.equal(cleaned.removed_test_contacts, 199)
  await actor(null, '')
  assert.equal(
    Number((await db.query('select count(*) as n from public.crm_kanban_contacts')).rows[0].n),
    2,
  )
  assert.equal(
    Number((await db.query('select count(*) as n from public.leads_cursos')).rows[0].n),
    251,
  )
  assert.equal(
    (await db.query('select include_history from public.crm_kanban_config')).rows[0]
      .include_history,
    false,
  )
  await actor(1)
  await rpc('crm_kanban_sync')
  await actor(null, '')
  assert.equal(
    Number((await db.query('select count(*) as n from public.crm_kanban_contacts')).rows[0].n),
    2,
    'Old test contacts cannot return after cleanup',
  )
  console.log(
    'CRM SQL: amostra de 200 CPFs, deduplicacao, exclusao de Medicina, historico, responsaveis atomicos, RLS, versoes concorrentes e edicao auditada verificados.',
  )
} finally {
  await db.close()
}
