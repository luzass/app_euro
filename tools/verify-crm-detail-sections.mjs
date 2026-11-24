import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { detailPageFixture } from './crm-detail-page-fixture.mjs'
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage(), errors = [], calls = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  page.setDefaultTimeout(10000)
  await page.route('https://fonts.googleapis.com/**', r => r.abort())
  await page.route('https://fonts.gstatic.com/**', r => r.abort())
  await page.route('**/src/main.tsx', r => r.fulfill({ contentType: 'application/javascript', body: "import '/tools/crm-detail-sections-preview-entry.tsx'" }))
  const makeContact = (id, version = 1) => ({
    id: 'contact-' + id, cpf: String(id).padStart(11, '0'), owner_id: 'seller-1', stage: 'inscrito', position: 1,
    current_data: { nome: 'Candidate ' + id, curso: 'Direito' }, has_inscription: true,
    official_enrollment: false, test_only: false, archived: false, checklist: {}, next_action_at: null,
    stage_entered_at: '2020-01-01T12:00:00Z', version, created_at: '2020-01-01T12:00:00Z', updated_at: '2020-01-01T12:00:00Z',
  })
  const contacts = new Map([1, 2, 3, 4].map(id => ['contact-' + id, makeContact(id)]))
  const activities = Array.from({ length: 123 }, (_, i) => ({ id: 'a-' + String(i).padStart(3, '0'), author_id: 'seller-1', channel: 'whatsapp', direction: 'outbound', note: 'Activity ' + i, occurred_at: '2020-01-01T12:00:00Z' }))
  const events = Array.from({ length: 123 }, (_, i) => ({ id: i + 1, event_type: 'stage', created_at: '2020-01-01T12:00:00Z', payload: { from: 'primeiro_contato', to: 'inscrito' } }))
  const sources = Array.from({ length: 23 }, (_, i) => ({ source: 'leads_cursos', source_key: String(i).padStart(3, '0'), source_date: '2020-01-01', observed_at: '2020-01-01T12:00:00Z', payload: { origem_teste: 'Source ' + i } }))
  let failure = false, missing = false, hold = null, release = null
  await page.route('**/rest/v1/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1), parameters = route.request().postDataJSON() ?? {}
    calls.push({ name, ...parameters })
    assert.equal(name, 'crm_kanban_detail_section', 'Opening a data/history tab must not invoke the legacy/full detail RPC')
    if (missing) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'missing' }) })
    if (failure && parameters.p_section === 'sources') { failure = false; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Falha de teste' }) }) }
    const result = detailPageFixture({ contact: contacts.get(parameters.p_id), activities, events, sources, visited_stages: ['primeiro_contato', 'inscrito'] }, parameters)
    const body = JSON.stringify(result)
    if (hold?.(parameters)) { hold = null; await new Promise(resolve => { release = resolve }) }
    await route.fulfill({ contentType: 'application/json', body })
  })
  const change = async contact => page.evaluate(data => window.dispatchEvent(new CustomEvent('crm-detail-test-contact', { detail: data })), contact)
  const click = name => page.getByRole('button', { name, exact: true }).click()
  const count = section => calls.filter(call => call.p_section === section).length
  await page.goto('http://127.0.0.1:5196/')
  await page.getByRole('heading', { name: 'Candidate 1', exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  assert.deepEqual(calls.map(call => call.p_section), ['contact'])
  await click('Atendimentos'); await page.getByText('Activity 122', { exact: true }).waitFor()
  assert.equal(await page.locator('article').count(), 50)
  await click('Dados'); await click('Atendimentos')
  assert.equal(count('activities'), 1, 'Reopening a loaded tab does not reread it')
  hold = p => p.p_section === 'activities' && p.p_cursor
  await click('Carregar mais atendimentos')
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Carregando'))
  assert.equal(await page.getByRole('button', { name: 'Carregar mais atendimentos', exact: true }).isDisabled(), true)
  await click('Dados'); await click('Atendimentos')
  assert.equal(count('activities'), 2, 'A pending page is shared across a rapid tab round trip')
  release(); release = null
  await page.getByText('Activity 23', { exact: true }).waitFor()
  assert.equal(await page.locator('article').count(), 100)
  await click('Carregar mais atendimentos'); await page.getByText('Activity 0', { exact: true }).waitFor()
  assert.equal(await page.locator('article').count(), 123)
  assert.equal(await page.getByRole('button', { name: 'Carregar mais atendimentos', exact: true }).count(), 0)
  await click('Histórico'); await page.locator('article').first().waitFor()
  assert.equal(await page.locator('article').count(), 50)
  await click('Carregar anteriores'); await page.waitForFunction(() => document.querySelectorAll('article').length === 100)
  await click('Carregar anteriores'); await page.waitForFunction(() => document.querySelectorAll('article').length === 123)
  await click('Origens'); await page.getByText('Source 0', { exact: true }).waitFor()
  assert.equal(await page.locator('dl').count(), 10)
  await click('Carregar mais origens'); await page.getByText('Source 19', { exact: true }).waitFor()
  await click('Carregar mais origens'); await page.getByText('Source 22', { exact: true }).waitFor()
  assert.equal(await page.locator('dl').count(), 23)
  const output = resolve('outputs/crm-detail-sections-check'); await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'origins-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.locator('[data-crm-drawer]').evaluate(el => el.scrollWidth <= el.clientWidth))
  await page.screenshot({ path: resolve(output, 'origins-mobile.png') })
  await change(contacts.get('contact-2')); await page.getByRole('heading', { name: 'Candidate 2', exact: true }).waitFor()
  failure = true; await click('Origens')
  await page.getByRole('alert').filter({ hasText: 'Falha de teste' }).waitFor()
  const failedCount = count('sources'); await page.waitForTimeout(100)
  assert.equal(count('sources'), failedCount, 'Errors do not cause an automatic retry loop')
  await click('Tentar novamente'); await page.getByText('Source 0', { exact: true }).waitFor()
  assert.equal(await page.getByRole('alert').count(), 0)
  hold = p => p.p_section === 'activities' && p.p_id === 'contact-2'
  await click('Atendimentos'); await page.waitForTimeout(100)
  assert.ok(release)
  await change(contacts.get('contact-3')); await page.getByRole('heading', { name: 'Candidate 3', exact: true }).waitFor()
  release(); release = null
  assert.equal(await page.locator('article').count(), 0, 'An old contact response must not populate the new drawer')
  await click('Atendimentos'); await page.getByText('Activity 122', { exact: true }).waitFor()
  hold = p => p.p_section === 'activities' && p.p_cursor
  await click('Carregar mais atendimentos'); await page.waitForTimeout(100)
  contacts.set('contact-3', makeContact(3, 2))
  await change(contacts.get('contact-3'))
  await page.getByText('Activity 122', { exact: true }).waitFor()
  release(); release = null
  await page.waitForTimeout(100)
  assert.equal(await page.locator('article').count(), 50, 'A delayed old-version page must not append to the new list')
  // A version change discovered in the next page must restart from the first page.
  contacts.set('contact-3', makeContact(3, 3))
  await click('Carregar mais atendimentos')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('article').count(), 50)
  assert.ok(calls.at(-1).p_section === 'activities' && calls.at(-1).p_cursor === null)
  missing = true
  await change(contacts.get('contact-4')); await page.getByRole('alert').filter({ hasText: 'crm_kanban_ficha_por_aba.sql' }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: contact-only opening, lazy tabs, 123/123/23 paged records, cache by version, pending-read deduplication, disabled load-more, retries without loops, late contact/version responses, page-version restart, missing migration, mobile overflow and no legacy/full detail requests.')
} finally { if (browser) await browser.close(); server.kill() }
