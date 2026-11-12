import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { coherentFixture } from './test-capture-coherence.mjs'

const { chromium } = await import(pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((ready, reject) => { const timeout = setTimeout(() => reject(new Error('Vite timeout')), 15000); server.stdout.on('data', (data) => { if (String(data).includes('Local:')) { clearTimeout(timeout); ready() } }); server.on('exit', (code) => { clearTimeout(timeout); reject(new Error('Vite exited ' + code)) }) })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], data = coherentFixture()
  const output = resolve('outputs/executive-check'); await mkdir(output, { recursive: true })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => { const NativeDate = Date; window.Date = class extends NativeDate { constructor(...args) { args.length ? super(...args) : super('2026-11-12T15:00:00Z') } static now() { return new NativeDate('2026-11-12T15:00:00Z').valueOf() } } })
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').at(-1), match = /^(inscritos|matriculados)_(\d{4})([12])$/.exec(table)
    const source = match ? data.find((source) => source.period === `${match[2]}.${match[3]}`) : null
    const rows = match ? source?.[match[1]] ?? [] : [], offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows.slice(offset, offset + limit)) })
  })
  await page.route('**/auth/v1/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }))
  let entry = 'executive-preview-entry.tsx'
  await page.route('**/src/main.tsx', (route) => route.fulfill({ contentType: 'application/javascript', body: `import '/tools/${entry}';` }))
  await page.goto('http://127.0.0.1:5188')
  await page.getByRole('tab', { name: 'Projeção 2027.1', exact: true }).click()
  const cards = page.getByLabel('Projeções por indicador'), cal = cards.locator('article').filter({ has: page.getByRole('heading', { name: 'Calouros', exact: true }) })
  await cal.getByText('729', { exact: true }).waitFor()
  await cal.getByText('Cenário parcial', { exact: true }).waitFor()
  await page.getByLabel('Medicina na projeção').getByText(/65 já confirmadas/).waitFor()
  const stock = page.getByLabel('Base histórica utilizada')
  assert.equal(await stock.locator('tbody tr').nth(0).locator('td').nth(1).innerText(), '689')
  assert.equal(await stock.locator('tbody tr').nth(1).locator('td').nth(1).innerText(), '689')
  await stock.getByText('427', { exact: true }).first().waitFor()
  await cards.screenshot({ path: resolve(output, 'coherent-forecast-desktop.png') })
  await stock.screenshot({ path: resolve(output, 'historical-stock-desktop.png') })
  const planning = page.getByLabel('Planejamento da campanha')
  await planning.getByLabel('Direção do grupo selecionado').getByText('729', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await cards.screenshot({ path: resolve(output, 'coherent-forecast-mobile.png') })
  entry = 'historical-preview-entry.tsx'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:5188/?historico=1')
  await page.getByRole('heading', { name: 'Comparativo de inscritos e matriculados', exact: true }).waitFor()
  const temporal = page.getByLabel('Recorte temporal do histórico')
  const enrollmentKpi = page.locator('article').filter({ has: page.getByText('Matriculados', { exact: true }) })
  await enrollmentKpi.getByText('1.875', { exact: true }).waitFor()
  await temporal.getByRole('button', { name: 'Até a data atual', exact: true }).click()
  await enrollmentKpi.getByText('79', { exact: true }).waitFor()
  await temporal.getByText('2024.1: 12/11/2023', { exact: true }).waitFor()
  await temporal.getByText('2027.1: 12/11/2026', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(output, 'history-date-cut-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Historical dashboard mobile overflow')
  await temporal.screenshot({ path: resolve(output, 'history-date-cut-mobile.png') })
  await temporal.getByRole('button', { name: 'Visão geral', exact: true }).click()
  await enrollmentKpi.getByText('1.875', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Coerencia visual: conversao sem inflacao, Medicina parcial, base 689/689/427, plano consistente e Historico geral versus mesma data verificados em desktop/mobile.')
} finally { if (browser) await browser.close(); server.kill() }
