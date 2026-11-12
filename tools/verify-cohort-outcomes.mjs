import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { cohortFixture } from './test-cohort-outcomes.mjs'

const { chromium } = await import(pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((ready, reject) => { const timeout = setTimeout(() => reject(new Error('Vite timeout')), 15000); server.stdout.on('data', (data) => { if (String(data).includes('Local:')) { clearTimeout(timeout); ready() } }); server.on('exit', (code) => { clearTimeout(timeout); reject(new Error('Vite exited ' + code)) }) })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], data = cohortFixture()
  const output = resolve('outputs/executive-check'); await mkdir(output, { recursive: true })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1), match = /^(inscritos|matriculados)_(\d{4})([12])$/.exec(table)
    const source = match ? data.find((source) => source.period === `${match[2]}.${match[3]}`) : null
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(match ? source?.[match[1]] ?? [] : []) })
  })
  await page.route('**/auth/v1/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.route('**/src/main.tsx', (route) => route.fulfill({ contentType: 'application/javascript', body: "import '/tools/executive-preview-entry.tsx';" }))
  await page.goto('http://127.0.0.1:5189')
  const panel = page.getByLabel('Destino da turma de entrada', { exact: true })
  await panel.getByLabel('Período de acompanhamento', { exact: true }).selectOption('2025.1')
  const value = (label) => panel.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd')
  await value('Continuam ativos no recorte').filter({ hasText: /^4\s/ }).waitFor()
  await value('Prováveis concluintes').filter({ hasText: /^2\s/ }).waitFor()
  await value('Sem vínculo ativo localizado').filter({ hasText: /^4\s/ }).waitFor()
  await page.getByRole('button', { name: 'Curso', exact: true }).click()
  const options = page.getByRole('group', { name: 'Opções de Curso', exact: true })
  await options.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await options.getByRole('checkbox', { name: 'Direito', exact: true }).check()
  await page.getByRole('button', { name: 'Curso', exact: true }).click()
  await value('Continuam ativos no recorte').filter({ hasText: /^3\s/ }).waitFor()
  await value('Ativos em outro recorte da IES').filter({ hasText: /^1\s/ }).waitFor()
  await panel.screenshot({ path: resolve(output, 'cohort-outcomes-desktop.png') })
  await panel.getByLabel('Período de acompanhamento', { exact: true }).selectOption('2027.1')
  await panel.getByRole('status').filter({ hasText: 'ainda está parcial' }).waitFor()
  await panel.getByLabel('Turma de entrada', { exact: true }).selectOption('2025.1')
  assert.equal(await panel.getByLabel('Período de acompanhamento', { exact: true }).locator('option[value="2024.2"]').count(), 0)
  await panel.getByLabel('Turma de entrada', { exact: true }).selectOption('2024.1')
  await panel.getByLabel('Período de acompanhamento', { exact: true }).selectOption('2025.1')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await panel.screenshot({ path: resolve(output, 'cohort-outcomes-mobile.png') })
  assert.deepEqual(errors, [])
  console.log('Turmas: resumo, seletores, filtros sem falsa evasao, aviso parcial e layout desktop/mobile verificados no navegador.')
} finally { await browser?.close(); server.kill() }
