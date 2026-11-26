import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { isMedicine } from '../src/lib/campaignData.ts'

assert.equal(isMedicine({ Curso: '  medicina  ' }), true)
assert.equal(isMedicine({ curso: 'MEDICINA VETERINÁRIA' }), false)
assert.equal(isMedicine({ curso: 'BIOMEDICINA' }), false)
const { chromium } = await import(pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5193', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((ready, reject) => {
    const t = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', (d) => { if (String(d).includes('Local:')) { clearTimeout(t); ready() } })
    server.on('exit', (code) => { clearTimeout(t); reject(new Error('Vite exited ' + code)) })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.setDefaultTimeout(20000)
  await page.addInitScript(() => { const NativeDate = Date; window.Date = class extends NativeDate { constructor(...args) { args.length ? super(...args) : super('2026-11-17T15:00:00Z') } static now() { return NativeDate.now() } } })
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort())
  await page.route('**/src/main.tsx', (r) => r.fulfill({ contentType: 'application/javascript', body: "import '/tools/dashboard-medicine-preview-entry.tsx';" }))
  await page.route('**/rest/v1/**', (r) => {
    const url = new URL(r.request().url()), table = url.pathname.split('/').at(-1)
    const match = /^(inscritos|matriculados)_(\d{4})([12])$/.exec(table)
    let rows = []
    if (match) {
      const period = match[2] + '.' + match[3], year = Number(match[2]) - (match[3] === '1' ? 1 : 0)
      rows = [
        { cpf: '11111111111', curso: 'MEDICINA', campus: 'Asa Sul', turno: 'INTEGRAL', forma_de_ingresso: 'PROUNI', data_inscricao: `${year}-11-12`, data_baixa_do_pagamento: `${year}-11-12` },
        { cpf: '22222222222', curso: 'DIREITO', campus: 'Águas Claras', turno: 'NOTURNO', forma_de_ingresso: 'Vestibular', data_inscricao: `${year}-11-10`, data_baixa_do_pagamento: `${year}-11-10` },
        { cpf: '44444444444', curso: ' Medicina ', campus: 'Asa Sul', turno: 'INTEGRAL', forma_de_ingresso: 'PROUNI', data_inscricao: `${year}-11-20`, data_baixa_do_pagamento: `${year}-11-20` },
      ].map((row) => ({ ...row, data_de_matricula: row.data_baixa_do_pagamento, ano_semestre: period, periodo_letivo: period, filial: row.campus, tipo_de_ingresso: row.forma_de_ingresso, tipo_aluno: 'CALOURO', contrato: 'ATIVO', nivel_de_ensino: 'GRADUAÇÃO' }))
    } else if (table === 'leads_cursos') rows = [
      { cpf: '11111111111', curso: 'Medicina', campus: 'Asa Sul', ano_semestre: '2027.1', created_at: '2026-11-15T03:00:00Z' },
      { cpf: '22222222222', curso: 'Direito', campus: 'Águas Claras', ano_semestre: '2027.1', created_at: '2026-11-15T03:00:00Z' },
      { cpf: '44444444444', curso: 'Direito', campus: 'Águas Claras', ano_semestre: '2026.1', created_at: '2026-11-15T03:00:00Z' },
    ]
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) })
  })
  const kpi = (label) => page.locator('article').filter({ has: page.getByText(label, { exact: true }) })
  const total = async (label, value) => kpi(label).getByText(String(value), { exact: true }).waitFor()
  const toggle = () => page.getByRole('switch', { name: 'Com Medicina', exact: true })
  await mkdir('outputs/dashboard-medicine-check', { recursive: true })
  await page.goto('http://127.0.0.1:5193')
  await total('Leads', 3); await total('Inscritos', 3); await total('Matriculados', 3)
  assert.equal(await toggle().getAttribute('aria-checked'), 'true')
  await toggle().click()
  await total('Leads', 1); await total('Inscritos', 1); await total('Matriculados', 1)
  await page.waitForFunction(() => ![...document.querySelectorAll('.recharts-cartesian-axis-tick-value')].some((node) => node.textContent === 'Medicina'))
  assert.equal(await page.getByRole('button', { name: 'Somente tráfego pago', exact: true }).count(), 0, 'Lead membership alone is not paid-traffic attribution')
  await total('Inscritos', 1); await total('Matriculados', 1)
  await page.getByRole('button', { name: 'Calouros', exact: true }).click()
  await total('Inscritos', 1); await total('Matriculados', 1)
  await page.getByRole('button', { name: 'Todos', exact: true }).click()
  await toggle().click()
  await total('Inscritos', 3)
  const course = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Curso', exact: true }) })
  await page.waitForTimeout(1800)
  const tick = await course.locator('.recharts-cartesian-axis-tick').filter({ hasText: /^Medicina$/ }).boundingBox()
  const bars = course.locator('.recharts-bar-rectangle')
  let closest = 0, distance = Infinity
  for (let index = 0; index < await bars.count(); index++) {
    const box = await bars.nth(index).boundingBox()
    if (box && Math.abs(box.y + box.height / 2 - tick.y - tick.height / 2) < distance) {
      closest = index
      distance = Math.abs(box.y + box.height / 2 - tick.y - tick.height / 2)
    }
  }
  await bars.nth(closest).click()
  await total('Inscritos', 2)
  await toggle().click()
  await total('Inscritos', 1)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'outputs/dashboard-medicine-check/funil-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
  await toggle().screenshot({ path: 'outputs/dashboard-medicine-check/funil-toggle-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://127.0.0.1:5193/?historico=1')
  await total('Inscritos', 12); await total('Calouros', 12)
  await toggle().click()
  await total('Inscritos', 4); await total('Calouros', 4)
  await page.waitForFunction(() => ![...document.querySelectorAll('.recharts-cartesian-axis-tick-value')].some((node) => node.textContent === 'Medicina'))
  await page.getByRole('button', { name: 'Até a data atual', exact: true }).click()
  await total('Inscritos', 4); await total('Calouros', 4)
  await toggle().click()
  await total('Inscritos', 8); await total('Calouros', 8)
  await toggle().click()
  await page.getByRole('button', { name: 'PS - 2º Semestre', exact: true }).click()
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click()
  await total('Inscritos', 4); await total('Calouros', 4)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'outputs/dashboard-medicine-check/historico-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'outputs/dashboard-medicine-check/historico-mobile.png', fullPage: true })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, { timeout: 5000 })
  await toggle().screenshot({ path: 'outputs/dashboard-medicine-check/historico-toggle-mobile.png' })
  assert.deepEqual(errors, [])
  console.log('Medicine toggle: both dashboards, lead-linked totals/charts, student type, course selection reset, date cut, both semesters and mobile passed.')
} finally { if (browser) await browser.close(); server.kill() }
