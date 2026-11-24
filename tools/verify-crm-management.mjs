import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { managementFixture } from './test-crm-management.mjs'
const { chromium } = await import(
  pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href
)
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5192', '--strictPort'],
  { windowsHide: true, stdio: 'pipe' },
)
let browser
try {
  await new Promise((ready, reject) => {
    const t = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', (d) => {
      if (String(d).includes('Local:')) {
        clearTimeout(t)
        ready()
      }
    })
    server.on('exit', (code) => {
      clearTimeout(t)
      reject(new Error('Vite exited ' + code))
    })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }),
    page = await context.newPage(),
    errors = [],
    calls = []
  await page.clock.install({ time: new Date('2026-11-17T18:00:00Z') })
  page.on('pageerror', (e) => errors.push(e.message))
  page.setDefaultTimeout(20000)
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort())
  await page.route('**/src/main.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: "import '/tools/crm-management-preview-entry.tsx';",
    }),
  )
  const fixture = managementFixture()
  fixture.contacts.find((c) => c.id === 'lead-converted').intake_visible = false
  let missing = false
  await page.route('**/rest/v1/**', async (r) => {
    const name = new URL(r.request().url()).pathname.split('/').at(-1),
      data = r.request().postDataJSON?.() || {}
    calls.push({ name, data })
    if (name === 'crm_kanban_bi_snapshot') {
      if (missing)
        return r.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'not found' }),
        })
      return r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...fixture,
          from: data.p_from,
          to: data.p_to,
          include_tests: data.p_include_tests,
          from_at: data.p_from + 'T03:00:00Z',
          cutoff_at: new Date(Date.parse(data.p_to + 'T03:00:00Z') + 86400000).toISOString(),
          contacts: fixture.contacts.filter((c) => data.p_include_tests || !c.test_only),
        }),
      })
    }
    const rows = fixture.contacts.map((c, i) => ({
      ...c,
      cpf: String(i + 1).padStart(11, '0'),
      source_data: {},
      manual_data: {},
      position: i * 1024,
      version: 1,
      updated_at: c.created_at,
    }))
    let result
    if (name === 'crm_kanban_contacts') result = rows
    else if (name === 'crm_kanban_workspace')
      result = {
        members: fixture.members,
        loss_reasons: [],
        config: {
          loss_version: 1,
          workflow_version: 2,
          cutoff: '2026-11-13',
          include_history: true,
          history_limit: 200,
          last_sync_at: fixture.generated_at,
          last_sync_result: {},
        },
      }
    else if (name === 'crm_kanban_detail')
      result = {
        contact: rows.find((c) => c.id === data.p_id),
        sources: [],
        events: [],
        activities: [],
        has_more_events: false,
      }
    else if (name === 'crm_kanban_persona_course') result = { rows: [], missing: [] }
    else throw new Error('Unexpected request ' + name)
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.goto('http://127.0.0.1:5192/app/gestao-crm?de=2026-11-13&ate=2026-11-17')
  await page.getByRole('heading', { name: 'Carteira atual', exact: true }).waitFor()
  const biCalls = () => calls.filter((c) => c.name === 'crm_kanban_bi_snapshot').length
  const waitForBiCalls = async (expected) => {
    for (let n = 0; n < 80 && biCalls() < expected; n++) await page.waitForTimeout(50)
    assert.equal(biCalls(), expected)
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Atualizar indicadores"]')?.disabled,
    )
  }
  const initialCalls = biCalls()
  await page.clock.fastForward(5 * 60000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(100)
  assert.equal(
    biCalls(),
    initialCalls,
    'BI must not refresh every minute or on focus with a valid cache',
  )
  await page.getByRole('button', { name: 'Atualizar indicadores', exact: true }).click()
  await waitForBiCalls(initialCalls + 1)
  await page.clock.fastForward(23 * 60 * 60000)
  await page.waitForTimeout(100)
  assert.equal(biCalls(), initialCalls + 1, 'Manual refresh restarts the 24h deadline')
  await page.clock.fastForward(60 * 60000 + 1000)
  await waitForBiCalls(initialCalls + 2)
  assert.ok((await page.locator('.recharts-line-curve').count()) >= 3, 'Trend must render')
  await mkdir('outputs/crm-management-check', { recursive: true })
  await page.screenshot({ path: 'outputs/crm-management-check/resumo-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Leads', exact: false }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByPlaceholder('Buscar candidato, curso ou responsável').fill('claimed')
  await page.getByRole('link', { name: 'Abrir ficha' }).click()
  await page.waitForURL('**/app/crm?contato=claimed')
  await page.getByRole('heading', { name: 'Candidato claimed', exact: true, level: 2 }).waitFor()
  await page.goBack()
  await page.getByRole('heading', { name: 'Carteira atual', exact: true }).waitFor()
  assert.equal(
    biCalls(),
    initialCalls + 2,
    'Returning from the Kanban reuses the same session snapshot',
  )
  assert.ok(page.url().includes('de=2026-11-13'))
  await page.getByRole('button', { name: 'Funil', exact: true }).click()
  await page.getByRole('heading', { name: 'Conversão por entrada real' }).waitFor()
  assert.ok((await page.locator('table').nth(1).innerText()).includes('20%'))
  await page.screenshot({ path: 'outputs/crm-management-check/funil-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '1 · 20%', exact: true }).click()
  await page.getByRole('link', { name: 'Abrir ficha', exact: true }).click()
  await page.waitForURL('**/app/crm?contato=lead-converted')
  await page
    .getByRole('heading', { name: 'Candidato lead-converted', exact: true, level: 2 })
    .waitFor()
  assert.equal(
    await page
      .getByRole('button', { name: 'Abrir ficha de Candidato lead-converted', exact: true })
      .count(),
    0,
    'Hidden contact remains available through history, not as a board card',
  )
  await page.goBack()
  await page.getByRole('heading', { name: 'Conversão por entrada real' }).waitFor()
  await page.getByRole('button', { name: 'Equipe', exact: true }).click()
  await page.getByRole('heading', { name: 'Atendimento por responsável' }).waitFor()
  await page.getByRole('button', { name: 'Desistências', exact: true }).click()
  await page.getByRole('heading', { name: 'Motivos de desistência' }).waitFor()
  await page.getByLabel('Curso', { exact: true }).selectOption('Direito')
  await page.getByRole('button', { name: 'Preço / condições', exact: true }).click()
  const dialog = page.getByRole('dialog')
  assert.ok(
    (await dialog.innerText()).includes('Candidato lost'),
    'Historical course snapshot must include contact after transfer',
  )
  assert.ok((await dialog.innerText()).includes('Informado pelo candidato'))
  assert.ok((await dialog.innerText()).includes('Percepção do atendente'))
  await page.getByRole('button', { name: 'Fechar lista' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No page-wide mobile overflow',
  )
  await page.screenshot({
    path: 'outputs/crm-management-check/desistencias-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Resumo', exact: true }).click()
  await page.getByLabel('Curso', { exact: true }).selectOption('')
  await page.getByLabel('Incluir contatos de teste').check()
  await page.waitForFunction(() =>
    document.querySelector('.crm-bi-status')?.textContent.includes('Inclui testes'),
  )
  await page.getByRole('button', { name: 'Leads', exact: false }).first().click()
  await page.getByPlaceholder('Buscar candidato, curso ou responsável').fill('Candidato test')
  await page.getByText('Candidato test', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Fechar lista' }).click()
  await page.getByLabel('Intervalo do gráfico').selectOption('week')
  await page.screenshot({ path: 'outputs/crm-management-check/resumo-mobile.png', fullPage: true })
  await page.goto('http://127.0.0.1:5192/app/gestao-crm?seller=1')
  await page.getByRole('alert').filter({ hasText: 'restrita' }).waitFor()
  const before = calls.filter((c) => c.name === 'crm_kanban_bi_snapshot').length
  await page.waitForTimeout(100)
  assert.equal(calls.filter((c) => c.name === 'crm_kanban_bi_snapshot').length, before)
  missing = true
  await page.goto('http://127.0.0.1:5192/app/gestao-crm')
  await page.getByRole('alert').filter({ hasText: 'crm_kanban_gestao_bi.sql' }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'CRM management browser: 24h refresh, manual bypass, cache on navigation, four views, filters, drilldowns, mobile, role gate and missing migration passed.',
  )
} finally {
  if (browser) await browser.close()
  server.kill()
}
