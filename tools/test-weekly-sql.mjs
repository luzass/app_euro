import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { weeklyReport,owner,seller,reportId,diagnosis } from './weekly-fixture.mjs'
const {PGlite}=createRequire(import.meta.url)(resolve(process.argv[2]))
const db=new PGlite()
const other='00000000-0000-4000-8000-000000000003'
const rpc=async(name,args=[],slots='')=>(await db.query(`select public.${name}(${slots}) result`,args)).rows[0].result
const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,nome text,email text,role text);
 create function crm_kanban_key(text) returns text language sql immutable as $$select regexp_replace(lower(coalesce($1,'')),'[^a-z0-9]','','g')$$;
 create table crm_kanban_contacts(id uuid primary key,owner_id uuid,stage text,stage_entered_at timestamptz,created_at timestamptz,archived boolean,test_only boolean,intake_visible boolean,has_inscription boolean,official_enrollment boolean,loss_data jsonb,checklist jsonb,next_action_at timestamptz,last_interaction_at timestamptz,last_outreach_at timestamptz,last_response_at timestamptz,current_data jsonb);
 create table crm_kanban_activities(contact_id uuid,author_id uuid,occurred_at timestamptz,channel text,direction text,note text);
 create table inscritos_20271(cpf text,curso text,campus text,ano_semestre text,data_inscricao text);
 create table matriculados_20271(cpf text,curso text,filial text,periodo_letivo text,contrato text,tipo_aluno text,data_de_matricula text);`)
 for(const [id,email,role] of [[owner,'lucasctdebritto@gmail.com','admin'],[seller,'vendedor@example.test','captacao'],[other,'diego.eger@unieuro.edu.br','captacao_gerente']]){
  await db.query('insert into auth.users values($1,$2)',[id,email]);await db.query('insert into profiles values($1,$2,$3,$4)',[id,'Teste',id===other?'lucasctdebritto@gmail.com':email,role])
 }
 let migration=await readFile(new URL('../sql/captacao_inteligencia_semanal.sql',import.meta.url),'utf8')
 // A fixed clock makes the fixture independent of the execution host date.
 migration=migration.replaceAll('now()',"timestamptz '2026-11-26T15:00:00Z'")
 await db.exec(migration);await db.exec(migration)
 await actor(other);await assert.rejects(()=>rpc('weekly_list'),e=>e.code==='42501')
 await assert.rejects(()=>rpc('weekly_collect',['2026-11-25'],'$1'),e=>e.code==='42501')
 await actor(owner)
 assert.equal((await rpc('weekly_list')).reports.length,0)
 const snapshot=weeklyReport().snapshot
 const saved=await rpc('weekly_snapshot_save',[reportId,'2026-11-25',snapshot],'$1,$2,$3')
 assert.equal(saved.snapshot.facts.length,snapshot.facts.length)
 const altered={...snapshot,warnings:['changed']}
 assert.deepEqual((await rpc('weekly_snapshot_save',[reportId,'2026-11-25',altered],'$1,$2,$3')).snapshot,saved.snapshot,'Snapshot is immutable on request retry')
 await assert.rejects(()=>rpc('weekly_snapshot_save',[crypto.randomUUID(),'2026-11-27',snapshot],'$1,$2,$3'))
 await assert.rejects(()=>db.query('select * from captacao_weekly_reports'),e=>e.code==='42501')
 const job='20000000-0000-4000-8000-000000000001'
 assert.equal((await rpc('weekly_ai_claim',[reportId,job],'$1,$2')).already_done,false)
 await assert.rejects(()=>rpc('weekly_ai_claim',[reportId,crypto.randomUUID()],'$1,$2'),e=>e.code==='PT409')
 await assert.rejects(()=>rpc('weekly_ai_finish',[reportId,crypto.randomUUID(),diagnosis(),'test-model',null],'$1,$2,$3,$4,$5'),e=>e.code==='PT409')
 await rpc('weekly_ai_finish',[reportId,job,diagnosis(),'test-model',null],'$1,$2,$3,$4,$5')
 assert.equal((await rpc('weekly_ai_claim',[reportId,crypto.randomUUID()],'$1,$2')).already_done,true)
 const actionId='30000000-0000-4000-8000-000000000001'
 const patch={week_start:'2026-11-23',title:'Revisar pendencias',hypothesis:'Melhorar registros',audience:'Carteira sem registro',plan:'Conferir carteira e combinar retorno',owner_id:seller,due_date:'2026-11-27',metric_key:'crm/sem_registro_3d',target:0,status:'planejada',execution:'',review:'',outcome:'pendente',suggestion_index:0}
 const action=await rpc('weekly_action_save',[actionId,reportId,null,patch],'$1,$2,$3,$4')
 assert.equal(action.baseline,2)
 await assert.rejects(()=>rpc('weekly_action_save',[crypto.randomUUID(),reportId,null,patch],'$1,$2,$3,$4'),e=>e.code==='PT409')
 await assert.rejects(()=>rpc('weekly_action_save',[actionId,reportId,1,{...patch,status:'concluida'}],'$1,$2,$3,$4'))
 await assert.rejects(()=>rpc('weekly_action_save',[actionId,reportId,0,patch],'$1,$2,$3,$4'),e=>e.code==='PT409')
 await assert.rejects(()=>rpc('weekly_action_save',[actionId,reportId,1,{...patch,baseline:0}],'$1,$2,$3,$4'))
 const updated=await rpc('weekly_action_save',[actionId,reportId,1,{...patch,status:'concluida',execution:'Foram conferidos os registros da carteira',review:'Variacao ainda inconclusiva',outcome:'inconclusivo'}],'$1,$2,$3,$4')
 assert.equal(updated.version,2);assert.equal(updated.baseline,2)
 assert.equal((await rpc('weekly_list')).actions.length,1)
 await db.exec('reset role')
 assert.equal((await db.query('select count(*)::int n from captacao_weekly_action_history')).rows[0].n,2)
 await db.query("insert into inscritos_20271 values('11111111111','DIREITO','ASA SUL','2027.1','25/11/2026'),('22222222222','DIREITO','ASA SUL','2026.2','25/11/2026')")
 await db.query("insert into matriculados_20271 values('11111111111','DIREITO','ASA SUL','2027.1','ATIVO','CALOURO','25/11/2026'),('22222222222','DIREITO','ASA SUL',null,'ATIVO','CALOURO','25/11/2026')")
 await actor(owner)
 const collected=await rpc('weekly_collect',['2026-11-25'],'$1')
 assert.equal(collected.campaigns.at(-1).inscritos.length,1)
 assert.equal(collected.campaigns.at(-1).matriculados.length,1)
 assert.equal(collected.campaigns[0].inscritosError,'Base indisponivel')
 assert.equal(collected.documents,null)
 for(let i=0;i<9;i++){
  const id=crypto.randomUUID(),job=crypto.randomUUID()
  await rpc('weekly_snapshot_save',[id,'2026-11-25',snapshot],'$1,$2,$3')
  await rpc('weekly_ai_claim',[id,job],'$1,$2')
  await rpc('weekly_ai_finish',[id,job,null,null,'Falha simulada'],'$1,$2,$3,$4,$5')
 }
 const limitedId=crypto.randomUUID()
 await rpc('weekly_snapshot_save',[limitedId,'2026-11-25',snapshot],'$1,$2,$3')
 await assert.rejects(()=>rpc('weekly_ai_claim',[limitedId,crypto.randomUUID()],'$1,$2'),e=>e.code==='PT429')
 await db.exec('reset role;set role anon')
 await assert.rejects(()=>rpc('weekly_list'),e=>e.code==='42501')
 console.log('PASS: Private SQL/RPC guards, repeated migration, immutable snapshot retries, generation locks/idempotency, active source periods, missing sources, authoritative baselines, plan revisions and audit history.')
}catch(error){console.error(error.message,error.code,error.where||'');process.exitCode=1}finally{await db.close()}
