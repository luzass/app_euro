import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { PGlite } = createRequire(import.meta.url)(resolve(process.argv[2]))
const db = new PGlite()
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const actor = async n => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(n)])
  await db.exec('set role authenticated')
}
const rpc = async (name, args, placeholders) => (await db.query(`select public.${name}(${placeholders}) result`, args)).rows[0].result
const importRows = (rows, key = 'a'.repeat(64), event = null) => rpc('eventos_importar', [key, 'teste.xlsx', event, rows], '$1,$2,$3,$4')
const dashboard = (period = '2027.1', force = false) => rpc('eventos_painel', [period, force], '$1,$2')
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key,email text,role text);
    create table public.inscritos_20271(cpf text,email text,contato_2 text,ano_semestre text,curso text,processo_seletivo text,codcoligada text,codigo_do_processo text);
    create table public.matriculados_20271(cpf text,email text,periodo_letivo text,curso text,contrato text,tipo_aluno text);`)
  for (const [n, email] of [[1,'lucasdtbritto@gmail.com'],[2,'diego.eger@unieuro.edu.br'],[3,'outro@example.test']]) {
    await db.query('insert into auth.users values($1,$2)', [uid(n), email])
    await db.query('insert into profiles values($1,$2,$3)', [uid(n), n===3 ? 'lucasdtbritto@gmail.com' : email, 'admin'])
  }
  const migration = await readFile(new URL('../sql/eventos_captacao.sql', import.meta.url), 'utf8')
  await db.exec(migration); await db.exec(migration)
  for (const [cpf,email,phone,course] of [
    ['11111111111','a@example.test','61911112222','DIREITO'],
    ['22222222222','b@example.test','61922223333','MEDICINA'],
    ['33333333333','shared@example.test','61933334444','DIREITO'],
    ['44444444444','shared@example.test','61944445555','DIREITO'],
  ]) await db.query('insert into inscritos_20271 values($1,$2,$3,$4,$5,null,null,null)', [cpf,email,phone,'2027.1',course])
  await db.exec(`insert into matriculados_20271 values
    ('11111111111','a@example.test','2027.1','DIREITO','ATIVO','CALOURO'),
    ('22222222222','b@example.test','2027.1','MEDICINA','CANCELADO','CALOURO'),
    ('55555555555','veterano@example.test','2027.1','DIREITO','ATIVO','VETERANO'),
    ('66666666666','conflicting@example.test','2027.1','DIREITO','ATIVO','CALOURO'),
    ('66666666666','conflicting@example.test','2027.1','DIREITO','ATIVO','VETERANO');`)
  await actor(3)
  assert.equal(await rpc('eventos_can_access', [], ''), false, 'A forged editable profile email cannot grant access')
  await assert.rejects(() => dashboard(), e => e.code === '42501')
  await assert.rejects(() => importRows([{linha:2,nome:'X'}]), e => e.code === '42501')
  await actor(1)
  assert.equal(await rpc('eventos_can_access', [], ''), true)
  const rows = [
    {linha:2,nome:'A',email:' A@EXAMPLE.TEST ',telefone:'+55 (61) 91111-2222',evento:'Feira A'},
    {linha:3,email:'a@example.test',evento:'Feira A'},
    {linha:4,telefone:'61922223333',evento:'Feira A'},
    {linha:5,email:'shared@example.test',evento:'Feira A'},
    {linha:6,email:'a@example.test',telefone:'61922223333',evento:'Feira A'},
    {linha:7,nome:'A',telefone_responsavel:'61911112222',evento:'Feira A'},
    {linha:8,email:'shared@example.test',telefone:'61933334444',evento:'Feira A'},
    {linha:9,curso:'Direito'}, {linha:10,evento:'Somente evento'}, {linha:11},
    {linha:12,email:'naoexiste@example.test',evento:'Feira A'},
    {linha:13,email:'veterano@example.test',evento:'Feira A'},
    {linha:14,email:'conflicting@example.test',evento:'Feira A'},
  ]
  assert.equal((await importRows(rows)).importados, 12)
  assert.equal((await importRows(rows)).importados, 0)
  let model = await dashboard()
  const feira = () => model.eventos.find(event => event.chave === 'feira a')
  assert.equal(feira().leads, 10)
  assert.equal(feira().inscritos, 3, 'Distinct CPFs per event; repeated imported capture does not duplicate conversion')
  assert.equal(feira().matriculados, 1)
  assert.equal(feira().sem_identificador, 1, 'Guardian phone and matching name are not candidate identity')
  assert.equal(feira().revisar, 2, 'Ambiguous contact and conflicting independent identifiers require review')
  assert.equal(feira().repeticoes_identificadas, 1)
  assert.equal(model.eventos.find(event => event.chave === '').leads, 1)
  const detail = await rpc('eventos_listar', ['2027.1','feira a','',0], '$1,$2,$3,$4')
  assert.equal(detail.total, 10)
  assert.equal(detail.linhas.find(row => row.linha_origem===8).criterio, 'email_telefone')
  assert.equal(detail.linhas.find(row => row.linha_origem===7).situacao, 'sem_identificador')
  assert.equal(detail.linhas.find(row => row.linha_origem===6).situacao, 'conflito')
  assert.ok(detail.linhas.every(row => !('cpf' in row)))
  await db.exec('reset role')
  await db.exec("insert into matriculados_20271 values('22222222222','b@example.test','2027.1','MEDICINA','ATIVO','CALOURO')")
  await actor(2)
  model = await dashboard(); assert.equal(feira().matriculados, 1, 'Normal reads use the 24h cache')
  model = await dashboard('2027.1',true); assert.equal(feira().matriculados, 2, 'Manual refresh recalculates new source loads')
  const missing = await dashboard('2026.1')
  assert.deepEqual(missing.fontes_ausentes, ['inscritos','matriculados'])
  assert.equal(missing.eventos[0].inscritos, null); assert.equal(missing.eventos[0].matriculados, null)
  await assert.rejects(() => dashboard('2027.1;drop table profiles'), e => e.code==='22023')
  await assert.rejects(() => importRows([{linha:2,nome:4}],'b'.repeat(64)), e => e.code==='22023')
  await assert.rejects(() => importRows([{linha:2,cpf:'11111111111'}],'b'.repeat(64)), e => e.code==='22023')
  await assert.rejects(() => db.query('select * from public.eventos_leads'), e => e.code==='42501')
  await actor(3)
  await assert.rejects(() => rpc('eventos_listar',['2027.1','feira a','',0],'$1,$2,$3,$4'), e => e.code==='42501')
  await db.exec('reset role; set role anon')
  await assert.rejects(() => dashboard(), e => e.code==='42501')
  console.log('PASS: Events SQL migration/idempotency, exclusive verified identities, RLS/RPC guards, nullable fields, file reimports, phone/email normalization, conservative candidate linkage, conflicts, guardian exclusion, unique conversion counts, active calouros, caching/manual refresh, missing sources and injection guards.')
} catch (error) {
  console.error({ message: error.message, code: error.code, detail: error.detail, where: error.where, internalQuery: error.internalQuery, actual: error.actual, expected: error.expected })
  process.exitCode = 1
} finally { await db.close() }
