import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { enrollmentParityFixture } from './test-enrollment-comparison-parity.mjs'

const { chromium } = await import(pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', data => { if (String(data).includes('Local:')) { clearTimeout(timer); ready() } })
    server.on('exit', code => { clearTimeout(timer); reject(new Error('Vite exited ' + code)) })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  await page.clock.install({ time: new Date('2026-11-26T15:00:00Z') })
  await page.addInitScript(() => localStorage.setItem('unieuro.executivo.calendario.20271.v1', JSON.stringify({ start: '2026-09-29', end: '2027-03-31', matriculaDate: 'payment' })))
  const data = enrollmentParityFixture(), errors = []
  for (const source of data) source.matriculados.push({ ...source.matriculados[0], cpf: '88888888889', curso: 'MEDICINA' })
  let entry = 'executive-preview-entry.tsx', requests = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://fonts.googleapis.com/**', route => route.abort())
  await page.route('https://fonts.gstatic.com/**', route => route.abort())
  await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'application/javascript', body: `import '/tools/${entry}';` }))
  await page.route('**/rest/v1/**', route => {
    requests++
    const url = new URL(route.request().url()), table = url.pathname.split('/').at(-1)
    const match = /^(inscritos|matriculados)_(\d{4})([12])$/.exec(table)
    const rows = match ? data.find(source => source.period === `${match[2]}.${match[3]}`)?.[match[1]] ?? [] : []
    const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows.slice(offset, offset + limit)) })
  })
  await page.goto('http://127.0.0.1:5196/?visao=projecao')
  const comparison = page.getByLabel('Comparação na mesma data', { exact: true })
  const calouros = comparison.locator('article').filter({ has: page.getByRole('heading', { name: 'Calouros na mesma data', exact: true }) })
  const values = async () => calouros.locator('tbody tr').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector('th').textContent, Number(row.querySelectorAll('td')[1].textContent)])))
  await comparison.waitFor()
  const withMedicine = { '2024.1': 5, '2025.1': 5, '2026.1': 5, '2027.1': 5 }
  assert.deepEqual(await values(), withMedicine)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('unieuro.executivo.calendario.20271.v1')).matriculaDate), 'enrollment', 'Old saved payment setting is migrated')
  assert.equal(await page.getByRole('combobox', { name: 'Data das matrículas', exact: true }).count(), 0)
  await page.getByText('Data da matrícula · contrato ativo', { exact: true }).waitFor()
  const medicine = () => page.getByRole('switch', { name: 'Com Medicina', exact: true })
  assert.equal(await medicine().getAttribute('aria-checked'), 'true')
  const beforeFilters = requests
  await medicine().click()
  const withoutMedicine = { '2024.1': 4, '2025.1': 4, '2026.1': 4, '2027.1': 4 }
  assert.deepEqual(await values(), withoutMedicine)
  assert.equal(requests, beforeFilters, 'Medicine switch is local, without extra database queries')
  await medicine().click()
  await page.getByRole('button', { name: 'Curso', exact: true }).click()
  const courses = page.getByRole('group', { name: 'Opções de Curso', exact: true })
  await courses.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await courses.getByRole('checkbox', { name: 'Medicina', exact: true }).check()
  await page.keyboard.press('Escape')
  assert.deepEqual(await values(), { '2024.1': 2, '2025.1': 2, '2026.1': 2, '2027.1': 2 })
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  data.at(-1).matriculados.push({ ...data.at(-1).matriculados[0], cpf: '11111111119' })
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Atualizar')?.disabled)
  const updated = { ...withMedicine, '2027.1': 6 }
  for (let i = 0; i < 60 && JSON.stringify(await values()) !== JSON.stringify(updated); i++) await page.waitForTimeout(50)
  assert.deepEqual(await values(), updated)
  await mkdir('outputs/enrollment-parity-check', { recursive: true })
  await comparison.screenshot({ path: 'outputs/enrollment-parity-check/executivo-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
  await comparison.screenshot({ path: 'outputs/enrollment-parity-check/executivo-mobile.png' })
  entry = 'historical-preview-entry.tsx'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:5196/?historico=1')
  await page.getByRole('button', { name: 'Até a data atual', exact: true }).click()
  const evolution = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Evolução por período', exact: true }) })
  const historyValues = async () => evolution.locator('.recharts-line').nth(1).locator('.recharts-label-list text').allTextContents()
  const expectHistory = async expected => {
    for (let i = 0; i < 80 && JSON.stringify(await historyValues()) !== JSON.stringify(expected); i++) await page.waitForTimeout(50)
    assert.deepEqual(await historyValues(), expected)
  }
  await expectHistory(['5', '5', '5', '6'])
  assert.equal(await medicine().getAttribute('aria-checked'), 'true')
  assert.equal(await page.getByRole('combobox', { name: 'Contratos das matrículas no histórico', exact: true }).count(), 0)
  await medicine().click()
  await expectHistory(['4', '4', '4', '5'])
  await medicine().click()
  await expectHistory(['5', '5', '5', '6'])
  await evolution.screenshot({ path: 'outputs/enrollment-parity-check/historico-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
  await evolution.screenshot({ path: 'outputs/enrollment-parity-check/historico-mobile.png' })
  assert.deepEqual(errors, [])
  console.log('PASS: Both real pages show matching calouro curves, enrollment-only dates, active contracts, default medicine/optional exclusion, course filtering, old calendar migration, updated loads and desktop/mobile layouts.')
} finally { await browser?.close(); server.kill() }
