import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawn} from 'node:child_process'
import {weeklyReport,diagnosis,seller} from './weekly-fixture.mjs'
const {chromium}=await import(pathToFileURL(resolve(process.argv[2],'playwright/index.mjs')).href)
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{windowsHide:true,stdio:'pipe'})
let browser
try{
 await new Promise((ready,reject)=>{const timer=setTimeout(()=>reject(new Error('Vite timeout')),15000);server.stdout.on('data',data=>{if(String(data).includes('Local:')){clearTimeout(timer);ready()}});server.on('exit',code=>{clearTimeout(timer);reject(new Error('Vite exited '+code))})})
 browser=await chromium.launch({channel:'msedge',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[], calls=[]
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message))
 await page.clock.install({time:new Date('2026-11-26T15:00:00Z')})
 await page.route('**/src/main.tsx',route=>route.fulfill({contentType:'application/javascript',body:"import '/tools/weekly-preview-entry.tsx';"}))
 const report=weeklyReport(), actions=[]
 let captured=false, generated=false, failure=false
 await page.route('**/rest/v1/rpc/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),body=route.request().postDataJSON();calls.push(name)
  let result
  if(name==='weekly_list')result={reports:captured ? [report] : [],actions,members:report.snapshot.members}
  else if(name==='weekly_get')result=report
  else if(name==='weekly_action_save'){
   const previous=actions.find(action=>action.id===body.p_id)
   if(previous && previous.version!==body.p_version)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'PT409',message:'Acao atualizada. Recarregue.'})})
   const action={id:body.p_id,report_id:body.p_report,...body.p_patch,baseline:report.snapshot.facts.find(fact=>fact.key===body.p_patch.metric_key).value,version:(previous?.version||0)+1,updated_at:'2026-11-26T15:00:00Z'}
   if(previous)Object.assign(previous,action);else actions.push(action);result=action
  }else throw new Error(name)
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)})
 })
 await page.route('**/functions/v1/weekly-intelligence',async route=>{
  const body=route.request().postDataJSON();calls.push(body.action)
  if(body.action==='capture'){captured=true;report.id=body.id}
  else {assert.equal(body.reviewed,true);assert.equal(body.include_notes,false);generated=true;if(failure)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Configure OPENAI_API_KEY e OPENAI_MODEL.'})});report.analysis=diagnosis();report.model='modelo-de-teste';report.generated_at='2026-11-26T15:01:00Z'}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({report})})
 })
 await page.goto('http://127.0.0.1:5199')
 await page.getByText('Nenhuma fotografia selecionada.',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Nova fotografia',exact:true}).click()
 await page.getByLabel('Preparar diagnóstico da IA').waitFor()
 assert.equal(generated,false)
 const generate=page.getByRole('button',{name:'Gerar diagnóstico com IA',exact:true})
 assert.equal(await generate.isDisabled(),true)
 await page.getByText('Conteúdo que será enviado à OpenAI',{exact:true}).click()
 const preview=await page.locator('pre').innerText()
 assert.equal(preview.includes('ana@example.test'),false)
 assert.equal(preview.includes('Lucas Britto'),false)
 await page.getByRole('checkbox',{name:/Revisei o conteúdo/}).check()
 failure=true;await generate.click();await page.getByRole('alert').getByText('Configure OPENAI_API_KEY e OPENAI_MODEL.',{exact:true}).waitFor()
 failure=false;await generate.click()
 await page.getByLabel('Diagnóstico da IA',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Revisar e levar ao plano',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await mkdir('outputs/weekly-intelligence-check',{recursive:true})
 await dialog.screenshot({path:'outputs/weekly-intelligence-check/action-editor-desktop.png'})
 await dialog.getByLabel('Responsável',{exact:true}).selectOption(seller)
 await dialog.getByRole('button',{name:'Salvar compromisso',exact:true}).click()
 await page.getByText('Compromisso salvo com histórico de alterações.',{exact:true}).waitFor()
 assert.equal(actions.length,1)
 await page.getByRole('button',{name:'Plano da semana',exact:true}).click()
 await page.getByText('1 combinado',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Revisar compromisso',exact:true}).click()
 await dialog.getByLabel('Situação',{exact:true}).selectOption('concluida')
 await dialog.getByLabel('O que foi efetivamente feito / motivo da não execução',{exact:true}).fill('Conferimos os registros e combinamos os proximos retornos.')
 await dialog.getByLabel('Avaliação do resultado',{exact:true}).selectOption('inconclusivo')
 await dialog.getByLabel('Resultado observado e contexto',{exact:true}).fill('Ainda nao temos tempo suficiente para avaliar mudanca nas matriculas.')
 await dialog.getByRole('button',{name:'Salvar compromisso',exact:true}).click()
 await dialog.waitFor({state:'hidden'})
 assert.equal(actions[0].version,2)
 assert.equal(actions[0].status,'concluida')
 await page.getByRole('button',{name:'Revisão dos resultados',exact:true}).click()
 await page.getByText('Conferimos os registros e combinamos os proximos retornos.').waitFor()
 const output='outputs/weekly-intelligence-check';await mkdir(output,{recursive:true})
 await page.screenshot({path:`${output}/review-desktop.png`,fullPage:true})
 await page.getByRole('button',{name:'Diagnóstico',exact:true}).click()
 await page.screenshot({path:`${output}/diagnosis-desktop.png`,fullPage:true})
 const count=calls.length;await page.clock.fastForward(15*60000)
 assert.equal(calls.length,count,'No background polling or automatic paid requests')
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:`${output}/diagnosis-mobile.png`,fullPage:true})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow')
 await page.getByRole('button',{name:'Revisão dos resultados',exact:true}).click()
 await page.screenshot({path:`${output}/review-mobile.png`,fullPage:true})
 assert.deepEqual(errors,[])
 console.log('PASS: Empty state, snapshot capture without AI, privacy preview, explicit paid generation, configuration failure, approval without CRM writes, action execution/review persistence, no polling and desktop/mobile layouts.')
}finally{if(browser)await browser.close();server.kill()}
