import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href : 'playwright')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5182', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
await new Promise((resolveReady, reject) => {
  const timer = setTimeout(() => { server.kill(); reject(new Error('Test server startup timeout')) }, 15000)
  server.stdout.on('data', (data) => { if (String(data).includes('Local:')) { clearTimeout(timer); resolveReady() } })
  server.on('error', (error) => { clearTimeout(timer); reject(error) })
  server.on('exit', (code) => { clearTimeout(timer); reject(new Error('Test server exited: ' + code)) })
})
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const output = resolve('outputs/profile-check')
await mkdir(output, { recursive: true })
const common = { curso: 'DIREITO', filial: 'ASA SUL', turno: 'NOTURNO', tipo_de_ingresso: 'VESTIBULAR', tipo_aluno: 'CALOURO', contrato: 'ATIVO', data_de_matricula: '04/11/2026' }
const rows = [
  { ...common, cpf: '11111111111', cep: '01234567', data_de_nascimento: '01/01/2000', tipo_escola: 'PÚBLICA', escola: 'COLÉGIO ESTADUAL EXEMPLO', sexo: 'F', bairro_cep: 'Centro', cidade_cep: 'Brasília', estado_cep: 'DF' },
  { ...common, cpf: '22222222222', cep: '12345678', data_de_nascimento: '01/01/2008', tipo_escola: 'PRIVADA', sexo: 'M' },
  { ...common, cpf: '33333333333', cep: '12345678', data_de_nascimento: '01/01/1990', tipo_escola: 'PRIVADA', escola: 'COLÉGIO PARTICULAR EXEMPLO', sexo: 'F', filial: 'ÁGUAS CLARAS', turno: 'MATUTINO' },
  { ...common, cpf: '44444444444', tipo_aluno: 'VETERANO', contrato: 'CANCELADO' },
  { ...common, cpf: '11111111111', contrato: 'CANCELADO' },
]
const cache = [{ cep: '12345678', bairro: 'Bairro de nome comprido para verificar o painel', cidade: 'Brasília', estado: 'DF', erro: false }]
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  const requestedTables = new Set()
  let denyCache = false
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser:', error.message) })
  page.on('console', (message) => { if (message.type() === 'error') console.error('Console:', message.text()) })
  await page.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    requestedTables.add(table)
    if (table === 'ceps_enriquecidos' && denyCache) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'permission denied', code: '42501' }) })
    const periodRows = table === 'matriculados_20242' ? [] : rows.map((row) => table === 'matriculados_20241' && row.cpf === '11111111111' ? { ...row, curso: 'PSICOLOGIA' } : row)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'ceps_enriquecidos' ? cache : periodRows) })
  })
  await page.route('**/auth/v1/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.route('**/src/main.tsx', (route) => route.fulfill({ contentType: 'application/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; import {PerfilMatriculado} from '/src/pages/PerfilMatriculado.tsx'; import '/src/index.css'; ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main', {style:{padding:'24px',background:'#f8fafc'}}, React.createElement(PerfilMatriculado)));` }))
  await page.goto('http://127.0.0.1:5182')
  await page.getByRole('heading', { name: 'Perfil do matriculado', exact: true }).waitFor()
  const total = page.locator('article').filter({ hasText: 'Matriculados no perfil' })
  await total.getByText('4', { exact: true }).waitFor()
  assert.equal(await page.locator('article').count(), 13)
  assert.ok([...requestedTables].every((table) => table === 'ceps_enriquecidos' || /^matriculados_202[4-7][12]$/.test(table)))
  assert.ok(!requestedTables.has('matriculados_20272'))
  assert.ok(requestedTables.has('matriculados_20241'))
  assert.ok(requestedTables.has('matriculados_20271'))
  await page.locator('article').filter({ hasText: 'Idade mediana na matrícula' }).getByText('26 anos', { exact: true }).waitFor()
  await page.getByLabel('Curso', { exact: true }).selectOption('Psicologia')
  await total.getByText('1', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await page.getByLabel('Tipo de aluno', { exact: true }).selectOption('calouro')
  await total.getByText('3', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  const schoolChart = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Tipo de escola', exact: true }) })
  await schoolChart.locator('.recharts-bar-rectangle path').first().click()
  await total.getByText('2', { exact: true }).waitFor()
  await schoolChart.locator('.recharts-bar-rectangle path').nth(1).click({ modifiers: ['Control'] })
  await total.getByText('3', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await page.getByLabel('Processo seletivo', { exact: true }).selectOption('2024.2')
  await total.getByText('0', { exact: true }).waitFor()
  await page.getByLabel('Processo seletivo', { exact: true }).selectOption('all')
  await total.getByText('4', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow')
  denyCache = true
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Cache de CEP indisponível' }).waitFor()
  await total.getByText('4', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Perfil: desktop/mobile, filtros, Ctrl+clique e cache indisponível verificados com dados fictícios.')
} finally {
  await browser.close()
  server.kill()
}
