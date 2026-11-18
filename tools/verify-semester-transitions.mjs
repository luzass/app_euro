import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { transitionsFixture } from './test-semester-transitions.mjs'
const { chromium } = await import(
  pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href
)
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5194', '--strictPort'],
  { windowsHide: true, stdio: 'pipe' },
)
let browser
try {
  await new Promise((ready, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Local:')) {
        clearTimeout(timeout)
        ready()
      }
    })
    server.on('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error('Vite exited ' + code))
    })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [],
    data = transitionsFixture()
  let failTarget = false
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(20000)
  await mkdir('outputs/semester-transitions-check', { recursive: true })
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort())
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "import '/tools/executive-preview-entry.tsx';",
    }),
  )
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (failTarget && table === 'matriculados_20262')
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'TEST_UNAVAILABLE', message: 'Base indisponível no teste' }),
      })
    const match = /^(inscritos|matriculados)_(\d{4})([12])$/.exec(table)
    const source = match ? data.find((item) => item.period === match[2] + '.' + match[3]) : null
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(match ? (source?.[match[1]] ?? []) : []),
    })
  })
  await page.goto('http://127.0.0.1:5194')
  const panel = page.getByLabel('Comparação entre processos consecutivos', { exact: true })
  const metrics = panel.getByLabel('Indicadores da comparação selecionada', { exact: true })
  const value = (label) =>
    metrics
      .locator('div')
      .filter({ has: page.locator('dt', { hasText: new RegExp('^' + label + '$') }) })
      .locator('dd')
  const expectValue = async (label, text) => value(label).filter({ hasText: text }).waitFor()
  await expectValue('Base ativa na origem', /^11\s/)
  assert.equal(
    await panel.getByLabel('Comparação selecionada', { exact: true }).inputValue(),
    '2026.1',
    'Default is the latest closed pair',
  )
  await expectValue('Sem vínculo ativo no PS seguinte', /7\s+·\s+63,6%/)
  await expectValue('Desses, prováveis concluintes', /^2\s/)
  await panel.getByRole('button', { name: 'Calouros', exact: true }).click()
  await expectValue('Base ativa na origem', /^5\s/)
  await expectValue('Sem vínculo ativo no PS seguinte', /3\s+·\s+60%/)
  await panel.getByRole('button', { name: 'Veteranos', exact: true }).click()
  await expectValue('Base ativa na origem', /^4\s/)
  await expectValue('Sem vínculo ativo no PS seguinte', /4\s+·\s+100%/)
  await panel.getByRole('button', { name: 'Geral', exact: true }).click()
  const course = page.getByRole('button', { name: 'Curso do acompanhamento', exact: true })
  await course.click()
  const options = page.getByRole('group', {
    name: 'Opções de Curso do acompanhamento',
    exact: true,
  })
  await options.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await options.getByRole('checkbox', { name: 'Medicina', exact: true }).check()
  await course.click()
  await expectValue('Base ativa na origem', /^4\s/)
  await expectValue('Sem vínculo ativo no PS seguinte', /3\s+·\s+75%/)
  await expectValue('Desses, prováveis concluintes', /^1\s/)
  await panel.screenshot({ path: 'outputs/semester-transitions-check/medicina-desktop.png' })
  await course.click()
  await options.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await options.getByRole('checkbox', { name: 'Direito', exact: true }).check()
  await course.click()
  await expectValue('Base ativa na origem', /^9\s/)
  await expectValue('Continuam ativos na IES', /^4\s/)
  await panel.getByText(/2 pessoas seguem ativas em outro curso/).waitFor()
  await course.click()
  await options.getByRole('button', { name: 'Selecionar todos', exact: true }).click()
  await course.click()
  await expectValue('Base ativa na origem', /^11\s/)
  await panel.getByLabel('Comparação selecionada', { exact: true }).selectOption('2026.2')
  await panel.getByRole('status').filter({ hasText: 'está parcial' }).waitFor()
  await panel.getByLabel('Comparação selecionada', { exact: true }).selectOption('2026.1')
  await panel.screenshot({ path: 'outputs/semester-transitions-check/geral-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
  await panel.screenshot({ path: 'outputs/semester-transitions-check/geral-mobile.png' })
  await panel.getByRole('button', { name: 'Calouros', exact: true }).click()
  await expectValue('Sem vínculo ativo no PS seguinte', /3\s+·\s+60%/)
  await panel.screenshot({ path: 'outputs/semester-transitions-check/calouros-mobile.png' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await panel.getByRole('button', { name: 'Geral', exact: true }).click()
  failTarget = true
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  await panel
    .getByRole('status')
    .filter({ hasText: 'Base de entrada ou acompanhamento indisponível' })
    .waitFor()
  assert.match(await value('Sem vínculo ativo no PS seguinte').innerText(), /^—/)
  assert.match(await value('Continuam ativos na IES').innerText(), /^—/)
  assert.deepEqual(errors, [])
  console.log(
    'Semester transition UI: three views, Medicine, shared course filter, transfers, closed default, partial warning, missing data and desktop/mobile passed.',
  )
} finally {
  await browser?.close()
  server.kill()
}
