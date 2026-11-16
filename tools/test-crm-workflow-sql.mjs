import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function actor(n) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(n)])
}
async function rpc(name, args = []) {
  return (
    await db.query(
      `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) result`,
      args,
    )
  ).rows[0].result
}
async function get(id) {
  return (
    await db.query('select to_jsonb(c) result from public.crm_kanban_contacts c where id=$1', [id])
  ).rows[0].result
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const n of [1, 2])
    await db.query("insert into public.profiles values($1,$2,'captacao')", [
      uid(n),
      'Vendedor ' + n,
    ])
  await db.exec(await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8'))
  await actor(1)
  let lead = await rpc('crm_kanban_create', ['12345678901', { nome: 'Lead teste' }, null])
  lead = await rpc('crm_kanban_save', [lead.id, { stage: 'abordagem' }, lead.version])
  await db.query(
    "update public.crm_kanban_contacts set stage_entered_at=now()-interval '6 days' where id=$1",
    [lead.id],
  )
  lead = await get(lead.id)
  const anchor = lead.stage_entered_at
  const moment = (await db.query("select (now()-interval '4 days')::text t")).rows[0].t
  const send = (code, when = moment) =>
    rpc('crm_kanban_activity_v2', [
      lead.id,
      'Envio ' + code,
      'whatsapp',
      when,
      null,
      'outbound',
      code,
      anchor,
    ])
  await actor(2)
  await assert.rejects(() => send('A1'), /Atendimento nao permitido/)
  await actor(1)
  const a1 = await send('A1')
  await assert.rejects(() => send('A1'), /ja foi registrada/)
  let current = await get(lead.id)
  const oldClock = current.last_interaction_at
  await rpc('crm_kanban_activity_v2', [
    lead.id,
    'Anotação interna',
    'outro',
    new Date().toISOString(),
    null,
    'note',
    null,
    null,
  ])
  current = await get(lead.id)
  assert.equal(current.last_interaction_at, oldClock, 'Internal notes cannot count as conversation')
  assert.equal(current.last_response_at, null)
  assert.ok(current.last_outreach_at)
  const taskKey = Object.keys(current.checklist).find((k) => k.startsWith('cadence:'))
  await assert.rejects(
    () =>
      rpc('crm_kanban_save', [
        lead.id,
        { checklist: { ...current.checklist, [taskKey]: false } },
        current.version,
      ]),
    /Cadencias exigem/,
  )
  const incoming = (await db.query("select (now()-interval '2 days')::text t")).rows[0].t
  await rpc('crm_kanban_activity_v2', [
    lead.id,
    'Candidato respondeu',
    'whatsapp',
    incoming,
    null,
    'inbound',
    null,
    null,
  ])
  current = await get(lead.id)
  assert.ok(current.last_response_at)
  assert.ok(Object.keys(current.checklist).some((k) => k.startsWith('cadence-paused:')))
  await assert.rejects(() => send('A2'), /pausada/)
  current = await rpc('crm_kanban_resume_cadence', [lead.id, current.version])
  assert.equal(current.checklist[taskKey], true)
  const recent = (await db.query("select (now()-interval '1 hour')::text t")).rows[0].t
  current = await rpc('crm_kanban_save', [lead.id, { next_action_at: incoming }, current.version])
  const a2 = await send('A2', recent)
  assert.equal(
    (await get(lead.id)).next_action_at,
    null,
    'An outreach after the scheduled time completes the callback',
  )
  await assert.rejects(
    () =>
      rpc('crm_kanban_activity_v2', [
        lead.id,
        'Reclassificar',
        'outro',
        recent,
        a2,
        'note',
        null,
        null,
      ]),
    /nao pode virar/,
  )
  await rpc('crm_kanban_activity_v2', [
    lead.id,
    'Corrigir texto do envio',
    'whatsapp',
    recent,
    a2,
    'outbound',
    null,
    null,
  ])
  const clock = (await get(lead.id)).last_outreach_at
  current = await rpc('crm_kanban_save', [
    lead.id,
    { manual_data: { primeira_graduacao: 'Sim', via_ingresso_opcao: 'ENEM' } },
    (await get(lead.id)).version,
  ])
  assert.equal(current.last_outreach_at, clock, 'Qualification is not a sent message')
  current = await rpc('crm_kanban_save', [lead.id, { stage: 'negociacao' }, current.version])
  await assert.rejects(() => send('A3', recent), /desatualizada/)
  assert.ok(
    (await rpc('crm_kanban_detail', [lead.id, null])).events.some(
      (e) => e.event_type === 'cadence_completed' && e.payload.activity_id === a1,
    ),
  )
  await rpc('crm_kanban_import', [
    'inscritos_20271',
    'key1',
    {
      cpf: '12345678901',
      candidato: 'Inscrito teste',
      curso: 'DIREITO',
      etapa_atual: 'INSCRITO PARA SELEÇÃO',
      forma_de_ingresso: 'ENEM',
      boleto_de_matricula: 'EM ABERTO',
    },
    '2026-11-13',
    false,
  ])
  current = await get(lead.id)
  assert.equal(current.stage, 'inscrito', 'A real inscription skips lead-only stages')
  await assert.rejects(
    () => rpc('crm_kanban_save', [lead.id, { stage: 'vestibular' }, current.version]),
    /ENEM nao exige/,
  )
  assert.equal(current.last_outreach_at, clock)
  await rpc('crm_kanban_import', [
    'inscritos_20271',
    'key1',
    {
      cpf: '12345678901',
      candidato: 'Inscrito teste',
      curso: 'DIREITO',
      etapa_atual: 'APROVADO. MATRÍCULA LIBERADA',
      forma_de_ingresso: 'ENEM',
      boleto_de_matricula: 'EM ABERTO',
      idlan: '123',
    },
    '2026-11-13',
    false,
  ])
  current = await get(lead.id)
  assert.equal(current.stage, 'aguardando_matricula')
  assert.equal(current.current_data.matricula_idlan, '123')
  assert.equal(
    current.official_enrollment,
    false,
    'Approval and an issued bill are not matriculation',
  )
  await rpc('crm_kanban_import', [
    'matriculados_20271',
    'ra1',
    { cpf: '12345678901', aluno: 'Aluno teste', curso: 'DIREITO', contrato: 'ATIVO' },
    '2026-11-13',
    false,
  ])
  current = await get(lead.id)
  assert.equal(current.stage, 'matriculado')
  assert.equal(current.official_enrollment, true)
  const stageTime = current.stage_entered_at
  await rpc('crm_kanban_import', [
    'inscritos_20271',
    'fresh-key',
    {
      cpf: '22345678901',
      candidato: 'Inscrito sem lead anterior',
      curso: 'DIREITO',
      etapa_atual: 'INSCRITO PARA SELEÇÃO',
    },
    '2026-11-13',
    false,
  ])
  const fresh = (
    await db.query("select id from public.crm_kanban_contacts where cpf='22345678901'")
  ).rows[0].id
  let freshDetail = await rpc('crm_kanban_detail', [fresh, null])
  assert.equal(freshDetail.contact.stage, 'inscrito')
  assert.equal(
    freshDetail.visited_stages.includes('primeiro_contato'),
    false,
    'A source-only inscription must not invent lead-stage attendance',
  )
  await db.query("update public.crm_kanban_contacts set stage='primeiro_contato' where id=$1", [
    fresh,
  ])
  await db.query(
    "update public.crm_kanban_events set payload=jsonb_set(payload,'{stage}','\"primeiro_contato\"') where contact_id=$1 and event_type='created'",
    [fresh],
  )
  await db.exec('alter table public.crm_kanban_config drop column workflow_version')
  const migration = await readFile(
    new URL('../sql/crm_kanban_funil_cadencias.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration)
  freshDetail = await rpc('crm_kanban_detail', [fresh, null])
  assert.equal(freshDetail.contact.stage, 'inscrito')
  assert.equal(
    freshDetail.visited_stages.includes('primeiro_contato'),
    false,
    'The legacy migration does not mislabel a generated initial phase as an attended lead stage',
  )
  assert.equal(
    (await get(lead.id)).stage_entered_at,
    stageTime,
    'Reapplying a migration does not restart the journey',
  )
  assert.equal(
    Number((await db.query('select count(*) n from public.crm_kanban_contacts')).rows[0].n),
    2,
  )
  await db.exec('set role anon')
  await assert.rejects(
    () => rpc('crm_kanban_activity_v2', [lead.id, 'x', 'outro', recent, null, 'note', null, null]),
    /permission denied/,
  )
  console.log(
    'CRM SQL jornada: cadencia auditada, envio unico, pausas, resposta x nota, permissoes, etapas por fonte e migracao sem duplicar verificados.',
  )
} finally {
  await db.close()
}
