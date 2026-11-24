import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
const { chromium } = await import(pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { windowsHide: true, stdio: 'pipe' })
let browser
try {
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', data => { if (String(data).includes('Local:')) { clearTimeout(timer); ready() } })
    server.on('exit', code => { clearTimeout(timer); reject(new Error('Vite exited ' + code)) })
  })
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], calls = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  page.setDefaultTimeout(12000)
  await page.route('https://fonts.googleapis.com/**', r => r.abort())
  await page.route('https://fonts.gstatic.com/**', r => r.abort())
  await page.route('**/src/main.tsx', r => r.fulfill({ contentType: 'application/javascript', body: "import '/tools/dashboard-medicine-preview-entry.tsx'" }))
  const cpf = n => String(n).padStart(11, '0')
  const inscription = n => ({ cpf: cpf(n), curso: n <= 6 ? 'Direito' : 'Enfermagem', campus: n <= 6 ? 'Asa Sul' : 'Águas Claras', turno: n <= 6 ? 'Noturno' : 'Matutino', forma_de_ingresso: 'Vestibular', ano_semestre: '2027.1', data_inscricao: '01/11/2026', data_de_matricula: '02/11/2026' })
  const leads = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, cpf: cpf(i + 1), created_at: '2026-11-15T03:00:00Z', ...(i % 2 ? { ano_semestre: '2026.1' } : {}) }))
  leads.push({ ...leads[0], cpf: '000.000.000-01' })
  leads.push(
    { id: 51, cpf: cpf(51), created_at: '2026-11-15T02:59:59Z' },
    { id: 52, cpf: cpf(52), created_at: '' },
    { id: 53, cpf: cpf(53), created_at: 'invalid' },
  )
  const inscriptions = [...Array.from({ length: 12 }, (_, i) => inscription(i + 1)), ...[51, 52, 53, 101, 102, 103].map(inscription), inscription(1)]
  let enrollmentCount = 4
  await page.route('**/rest/v1/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    calls.push(table)
    assert.ok(['leads_cursos', 'inscritos_20271', 'matriculados_20271'].includes(table))
    const enrolled = [...Array.from({ length: enrollmentCount }, (_, i) => inscription(i + 1)), ...[51, 52, 53, 101].map(inscription)].map(row => ({ ...row, filial: row.campus, tipo_de_ingresso: row.forma_de_ingresso, contrato: 'ATIVO', tipo_aluno: 'CALOURO', nivel_de_ensino: 'GRADUAÇÃO', periodo_letivo: '2027.1' }))
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'leads_cursos' ? leads : table === 'inscritos_20271' ? inscriptions : enrolled) })
  })
  const kpi = label => page.locator('article').filter({ has: page.getByText(label, { exact: true }) })
  const totals = async (l, i, m) => {
    for (const [label, value] of [['Leads', l], ['Inscritos', i], ['Matriculados', m]]) await kpi(label).getByText(String(value), { exact: true }).waitFor()
  }
  const chart = title => page.getByRole('heading', { name: title, exact: true }).locator('..')
  const clickBar = async (title, label) => {
    const section = chart(title)
    await page.waitForTimeout(1700)
    const tick = await section.locator('.recharts-cartesian-axis-tick').filter({ hasText: new RegExp('^' + label.split(/\s+/).join('\\s*') + '$') }).boundingBox()
    assert.ok(tick)
    const bars = section.locator('.recharts-bar-rectangle')
    let closest = 0, distance = Infinity
    for (let i = 0; i < await bars.count(); i++) {
      const box = await bars.nth(i).boundingBox()
      const delta = box ? Math.abs(box.y + box.height / 2 - tick.y - tick.height / 2) : Infinity
      if (delta < distance) { closest = i; distance = delta }
    }
    await bars.nth(closest).click()
  }
  await page.goto('http://127.0.0.1:5197/', { timeout: 60000, waitUntil: 'domcontentloaded' })
  await totals(50, 18, 8)
  await page.getByRole('status').filter({ hasText: 'Visão: Geral' }).waitFor()
  assert.equal(await chart('Funil por origem').locator('.recharts-bar-rectangle').count(), 3)
  assert.equal(await page.getByRole('heading', { name: 'Situação dos leads', exact: true }).count(), 0)
  await page.getByText('Leads desde 15/11/2026 · Inscrições e matrículas 2027.1', { exact: true }).waitFor()
  await page.getByRole('status').filter({ hasText: '2 cadastros de lead sem data válida' }).waitFor()
  await page.getByRole('button', { name: 'Acompanhar leads', exact: true }).focus()
  await page.keyboard.press('Enter')
  await totals(50, 12, 4)
  await page.getByRole('status').filter({ hasText: 'Visão: Leads' }).waitFor()
  assert.equal(await chart('Situação dos leads').locator('.recharts-bar-rectangle').count(), 3)
  assert.deepEqual(await chart('Situação dos leads').locator('.recharts-label-list text').allTextContents(), ['38', '8', '4'])
  await clickBar('Situação dos leads', 'Não inscritos')
  await totals(38, 0, 0)
  await chart('Curso').locator('.recharts-cartesian-axis-tick').filter({ hasText: /^Não informado$/ }).waitFor()
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click()
  await totals(50, 18, 8)
  await clickBar('Funil por origem', 'Lead')
  await totals(50, 12, 4)
  await clickBar('Situação dos leads', 'Inscritos sem matrícula')
  await totals(8, 8, 0)
  await page.getByRole('button', { name: 'Acompanhar matriculados', exact: true }).click()
  await totals(4, 4, 4)
  await page.getByRole('button', { name: 'Acompanhar inscritos', exact: true }).click()
  await totals(12, 12, 4)
  await page.getByRole('button', { name: 'Limpar gráficos', exact: true }).click()
  await totals(50, 18, 8)
  await page.getByRole('button', { name: 'Acompanhar leads', exact: true }).click()
  await chart('Curso').locator('.recharts-cartesian-axis-tick').filter({ hasText: /^Direito$/ }).waitFor()
  await chart('Curso').locator('.recharts-cartesian-axis-tick').filter({ hasText: /^Enfermagem$/ }).waitFor()
  await clickBar('Curso', 'Enfermagem')
  await totals(6, 6, 0)
  await chart('Campus').locator('.recharts-cartesian-axis-tick').filter({ hasText: /^Águas Claras$/ }).waitFor()
  await chart('Turno').locator('.recharts-cartesian-axis-tick').filter({ hasText: /^Matutino$/ }).waitFor()
  await page.getByRole('button', { name: 'Limpar gráficos', exact: true }).click()
  await totals(50, 18, 8)
  await page.getByRole('button', { name: 'Acompanhar leads', exact: true }).click()
  await clickBar('Situação dos leads', 'Matriculados')
  await totals(4, 4, 4)
  await page.getByRole('button', { name: 'Limpar grupo acompanhado', exact: true }).click()
  await totals(50, 18, 8)
  await page.getByRole('button', { name: 'Acompanhar leads', exact: true }).click()
  await totals(50, 12, 4)
  assert.equal(calls.length, 3, 'All selection changes use already-loaded data, without additional requests')
  enrollmentCount = 5
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  await totals(50, 12, 5)
  assert.equal(calls.length, 6)
  const output = resolve('outputs/funnel-cohort-check'); await mkdir(output, { recursive: true })
  const checkBars = async (leadMode = true) => {
    for (const title of [leadMode ? 'Situação dos leads' : 'Funil por origem', 'Curso', 'Campus', 'Processo seletivo', 'Turno']) {
      const section = chart(title), svg = await section.locator('.recharts-surface').boundingBox()
      assert.ok(svg)
      for (const bar of await section.locator('.recharts-bar-rectangle').all()) {
        const box = await bar.boundingBox()
        assert.ok(box && box.width > 0 && box.x >= svg.x - 1 && box.x + box.width <= svg.x + svg.width + 1, title + ': visible bars inside SVG')
      }
      assert.ok(await section.locator('.recharts-label-list text').count(), title + ': numeric labels present')
    }
  }
  await page.waitForTimeout(300)
  await checkBars()
  await page.screenshot({ path: resolve(output, 'leads-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
  await page.waitForTimeout(300)
  await checkBars()
  await page.screenshot({ path: resolve(output, 'leads-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click()
  await totals(50, 18, 9)
  await page.waitForTimeout(300)
  await checkBars(false)
  await page.screenshot({ path: resolve(output, 'general-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth)
  await checkBars(false)
  await page.screenshot({ path: resolve(output, 'general-mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: independent general totals from all three tables, lead filter via card/bar, isolated lead statuses, returning/clearing restores non-lead academic records, lead-only date cutoff, filters without extra requests, refresh and both views in desktop/mobile.')
} finally { if (browser) await browser.close(); server.kill() }
