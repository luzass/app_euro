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
  await db.exec(`set role ${role}`)
}
async function rpc(name, args = []) {
  return (
    await db.query(
      `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) result`,
      args,
    )
  ).rows[0].result
}
const migration = await readFile(
  new URL('../sql/crm_kanban_documentacao.sql', import.meta.url),
  'utf8',
)
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
  const functions = () =>
    db.query(
      "select proname,pg_get_functiondef(oid) def from pg_proc where proname in ('crm_kanban_documents','crm_kanban_document_save','crm_kanban_document_cancel','crm_kanban_validate_data') order by proname",
    )
  const baseFunctions = await functions()
  await db.exec(`drop function public.crm_kanban_document_save(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,text);
    drop function public.crm_kanban_document_cancel(uuid,integer,text);
    drop function public.crm_kanban_documents(uuid);
    drop table public.crm_kanban_documents;`)
  await db.exec(migration)
  assert.deepEqual(await functions(), baseFunctions)
  await actor(3)
  let c = await rpc('crm_kanban_create', [
    '12345678901',
    {
      nome: 'Contato A',
      curso: 'Direito',
      ingressante_outra_ies: 'Sim',
      ies_origem: 'Outra instituição',
    },
    null,
  ])
  const second = await rpc('crm_kanban_create', [
    '12345678902',
    { nome: 'Contato B', curso: 'Medicina' },
    null,
  ])
  assert.equal(c.current_data.ingressante_outra_ies, 'Sim')
  await assert.rejects(
    () =>
      rpc('crm_kanban_save', [
        c.id,
        { manual_data: { ingressante_outra_ies: 'Talvez' } },
        c.version,
      ]),
    /Sim/,
  )
  await assert.rejects(
    () =>
      rpc('crm_kanban_save', [c.id, { manual_data: { ies_origem: 'a'.repeat(201) } }, c.version]),
    /200/,
  )
  const initial = { ...c }
  const send = (
    id,
    hours,
    version = null,
    received = null,
    reason = null,
    contact = c.id,
    desc = 'Histórico escolar',
  ) =>
    rpc('crm_kanban_document_save', [
      contact,
      uid(id),
      'Direito',
      desc,
      '2020-01-01T10:00:00Z',
      received ??
        (hours === null ? null : `2020-01-01T${String(10 + hours).padStart(2, '0')}:00:00Z`),
      '',
      '',
      version,
      reason,
    ])
  let d = (await send(101, null)).document
  const retry = await send(101, null)
  assert.equal(retry.document.version, 1)
  assert.equal(retry.contact.version, initial.version + 1)
  for (const field of [
    'owner_id',
    'stage',
    'stage_entered_at',
    'last_interaction_at',
    'last_outreach_at',
    'last_response_at',
    'next_action_at',
    'checklist',
  ])
    assert.deepEqual(retry.contact[field], initial[field])
  await assert.rejects(() => send(101, null, null, null, null, second.id), /nao pertence/)
  await assert.rejects(() => send(101, 2, 0), /atualizado/)
  await assert.rejects(() => send(101, null, 1, null, null, c.id, 'Alterado'), /motivo da correcao/)
  await assert.rejects(() => send(102, null, null, '2019-01-01T00:00:00Z'), /datas/)
  await assert.rejects(() => send(102, null, null, '2999-01-01T00:00:00Z'), /datas/)
  await assert.rejects(
    () =>
      rpc('crm_kanban_document_save', [
        c.id,
        uid(102),
        '',
        'x',
        '2020-01-01',
        null,
        '',
        '',
        null,
        null,
      ]),
    /Confira/,
  )
  await actor(4)
  await assert.rejects(() => send(102, 2), /nao permitida/)
  await assert.rejects(() => rpc('crm_kanban_documents', [c.id]), /indisponivel/)
  await actor(3)
  d = (await send(101, 2, 1)).document
  assert.equal(d.version, 2)
  await send(102, 6)
  await send(103, null)
  let data = await rpc('crm_kanban_documents', [c.id])
  assert.equal(data.stats[0].completed, 2)
  assert.equal(data.stats[0].pending, 1)
  assert.equal(data.stats[0].mean_hours, 4)
  assert.equal(data.stats[0].median_hours, 4)
  assert.equal(data.documents.length, 3)
  assert.ok(data.courses.includes('Medicina'))
  await assert.rejects(
    () => db.exec('delete from public.crm_kanban_documents'),
    /permission denied/,
  )
  await assert.rejects(() => rpc('crm_kanban_document_cancel', [uid(102), 1, '']), /motivo/)
  await rpc('crm_kanban_document_cancel', [uid(102), 1, 'Envio duplicado'])
  data = await rpc('crm_kanban_documents', [c.id])
  assert.equal(data.stats[0].mean_hours, 2)
  assert.equal(data.documents.length, 3)
  assert.ok(data.documents.find((d) => d.id === uid(102)).cancelled_at)
  await assert.rejects(() => send(102, 6, 2), /cancelado/)
  await send(101, 3, 2, null, 'Correção da data de retorno')
  await actor(2)
  const other = await rpc('crm_kanban_create', ['12345678903', { nome: 'Outro vendedor' }, uid(4)])
  await send(104, 10, null, null, null, other.id)
  assert.equal((await rpc('crm_kanban_documents', [c.id])).stats[0].completed, 2)
  await actor(3)
  assert.equal((await rpc('crm_kanban_documents', [c.id])).stats[0].completed, 1)
  await db.exec('reset role')
  await db.query('update public.crm_kanban_contacts set test_only=true where id=$1', [other.id])
  await actor(2)
  assert.equal((await rpc('crm_kanban_documents', [c.id])).stats[0].completed, 1)
  await db.exec('reset role')
  await db.query('update public.crm_kanban_contacts set intake_visible=false where id=$1', [c.id])
  await actor(3)
  data = await rpc('crm_kanban_documents', [c.id])
  assert.equal(data.stats[0].pending, 0)
  assert.equal(data.stats[0].completed, 1)
  await assert.rejects(() => send(105, null), /Reabra/)
  await send(103, 4, 1)
  await actor(6)
  await assert.rejects(() => rpc('crm_kanban_documents', [c.id]), /indisponivel/)
  await actor(null, 'anon')
  await assert.rejects(() => rpc('crm_kanban_documents', [c.id]), /permission denied/)
  await db.exec('reset role')
  await db.exec(migration)
  await actor(5)
  data = await rpc('crm_kanban_documents', [c.id])
  assert.equal(data.documents.length, 3)
  assert.equal(data.stats[0].mean_hours, 3.5)
  const detail = await rpc('crm_kanban_detail', [c.id, null])
  assert.ok(detail.events.some((e) => e.event_type === 'document_cancelled'))
  assert.ok(detail.events.some((e) => e.event_type === 'document_saved' && e.payload.reason))
  console.log(
    'PASS: optional IES, fresh/upgrade parity, permissions, idempotence, dates, corrections, cancellation, audit and role-scoped turnaround stats',
  )
} finally {
  await db.close()
}
