import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { executiveFixture } from './test-executive-forecast.mjs'

const { chromium } = await import(pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5198', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', data => { if (String(data).includes('Local:')) { clearTimeout(timer); ready() } })
    server.on('exit', code => { clearTimeout(timer); reject(new Error('Vite exited ' + code)) })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.setDefaultTimeout(45000)
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-11-26T15:00:00Z') })
  const data = executiveFixture()
  data[0].inscritos.push({ ...data[0].inscritos[0], curso: 'BANCO DE DADOS' })
  await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'application/javascript', body: "import '/tools/executive-preview-entry.tsx';" }))
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const match = /^(inscritos|matriculados)_(\d{4})([12])$/.exec(name)
    const rows = match ? data.find(source => source.period === `${match[2]}.${match[3]}`)?.[match[1]] ?? [] : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.goto('http://127.0.0.1:5198/app/painel-executivo?visao=projecao')
  const inactivity = page.getByLabel('Acompanhamento de inatividade', { exact: true })
  const registrations = inactivity.getByLabel('Sem novas inscrições', { exact: true })
  await inactivity.getByText('25 grupos · 1/4', { exact: true }).first().waitFor()
  assert.equal(await inactivity.getByRole('button', { name: /Banco de Dados/ }).count(), 0)
  await inactivity.getByLabel('Buscar curso ou campus na inatividade').fill('Administração / Asa Sul')
  assert.equal(await registrations.locator('tbody tr').count(), 1)
  assert.equal(await registrations.locator('tbody td').first().innerText(), '0')
  await registrations.getByRole('button', { name: 'Administração / Asa Sul', exact: true }).click()
  assert.equal(await page.getByLabel('Grupo no gráfico', { exact: true }).inputValue(), 'Administração / Asa Sul', 'Zero-event offer must open its own group, not General')
  await inactivity.getByLabel('Buscar curso ou campus na inatividade').fill('')
  await page.getByRole('switch', { name: 'Com Medicina', exact: true }).click()
  await inactivity.getByText('24 grupos · 1/3', { exact: true }).first().waitFor()
  await inactivity.getByLabel('Buscar curso ou campus na inatividade').fill('Medicina')
  assert.equal(await inactivity.getByRole('button', { name: 'Medicina / Asa Sul', exact: true }).count(), 0)
  await page.getByRole('switch', { name: 'Com Medicina', exact: true }).click()
  await inactivity.getByRole('button', { name: 'Medicina / Asa Sul', exact: true }).first().waitFor()
  await inactivity.getByLabel('Buscar curso ou campus na inatividade').fill('')
  await page.getByRole('button', { name: 'Curso', exact: true }).click()
  const courses = page.getByRole('group', { name: 'Opções de Curso', exact: true })
  await courses.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await courses.getByRole('checkbox', { name: 'Ciências Contábeis', exact: true }).check()
  await page.keyboard.press('Escape')
  await inactivity.getByText('2 grupos · 1/1', { exact: true }).first().waitFor()
  assert.equal(await registrations.locator('tbody tr').count(), 2)
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  await inactivity.getByText('25 grupos · 1/4', { exact: true }).first().waitFor()
  await inactivity.getByLabel('Agrupar acompanhamento de inatividade').selectOption('curso')
  await inactivity.getByText('14 grupos · 1/2', { exact: true }).first().waitFor()
  await inactivity.getByLabel('Agrupar acompanhamento de inatividade').selectOption('campus')
  await inactivity.getByText('2 grupos · 1/1', { exact: true }).first().waitFor()
  await inactivity.getByLabel('Agrupar acompanhamento de inatividade').selectOption('curso_campus')
  const output = 'outputs/course-offerings-check'
  await mkdir(output, { recursive: true })
  await inactivity.screenshot({ path: `${output}/desktop.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await inactivity.screenshot({ path: `${output}/mobile.png` })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page overflow')
  assert.deepEqual(errors, [])
  console.log('PASS: Current-offer groups, absent historical courses, zero-event drilldown, Medicine toggle, zero-event course filter, grouping and desktop/mobile layouts.')
} finally {
  if (browser) await browser.close()
  server.kill()
}
