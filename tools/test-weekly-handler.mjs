import assert from 'node:assert/strict'
import { handleWeeklyRequest } from '../supabase/functions/weekly-intelligence/handler.bundle.js'
import { weeklySource,weeklyReport,diagnosis,reportId } from './weekly-fixture.mjs'
let user='lucasctdebritto@gmail.com', stored=null, providerCalls=0, capturedCalls=0, inProgress=false, providerMode='ok'
const env={OPENAI_API_KEY:'server-test-secret',OPENAI_MODEL:'test-model'}
let sent
const client={auth:{getUser:async()=>({data:{user:{id:'u1',email:user}},error:null})},rpc:async(name,args)=>{
 switch(name){
  case 'weekly_get':return {data:stored,error:null}
  case 'weekly_collect':capturedCalls++;return {data:weeklySource(),error:null}
  case 'weekly_snapshot_save':stored={...weeklyReport(),id:args.p_id,snapshot:args.p_snapshot};return {data:stored,error:null}
  case 'weekly_ai_claim':if(stored.analysis)return {data:{already_done:true,report:stored},error:null};if(inProgress)return {data:null,error:{code:'PT409',message:'busy'}};inProgress=true;return {data:{already_done:false,report:stored,actions:[]},error:null}
  case 'weekly_ai_finish':inProgress=false;stored={...stored,analysis:args.p_analysis,model:args.p_model,last_error:args.p_error};return {data:null,error:null}
  default:throw new Error(name)
 }
}}
const deps={client:()=>client,env:key=>env[key],fetch:async(url,options)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');providerCalls++;sent=JSON.parse(options.body)
 assert.equal(options.headers.Authorization,'Bearer server-test-secret')
 if(providerMode==='429')return new Response('{}',{status:429})
 const output=providerMode==='invalid' ? {...diagnosis(),suggestions:[{...diagnosis().suggestions[0],metric_key:'inventado'}]} : diagnosis()
 return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}),{status:200})
}}
const request=(body,origin='http://localhost:5195')=>new Request('https://example.test/functions/v1/weekly-intelligence',{method:'POST',headers:{Authorization:'Bearer user-token',Origin:origin},body:JSON.stringify(body)})
const call=body=>handleWeeklyRequest(request(body),deps)
assert.equal((await handleWeeklyRequest(request({action:'capture',id:reportId,cutoff:'2026-11-25'},'https://evil.test'),deps)).status,403)
user='diego.eger@unieuro.edu.br';assert.equal((await call({action:'capture',id:reportId,cutoff:'2026-11-25'})).status,403)
assert.equal(capturedCalls,0)
user='lucasctdebritto@gmail.com'
assert.equal((await call({action:'capture',id:reportId,cutoff:'2026-11-25'})).status,200)
assert.equal((await call({action:'capture',id:reportId,cutoff:'2026-11-25'})).status,200)
assert.equal(capturedCalls,1);assert.equal(providerCalls,0)
assert.equal((await call({action:'generate',id:reportId,include_notes:false,reviewed:false})).status,400)
delete env.OPENAI_API_KEY;assert.equal((await call({action:'generate',id:reportId,include_notes:false,reviewed:true})).status,503)
env.OPENAI_API_KEY='server-test-secret'
assert.equal((await call({action:'generate',id:reportId,include_notes:false,reviewed:true})).status,200)
assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true)
assert.equal(JSON.parse(sent.input).notes.length,0)
assert.equal(sent.instructions.includes('Ana Teste'),false)
assert.equal(JSON.stringify(stored).includes('server-test-secret'),false)
assert.equal((await call({action:'generate',id:reportId,include_notes:true,reviewed:true})).status,200)
assert.equal(providerCalls,1,'Existing analysis must not trigger another paid call')
stored={...stored,analysis:null};providerMode='invalid'
assert.equal((await call({action:'generate',id:reportId,include_notes:true,reviewed:true})).status,400)
assert.equal(stored.analysis,null)
assert.equal(inProgress,false)
assert.equal(sent.input.includes('ana@example.test'),false)
providerMode='429'
const limited=await call({action:'generate',id:reportId,include_notes:false,reviewed:true})
assert.equal(limited.status,400)
assert.ok((await limited.json()).error.includes('limites'))
assert.equal(inProgress,false)
console.log('PASS: server-only credentials, exclusive authenticated identity, CORS, capture without AI, idempotent requests, explicit review/notes opt-in, structured output validation, grounded metrics and provider-failure recovery without fabricated reports.')
