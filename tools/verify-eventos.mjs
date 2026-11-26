import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[3]))
const { chromium } = await import(pathToFileURL(resolve(process.argv[2],'playwright/index.mjs')).href)
const db = new PGlite()
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197','--strictPort'],{windowsHide:true,stdio:'pipe'})
let browser
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
    create table inscritos_20271(cpf text,email text,contato_2 text,ano_semestre text,curso text);
    create table matriculados_20271(cpf text,email text,periodo_letivo text,curso text,tipo_aluno text,contrato text);
    insert into auth.users values('00000000-0000-0000-0000-000000000001','lucasdtbritto@gmail.com');
    insert into inscritos_20271 values('11111111111','a@example.test','61911112222','2027.1','DIREITO'),('22222222222','b@example.test','61955556666','2027.1','PSICOLOGIA');
    insert into matriculados_20271 values('11111111111','a@example.test','2027.1','DIREITO','CALOURO','ATIVO');`)
  await db.exec(await readFile(new URL('../sql/eventos_captacao.sql',import.meta.url),'utf8'))
  await new Promise((ready,reject) => {
    const timer=setTimeout(() => reject(new Error('Vite timeout')),15000)
    server.stdout.on('data',data => { if(String(data).includes('Local:')) {clearTimeout(timer);ready()} })
    server.on('exit',code => {clearTimeout(timer);reject(new Error('Vite exited '+code))})
  })
  browser=await chromium.launch({channel:'msedge',headless:true})
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[], calls=[]
  page.setDefaultTimeout(30000)
  page.on('pageerror',error => errors.push(error.message))
  await page.clock.install()
  await page.route('https://fonts.googleapis.com/**',route => route.abort())
  await page.route('https://fonts.gstatic.com/**',route => route.abort())
  await page.route('**/src/main.tsx',route => route.fulfill({contentType:'application/javascript',body:"import '/tools/eventos-preview-entry.tsx';"}))
  await page.route('**/rest/v1/rpc/**',async route => {
    const name=new URL(route.request().url()).pathname.split('/').at(-1), args=route.request().postDataJSON()
    calls.push({name,args})
    const config={eventos_painel:[['p_periodo','p_forcar'],'$1,$2'],eventos_listar:[['p_periodo','p_evento','p_situacao','p_pagina'],'$1,$2,$3,$4'],eventos_importar:[['p_chave','p_arquivo','p_evento','p_linhas'],'$1,$2,$3,$4']}
    assert.ok(config[name],name)
    try {
      const value=(await db.query(`select public.${name}(${config[name][1]}) result`,config[name][0].map(key=>args[key]))).rows[0].result
      await route.fulfill({contentType:'application/json',body:JSON.stringify(value)})
    } catch(error) { await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:error.message,code:error.code})}) }
  })
  await page.goto('http://127.0.0.1:5197')
  await page.getByText('Nenhum evento encontrado.',{exact:true}).waitFor()
  assert.equal((await page.request.get('http://127.0.0.1:5197/templates/modelo-leads-eventos.xlsx')).status(),200)
  const upload=async () => {
    await page.getByRole('button',{name:'Importar leads',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Importar leads de eventos',exact:true})
    await dialog.getByLabel('Evento padrão',{exact:true}).fill('Evento sem nome')
    await dialog.getByLabel('Planilha de leads de eventos',{exact:true}).setInputFiles(resolve('tools/fixtures/eventos-importacao.xlsx'))
    await dialog.getByText('4 leads',{exact:true}).waitFor()
    await dialog.getByText('2 sem telefone/e-mail válido para cruzamento',{exact:true}).waitFor()
    return dialog
  }
  let dialog=await upload()
  await mkdir('outputs/eventos-20261126/check',{recursive:true})
  await dialog.screenshot({path:'outputs/eventos-20261126/check/importacao-desktop.png'})
  await dialog.getByRole('button',{name:'Confirmar importação',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  const cards=page.getByLabel('Resultados por evento',{exact:true})
  const feira=cards.getByRole('button',{name:'Conferir leads de Feira das Profissões',exact:true})
  await feira.waitFor()
  assert.deepEqual(await feira.locator('strong').allTextContents(),['2','1','1'])
  const visita=cards.getByRole('button',{name:'Conferir leads de Visita ao Colégio',exact:true})
  assert.deepEqual(await visita.locator('strong').allTextContents(),['1','1','0'])
  await feira.click()
  const details=page.getByRole('region',{name:'Leads do evento',exact:true})
  await details.locator('tbody tr').first().waitFor()
  assert.equal(await details.locator('tbody tr').count(),2)
  await details.getByLabel('Situação do cruzamento',{exact:true}).selectOption('sem_identificador')
  await page.waitForFunction(()=>document.querySelectorAll('section[aria-label="Leads do evento"] tbody tr').length===1)
  await details.getByRole('button',{name:'Fechar detalhes do evento',exact:true}).click()
  dialog=await upload()
  await dialog.getByRole('button',{name:'Confirmar importação',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  await page.getByRole('status').filter({hasText:'0 leads importados. 4 linhas'}).waitFor()
  assert.deepEqual(await feira.locator('strong').allTextContents(),['2','1','1'])
  await page.getByLabel('Buscar evento',{exact:true}).fill('Visita')
  assert.equal(await cards.getByRole('button').count(),1)
  await page.getByLabel('Buscar evento',{exact:true}).fill('')
  const before=calls.length
  await page.clock.fastForward(15*60000)
  assert.equal(calls.length,before,'No periodic database polling')
  await db.exec("insert into matriculados_20271 values('22222222222','b@example.test','2027.1','PSICOLOGIA','CALOURO','ATIVO')")
  await page.getByLabel('Atualizar cruzamentos',{exact:true}).click()
  for(let n=0;n<80 && (await visita.locator('strong').allTextContents())[2]!=='1';n++) await page.waitForTimeout(50)
  assert.deepEqual(await visita.locator('strong').allTextContents(),['1','1','1'])
  await visita.click()
  await details.getByText('Responsável de Teste',{exact:true}).waitFor()
  await page.screenshot({path:'outputs/eventos-20261126/check/eventos-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth)
  await page.screenshot({path:'outputs/eventos-20261126/check/eventos-mobile.png',fullPage:true})
  await page.getByRole('button',{name:'Importar leads',exact:true}).click()
  dialog=page.getByRole('dialog',{name:'Importar leads de eventos',exact:true})
  await dialog.getByLabel('Planilha de leads de eventos',{exact:true}).setInputFiles(resolve('public/templates/modelo-leads-eventos.xlsx'))
  await dialog.getByText('0 leads',{exact:true}).waitFor()
  assert.equal(await dialog.getByRole('button',{name:'Confirmar importação',exact:true}).isDisabled(),true)
  await dialog.screenshot({path:'outputs/eventos-20261126/check/importacao-mobile.png'})
  await dialog.getByLabel('Fechar importação',{exact:true}).click()
  await page.getByLabel('Processo seletivo dos eventos',{exact:true}).selectOption('2026.1')
  await page.getByRole('status').filter({hasText:'Bases indisponíveis:'}).waitFor()
  assert.equal(await cards.locator('strong').filter({hasText:'—'}).count(),6)
  assert.deepEqual(errors,[])
  console.log('PASS: Real XLSX upload to tested SQL, optional values, preview, duplicate-safe reimport, event totals, detail filters, manual refresh/new enrollment, no polling, model download, missing sources, empty workbook and desktop/mobile layouts.')
} catch(error) { console.error({message:error.message,stack:error.stack});process.exitCode=1 }
finally {await browser?.close();server.kill();await db.close()}
