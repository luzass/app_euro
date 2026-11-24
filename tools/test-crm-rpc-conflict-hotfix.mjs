import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const base = await readFile(new URL('../sql/crm_kanban_estrutura.sql',import.meta.url),'utf8')
const hotfix = await readFile(new URL('../sql/crm_kanban_corrigir_conflitos_rpc.sql',import.meta.url),'utf8')
const names = ['crm_kanban_save','crm_kanban_activity_v2','crm_kanban_resume_cadence','crm_kanban_reason_save','crm_kanban_close_loss','crm_kanban_reopen_loss','crm_kanban_document_save','crm_kanban_document_cancel']
async function actor(n) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)])
  await db.exec('set role authenticated')
}
async function rpc(name,args=[]) { return (await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) result`,args)).rows[0].result }
const metadata = () => db.query("select oid,proname,proowner,proacl,prosecdef,proconfig,provolatile,proargtypes::text,prorettype,prosrc from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[]) order by proname",[names])
const dataSnapshot = () => db.query(`select jsonb_build_object(
  'contacts',(select jsonb_agg(to_jsonb(t) order by id) from public.crm_kanban_contacts t),
  'events',(select jsonb_agg(to_jsonb(t) order by id) from public.crm_kanban_events t),
  'reasons',(select jsonb_agg(to_jsonb(t) order by id) from public.crm_kanban_loss_reasons t),
  'documents',(select jsonb_agg(to_jsonb(t) order by id) from public.crm_kanban_documents t)) data`)
const conflict = (callback) => assert.rejects(callback,e=>e.code==='PT409')
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create table public.profiles(id uuid primary key,nome text,role text);`)
  for (const [n,role] of [[1,'admin'],[2,'captacao'],[3,'funcionario']]) await db.query('insert into public.profiles values($1,$2,$3)',[uid(n),'Perfil '+n,role])
  await db.exec(base.replaceAll("errcode='PT409'","errcode='40001'"))
  await actor(2)
  let c = await rpc('crm_kanban_create',['12345678901',{nome:'Contato teste'},null])
  c = await rpc('crm_kanban_save',[c.id,{stage:'abordagem'},c.version])
  await assert.rejects(()=>rpc('crm_kanban_save',[c.id,{manual_data:{nome:'Nao gravar'}},0]),e=>e.code==='40001')
  await db.exec('reset role')
  const before = await metadata(), rowsBefore = await dataSnapshot()
  assert.equal(before.rows.length,8)
  assert.ok(before.rows.every(row=>row.prosrc.includes("errcode='40001'")))
  await db.exec(hotfix)
  const after = await metadata()
  assert.deepEqual(after.rows,before.rows.map(row=>({...row,prosrc:row.prosrc.replaceAll("errcode='40001'","errcode='PT409'")})))
  assert.deepEqual(await dataSnapshot(),rowsBefore,'Changing error codes must not change business records')
  await db.exec(hotfix)
  assert.deepEqual(await metadata(),after,'Hotfix must be idempotent')
  await actor(2)
  await conflict(()=>rpc('crm_kanban_save',[c.id,{manual_data:{nome:'Nao gravar'}},0]))
  await conflict(()=>rpc('crm_kanban_activity_v2',[c.id,'Mensagem teste','whatsapp',new Date().toISOString(),null,'outbound','A1','2000-01-01T00:00:00Z']))
  await conflict(()=>rpc('crm_kanban_resume_cadence',[c.id,0]))
  const untouched = await rpc('crm_kanban_detail',[c.id,null])
  assert.equal(untouched.contact.current_data.nome,'Contato teste')
  assert.equal(untouched.activities.length,0)
  c = await rpc('crm_kanban_save',[c.id,{manual_data:{nome:'Atualizacao valida'}},c.version])
  assert.equal(c.current_data.nome,'Atualizacao valida')
  await actor(3)
  await assert.rejects(()=>rpc('crm_kanban_save',[c.id,{manual_data:{nome:'Outro vendedor'}},0]),e=>e.code==='42501')
  await actor(1)
  const reason = await rpc('crm_kanban_reason_save',[null,'Motivo de teste',true,false,null])
  await conflict(()=>rpc('crm_kanban_reason_save',[reason.id,reason.name,true,false,0]))
  await conflict(()=>rpc('crm_kanban_close_loss',[c.id,0,reason.id,'candidate_reported','Teste']))
  await conflict(()=>rpc('crm_kanban_reopen_loss',[c.id,0,'Reabrir atendimento']))
  const d = await rpc('crm_kanban_document_save',[c.id,uid(100),'Direito','Historico','2020-01-01T10:00:00Z',null,'','',null,null])
  await conflict(()=>rpc('crm_kanban_document_save',[c.id,d.document.id,'Direito','Corrigir','2020-01-01T10:00:00Z',null,'','',0,'Ajuste']))
  await conflict(()=>rpc('crm_kanban_document_cancel',[d.document.id,0,'Cancelar duplicidade']))
  await db.exec('reset role')
  await db.exec('drop function public.crm_kanban_document_save(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,text);drop function public.crm_kanban_document_cancel(uuid,integer,text);')
  await db.exec(hotfix)
  assert.equal((await metadata()).rows.length,6,'Optional documentation functions may be absent')
  for (const path of ['crm_kanban_estrutura.sql','crm_kanban_funil_cadencias.sql','crm_kanban_motivos_desistencia.sql','crm_kanban_documentacao.sql']) {
    const sql = await readFile(new URL('../sql/'+path,import.meta.url),'utf8')
    assert.ok(!/errcode\s*=\s*'40001'/i.test(sql),path+' must not reintroduce retryable business errors')
  }
  console.log('PASS: 8 stale-version/cadence RPCs return PT409; original bug reproduced locally; hotfix preserves OIDs, ACLs, owners, security, messages, signatures and records; valid writes, permissions, repeatability and optional modules passed')
} finally { await db.close() }
