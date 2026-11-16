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
async function rpc(name, args = []) {
  return (
    await db.query(
      `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) result`,
      args,
    )
  ).rows[0].result
}
async function detail(id) {
  return (await rpc('crm_kanban_detail', [id, null])).contact
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
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
  await db.exec(await readFile(new URL('../sql/crm_kanban_estrutura.sql', import.meta.url), 'utf8'))
  await actor(2)
  let workspace = await rpc('crm_kanban_workspace')
  assert.equal(workspace.loss_reasons.length, 9)
  assert.equal(workspace.config.loss_version, 1)
  let price = workspace.loss_reasons.find((r) => r.seed_key === 'price')
  const other = workspace.loss_reasons.find((r) => r.seed_key === 'other')
  const extra = await rpc('crm_kanban_reason_save', [null, 'Mudou de cidade', true, false, null])
  await assert.rejects(
    () => rpc('crm_kanban_reason_save', [null, 'SEM RESPOSTA', true, false, null]),
    /nao sao motivos/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_reason_save', [null, 'Mudou de cidade', true, false, null]),
    /Ja existe/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_reason_save', [other.id, other.name, true, false, other.version]),
    /Outro sempre exige/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_reason_save', [extra.id, 'Outra cidade', true, false, 0]),
    /atualizado/,
  )
  await actor(3)
  assert.equal(
    (await db.query('select count(*) n from public.crm_kanban_loss_reasons')).rows[0].n,
    10,
  )
  await assert.rejects(
    () => rpc('crm_kanban_reason_save', [null, 'Novo motivo', true, false, null]),
    /Somente a supervisao/,
  )
  await assert.rejects(
    () => db.exec("delete from public.crm_kanban_loss_reasons where seed_key='price'"),
    /permission denied/,
  )
  let c = await rpc('crm_kanban_create', [
    '12345678901',
    { nome: 'Contato de teste', curso: 'Direito', campus: 'Asa Sul', turno: 'NOTURNO' },
    null,
  ])
  c = await rpc('crm_kanban_save', [
    c.id,
    { stage: 'negociacao', next_action_at: '2026-11-20T12:00:00Z' },
    c.version,
  ])
  const close = (
    reason = price.id,
    evidence = 'staff_inferred',
    note = 'Mensalidade acima do orçamento relatado',
    version = c.version,
  ) => rpc('crm_kanban_close_loss', [c.id, version, reason, evidence, note])
  await actor(4)
  await assert.rejects(() => close(), /Encerramento nao permitido/)
  await actor(3)
  await assert.rejects(() => close(price.id, '', ''), /Informe se o motivo/)
  await assert.rejects(() => close(other.id, 'candidate_reported', ''), /exige uma observacao/)
  await assert.rejects(() => close(price.id, 'candidate_reported', 'x'.repeat(2001)), /2000/)
  await assert.rejects(() => close(price.id, 'candidate_reported', '', null), /Contato atualizado/)
  c = await close()
  assert.equal(c.archived, true)
  assert.equal(c.next_action_at, null)
  assert.equal(c.loss_data.reason_label, price.name)
  assert.equal(c.loss_data.evidence, 'staff_inferred')
  assert.equal(c.loss_data.stage, 'negociacao')
  assert.equal(c.loss_data.owner_id, uid(3))
  assert.equal(c.loss_data.course, 'Direito')
  await assert.rejects(() => close(), /ja esta encerrado/)
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { archived: false }, c.version]),
    /Use Reabrir/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { stage: 'abordagem' }, c.version]),
    /Reabra o atendimento/,
  )
  await assert.rejects(
    () => rpc('crm_kanban_save', [c.id, { loss_data: null }, c.version]),
    /nao permitida/,
  )
  await assert.rejects(
    () =>
      rpc('crm_kanban_activity_v2', [
        c.id,
        'Novo contato',
        'whatsapp',
        new Date().toISOString(),
        null,
        'outbound',
        null,
        null,
      ]),
    /Reabra o atendimento/,
  )
  await rpc('crm_kanban_activity_v2', [
    c.id,
    'Análise interna do encerramento',
    'outro',
    new Date().toISOString(),
    null,
    'note',
    null,
    null,
  ])
  c = await detail(c.id)
  assert.equal(c.last_interaction_at, null)
  const snapshot = c.loss_data
  await actor(2)
  price = await rpc('crm_kanban_reason_save', [
    price.id,
    'Investimento e condições comerciais',
    false,
    false,
    price.version,
  ])
  assert.equal(
    (await detail(c.id)).loss_data.reason_label,
    snapshot.reason_label,
    'Renaming cannot rewrite old closure snapshots',
  )
  const free = await rpc('crm_kanban_create', ['22345678901', { nome: 'Sem responsável' }, null])
  await actor(3)
  await assert.rejects(
    () =>
      rpc('crm_kanban_close_loss', [
        free.id,
        free.version,
        other.id,
        'candidate_reported',
        'Sem dono',
      ]),
    /Encerramento nao permitido/,
  )
  let second = await rpc('crm_kanban_create', ['32345678901', { nome: 'Segundo contato' }, null])
  await assert.rejects(
    () =>
      rpc('crm_kanban_close_loss', [
        second.id,
        second.version,
        price.id,
        'candidate_reported',
        'Preço',
      ]),
    /motivo ativo/,
  )
  await actor(4)
  await assert.rejects(
    () => rpc('crm_kanban_reopen_loss', [c.id, c.version, 'Novo interesse']),
    /Reabertura nao permitida/,
  )
  await actor(3)
  await assert.rejects(
    () => rpc('crm_kanban_reopen_loss', [c.id, c.version, '']),
    /observacao de reabertura/,
  )
  c = await rpc('crm_kanban_reopen_loss', [c.id, c.version, 'Candidato retomou o interesse'])
  assert.equal(c.loss_data, null)
  assert.equal(c.archived, false)
  const history = (await rpc('crm_kanban_detail', [c.id, null])).events
  assert.equal(history.filter((e) => e.event_type === 'loss_closed').length, 1)
  assert.equal(
    history.find((e) => e.event_type === 'loss_reopened').payload.previous.reason_label,
    snapshot.reason_label,
  )
  c = await rpc('crm_kanban_close_loss', [
    c.id,
    c.version,
    other.id,
    'candidate_reported',
    'Decidiu retomar no próximo semestre',
  ])
  assert.notEqual(c.loss_data.id, snapshot.id, 'A new closure is a separate historical episode')
  await actor(null, '')
  await rpc('crm_kanban_import', [
    'matriculados_20271',
    'ra-test',
    { cpf: '12345678901', aluno: 'Contato de teste', curso: 'DIREITO', contrato: 'ATIVO' },
    '2026-11-16',
    false,
  ])
  await actor(3)
  c = await detail(c.id)
  assert.equal(c.official_enrollment, true)
  assert.equal(c.stage, 'matriculado')
  assert.equal(
    c.loss_data,
    null,
    'A verified matriculation reopens an older closure while preserving its audit',
  )
  assert.equal(c.archived, false)
  await assert.rejects(
    () => close(other.id, 'candidate_reported', 'Outro motivo', c.version),
    /atendimento matriculado/,
  )
  await actor(null, '')
  const migration = await readFile(
    new URL('../sql/crm_kanban_motivos_desistencia.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration)
  await actor(2)
  workspace = await rpc('crm_kanban_workspace')
  assert.equal(workspace.loss_reasons.length, 10)
  assert.equal(workspace.loss_reasons.find((r) => r.id === price.id).active, false)
  assert.equal(workspace.loss_reasons.find((r) => r.id === price.id).name, price.name)
  assert.ok(
    Number(
      (await db.query('select count(*) n from public.crm_kanban_loss_reason_history')).rows[0].n,
    ) >= 2,
  )
  await actor(3)
  assert.equal(
    Number(
      (await db.query('select count(*) n from public.crm_kanban_loss_reason_history')).rows[0].n,
    ),
    0,
  )
  await actor(6)
  await assert.rejects(() => rpc('crm_kanban_workspace'), /Acesso negado/)
  await actor(null, 'anon')
  await assert.rejects(
    () => rpc('crm_kanban_close_loss', [c.id, c.version, other.id, 'candidate_reported', 'x']),
    /permission denied/,
  )
  console.log(
    'CRM desistencias: supervisao, motivos ativos, origem obrigatoria, Outro com observacao, RLS, historico imutavel, reabertura, matricula oficial e migracao idempotente verificados.',
  )
} finally {
  await db.close()
}
