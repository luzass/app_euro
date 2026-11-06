import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href : 'playwright')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5184', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server startup timeout')), 15000)
    server.stdout.on('data', (data) => { if (String(data).includes('Local:')) { clearTimeout(timer); resolveReady() } })
    server.on('error', (error) => { clearTimeout(timer); reject(error) })
    server.on('exit', (code) => { clearTimeout(timer); reject(new Error('Test server exited: ' + code)) })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const output = resolve('outputs/renewal-check')
  await mkdir(output, { recursive: true })
  const row = (cpf, aluno, curso, periodo, periodoLetivo = '2026.2', extra = {}) => ({ cpf, aluno, curso, periodo, periodo_letivo: periodoLetivo, contrato: 'ATIVO', filial: 'ASA SUL', turno: 'NOTURNO', tipo_de_ingresso: 'VESTIBULAR', tipo_aluno: 'VETERANO', ...extra })
  const origins = [
    row('1', 'Ana Exemplo', 'DIREITO', 5), row('00000000001', 'Ana Exemplo', 'DIREITO', 5),
    row('2', 'Bruno Exemplo', 'DIREITO', 10), row('3', 'Carla Exemplo', 'MEDICINA', 12),
    row('4', 'Daniel Exemplo', 'MEDICINA', 10), row('5', 'Elisa Exemplo', 'PSICOLOGIA', 4),
    row('6', 'Fabio Exemplo', 'DIREITO', 3), row('7', 'Gabriela Exemplo', 'DIREITO', 5),
    row('8', 'Hugo Exemplo', 'DIREITO', ''), row('9', 'Isabela Exemplo', 'DIREITO', 2, '2026.2', { contrato: 'CANCELADO' }),
  ]
  const targets = [
    row('1', 'Ana Exemplo', 'DIREITO', 6, '2027.1'), row('4', 'Daniel Exemplo', 'MEDICINA', 11, '2027.1'),
    row('6', 'Fabio Exemplo', 'PSICOLOGIA', 4, '2027.1'), row('7', 'Gabriela Exemplo', 'DIREITO', 6, '2027.1', { contrato: 'CANCELADO' }),
    row('10', 'Julia Exemplo', 'DIREITO', 1, '2027.1'),
  ]
  let emptyTarget = false
  const errors = []
  const requestedTables = new Set()
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message) })
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    requestedTables.add(table)
    // These are deliberately stored in an unrelated table to check periodo_letivo.
    const rows = table === 'matriculados_20241' ? origins : table === 'matriculados_20271' && !emptyTarget ? targets : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.route('**/auth/v1/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.route('**/src/main.tsx', (route) => route.fulfill({ contentType: 'application/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; import {RenovacaoMatriculas} from '/src/pages/RenovacaoMatriculas.tsx'; import '/src/index.css'; ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main', {style:{padding:'24px',background:'#f8fafc'}}, React.createElement(RenovacaoMatriculas)));` }))
  await page.goto('http://127.0.0.1:5184')
  await page.getByRole('heading', { name: 'Renovação de matrículas', exact: true }).waitFor()
  const kpi = (title) => page.getByLabel('Indicadores de renovação', { exact: true }).locator('article').filter({ has: page.getByText(title, { exact: true }) })
  await kpi('Base ativa de origem').getByText('8', { exact: true }).waitFor()
  await kpi('Prováveis concluintes').getByText('2', { exact: true }).waitFor()
  await kpi('Elegíveis para renovar').getByText('6', { exact: true }).waitFor()
  await kpi('Renovaram').getByText('3', { exact: true }).waitFor()
  await kpi('Sem renovação ativa localizada').getByText('3', { exact: true }).waitFor()
  await kpi('Taxa de renovação').getByText('50%', { exact: true }).waitFor()
  assert.equal(requestedTables.size, 7)
  assert.ok([...requestedTables].every((table) => table.startsWith('matriculados_')))
  assert.ok(!requestedTables.has('matriculados_20272'))
  await page.getByText('Renovação em outro curso', { exact: true }).waitFor()

  await page.getByRole('button', { name: 'Curso de origem', exact: true }).click()
  const courses = page.getByRole('group', { name: 'Opções de Curso de origem', exact: true })
  await courses.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await kpi('Base ativa de origem').getByText('0', { exact: true }).waitFor()
  await courses.getByRole('checkbox', { name: 'Medicina', exact: true }).check()
  await kpi('Base ativa de origem').getByText('2', { exact: true }).waitFor()
  await kpi('Taxa de renovação').getByText('100%', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()

  const chart = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Renovação por curso de origem', exact: true }) })
  await chart.locator('.recharts-bar').first().locator('.recharts-bar-rectangle path').first().click()
  await kpi('Base ativa de origem').getByText('5', { exact: true }).waitFor()
  await chart.locator('.recharts-bar').first().locator('.recharts-bar-rectangle path').nth(1).click({ modifiers: ['Control'] })
  await kpi('Base ativa de origem').getByText('7', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()

  await page.getByRole('button', { name: 'Situação na lista', exact: true }).click()
  const statuses = page.getByRole('group', { name: 'Opções de Situação na lista', exact: true })
  await statuses.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await statuses.getByRole('checkbox', { name: 'Sem renovação ativa localizada', exact: true }).check()
  assert.equal(await page.locator('tbody tr').count(), 3)
  await kpi('Taxa de renovação').getByText('50%', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  await page.getByLabel('Buscar aluno', { exact: true }).fill('Fabio')
  assert.equal(await page.locator('tbody tr').count(), 1)
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()

  await page.getByLabel('Comparação entre períodos letivos', { exact: true }).selectOption('2024.1')
  await kpi('Base ativa de origem').getByText('0', { exact: true }).waitFor()
  await page.getByLabel('Comparação entre períodos letivos', { exact: true }).selectOption('2026.2')
  await kpi('Base ativa de origem').getByText('8', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow')
  emptyTarget = true
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sem base utilizável no período letivo 2027.1' }).waitFor()
  await kpi('Taxa de renovação').getByText('—', { exact: true }).waitFor()
  await kpi('Sem renovação ativa localizada').getByText('—', { exact: true }).waitFor()
  await kpi('Prováveis concluintes').getByText('2', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Renovação: fonte por período letivo, concluintes, filtros, mudança de curso, base pendente e desktop/mobile verificados com dados fictícios.')
} finally {
  if (browser) await browser.close()
  server.kill()
}
