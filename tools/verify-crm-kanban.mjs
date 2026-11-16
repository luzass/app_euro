import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { crmFixture } from './test-crm-kanban.mjs'

const { chromium } = await import(
  pathToFileURL(resolve(process.argv[2], 'playwright/index.mjs')).href
)
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5191', '--strictPort'],
  { windowsHide: true, stdio: 'pipe' },
)
let browser
try {
  await new Promise((ready, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite timeout')), 15000)
    server.stdout.on('data', (data) => {
      if (String(data).includes('Local:')) {
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    hasTouch: true,
  })
  const page = await context.newPage(),
    output = resolve('outputs/crm-check'),
    errors = [],
    calls = []
  await mkdir(output, { recursive: true })
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(45000)
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort())
  let rows = crmFixture(),
    eventId = 100
  const events = [
      {
        id: 1,
        contact_id: 'c1',
        event_type: 'created',
        created_at: '2026-11-13T12:00:00Z',
        actor_id: null,
        payload: { source: 'leads_cursos' },
      },
    ],
    activities = []
  const members = [
    { id: 'seller-1', nome: 'William', role: 'captacao' },
    { id: 'seller-2', nome: 'Jordana', role: 'funcionario' },
    { id: 'manager-1', nome: 'Gestor', role: 'captacao_gerente' },
  ]
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "import '/tools/crm-preview-entry.tsx';",
    }),
  )
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1),
      data = route.request().postDataJSON?.() ?? {}
    const seller = new URL(page.url()).searchParams.has('seller')
    calls.push({ name, data })
    let result
    if (name === 'crm_kanban_contacts')
      result = rows.filter((row) => !seller || row.owner_id === 'seller-1' || !row.owner_id)
    else if (name === 'crm_kanban_workspace')
      result = {
        members,
        config: {
          cutoff: '2026-11-13',
          include_history: true,
          history_limit: 200,
          last_sync_at: '2026-11-13T12:00:00Z',
          last_sync_result: {},
        },
      }
    else if (name === 'crm_kanban_save') {
      const index = rows.findIndex((row) => row.id === data.p_id),
        old = rows[index],
        patch = data.p_patch
      assert.equal(data.p_version, old.version)
      if (patch.stage && patch.stage !== old.stage)
        events.push({
          id: ++eventId,
          contact_id: old.id,
          event_type: 'stage',
          actor_id: 'manager-1',
          created_at: new Date().toISOString(),
          payload: { from: old.stage, to: patch.stage },
        })
      rows[index] = {
        ...old,
        ...patch,
        manual_data: { ...old.manual_data, ...patch.manual_data },
        current_data: { ...old.current_data, ...patch.manual_data },
        version: old.version + 1,
      }
      result = rows[index]
    } else if (name === 'crm_kanban_detail')
      result = {
        contact: rows.find((row) => row.id === data.p_id),
        activities: activities.filter((activity) => activity.contact_id === data.p_id),
        events: events
          .filter(
            (event) =>
              event.contact_id === data.p_id && (!data.p_before || event.id < data.p_before),
          )
          .toReversed()
          .slice(0, 50),
        visited_stages: [
          ...new Set([
            'primeiro_contato',
            rows.find((row) => row.id === data.p_id)?.stage,
            ...events
              .filter((event) => event.contact_id === data.p_id && event.event_type === 'stage')
              .flatMap((event) => [event.payload.from, event.payload.to]),
          ]),
        ],
        sources: [
          {
            source: 'inscritos_20271',
            source_key: '2|541|1',
            source_date: '2026-11-13',
            is_test: false,
            observed_at: '2026-11-13T12:00:00Z',
            payload: {
              candidato: 'Ana Oliveira',
              curso: 'Direito',
              cpf: '00000000001',
              turno: 'NOTURNO',
            },
          },
        ],
      }
    else if (name === 'crm_kanban_create') {
      const prior = rows.find((row) => row.cpf === data.p_cpf)
      if (prior) {
        prior.current_data = {
          ...prior.current_data,
          ...Object.fromEntries(Object.entries(data.p_data).filter(([, value]) => value)),
        }
        prior.version++
        result = prior
      } else {
        const added = {
          ...rows[0],
          id: 'new',
          cpf: data.p_cpf,
          owner_id: data.p_owner,
          current_data: data.p_data,
        }
        rows.push(added)
        result = added
      }
    } else if (name === 'crm_kanban_activity') {
      const value = {
        id: data.p_activity ?? 'act1',
        contact_id: data.p_contact,
        author_id: 'manager-1',
        note: data.p_note,
        channel: data.p_channel,
        occurred_at: data.p_occurred,
        updated_at: new Date().toISOString(),
      }
      const index = activities.findIndex((item) => item.id === value.id)
      if (index >= 0) activities[index] = value
      else activities.push(value)
      events.push({
        id: ++eventId,
        contact_id: data.p_contact,
        event_type: 'activity',
        actor_id: 'manager-1',
        created_at: new Date().toISOString(),
        payload: { note: value.note },
      })
      rows.find((row) => row.id === data.p_contact).version++
      result = value.id
    } else if (name === 'crm_kanban_persona_rows')
      result = {
        missing: [],
        rows: Array.from({ length: 25 }, (_, index) => ({
          cpf: String(index + 100).padStart(11, '0'),
          curso: 'DIREITO',
          periodo_letivo: '2026.1',
          tipo_aluno: 'CALOURO',
          contrato: 'ATIVO',
          idade_matricula: 19,
          filial: 'ASA SUL',
          turno: 'NOTURNO',
          tipo_de_ingresso: 'VESTIBULAR',
        })),
      }
    else if (name === 'crm_kanban_sync')
      result = { updated: 0, conflicts: 0, invalid: 0, missing_sources: [] }
    else throw new Error('Unexpected request: ' + name)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.goto('http://127.0.0.1:5191', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('heading', { name: 'CRM · Captação' }).waitFor()
  await page.getByRole('button', { name: 'Abrir ficha de Ana Oliveira', exact: true }).waitFor()
  const board = page.getByLabel('Quadro Kanban', { exact: true })
  assert.ok(await board.evaluate((element) => element.scrollWidth > element.clientWidth))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const column = page.getByLabel('Contatos em Primeiro contato', { exact: true })
  await column.evaluate((element) => {
    element.scrollTop = 220
  })
  assert.ok(await column.evaluate((element) => element.scrollTop > 0))
  await column.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({ path: resolve(output, 'kanban-desktop.png'), fullPage: true })
  const handle = page.getByRole('button', { name: 'Mover Ana Oliveira', exact: true })
  const start = await handle.boundingBox(),
    target = await page.locator('[data-stage="negociacao"] header').boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + 12, start.y + 18, { steps: 4 })
  await page.mouse.move(target.x + 100, target.y + 20, { steps: 20 })
  await page.mouse.up()
  await page.waitForFunction(() =>
    document.querySelector('[data-stage="negociacao"] [data-contact-id="c1"]'),
  )
  await page.getByRole('status').filter({ hasText: 'Contato movido para Negociação.' }).waitFor()
  assert.ok(
    calls.some(
      (call) => call.name === 'crm_kanban_save' && call.data.p_patch.stage === 'negociacao',
    ),
  )
  const keyboardHandle = page.getByRole('button', { name: 'Mover Carla Pereira', exact: true })
  await keyboardHandle.focus()
  const keyboardSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/crm_kanban_save') &&
      response.request().postDataJSON()?.p_id === 'c3',
  )
  await keyboardHandle.press('Space')
  await page.waitForFunction(
    () => document.querySelector('[data-contact-id="c3"]')?.style.opacity === '0.25',
  )
  await keyboardHandle.press('ArrowDown')
  await page.waitForTimeout(200)
  await keyboardHandle.press('Space')
  await keyboardSaved
  const edgeHandle = page.getByRole('button', { name: 'Mover Contato 21', exact: true })
  await edgeHandle.scrollIntoViewIfNeeded()
  const edgeStart = await edgeHandle.boundingBox(),
    boardRect = await board.boundingBox()
  const edgeSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/crm_kanban_save') &&
      response.request().postDataJSON()?.p_id === 'c21',
  )
  await page.mouse.move(edgeStart.x + 8, edgeStart.y + 8)
  await page.mouse.down()
  await page.mouse.move(boardRect.x + boardRect.width - 8, boardRect.y + 140, { steps: 20 })
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Quadro Kanban"]').scrollLeft > 120,
  )
  await page.mouse.up()
  await edgeSaved
  await board.evaluate((element) => {
    element.scrollLeft = 0
  })
  await page.getByRole('button', { name: 'Abrir ficha de Ana Oliveira', exact: true }).click()
  let drawer = page.getByRole('dialog', { name: 'Ana Oliveira', exact: true })
  await drawer.getByRole('button', { name: 'Editar dados', exact: true }).click()
  await drawer
    .getByRole('textbox', { name: 'Nome completo', exact: true })
    .fill('Ana Oliveira Atualizada')
  const edited = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/crm_kanban_save') &&
      response.request().postDataJSON()?.p_patch?.manual_data,
  )
  await drawer.getByRole('button', { name: 'Salvar', exact: true }).click()
  await edited
  const manualSave = calls.findLast(
    (call) => call.name === 'crm_kanban_save' && call.data.p_patch.manual_data,
  )
  assert.deepEqual(
    Object.keys(manualSave.data.p_patch.manual_data),
    ['nome'],
    'Editing a name must not freeze all imported fields',
  )
  drawer = page.getByRole('dialog', { name: 'Ana Oliveira Atualizada', exact: true })
  await drawer.getByRole('button', { name: 'Atendimentos', exact: true }).click()
  await drawer
    .getByRole('textbox', { name: 'Observação do atendimento', exact: true })
    .fill('Documentação solicitada')
  await drawer.getByRole('button', { name: 'Salvar atendimento', exact: true }).click()
  await drawer.getByText('Documentação solicitada', { exact: true }).waitFor()
  await drawer.getByRole('button', { name: 'Persona', exact: true }).click()
  await drawer.getByText('100/100', { exact: true }).waitFor()
  await drawer.getByRole('button', { name: 'Histórico', exact: true }).click()
  await drawer.locator('article').filter({ hasText: 'Primeiro contato' }).first().waitFor()
  await drawer.screenshot({ path: resolve(output, 'crm-detail-desktop.png') })
  await drawer.getByRole('button', { name: 'Fechar ficha', exact: true }).click()
  await page.getByRole('button', { name: 'Novo contato', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Novo contato', exact: true })
  await create.getByRole('textbox', { name: 'CPF', exact: true }).fill('00000000001')
  await create
    .getByRole('textbox', { name: 'Nome completo', exact: true })
    .fill('Ana CPF existente')
  await create.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Ana CPF existente', exact: true }).waitFor()
  assert.equal(rows.length, 42)
  await page.getByRole('button', { name: 'Fechar ficha', exact: true }).click()
  await page.goto('http://127.0.0.1:5191/?seller=1', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.getByRole('button', { name: /Sem responsável/ }).click()
  await page.getByRole('button', { name: 'Assumir', exact: true }).click()
  await page.getByRole('button', { name: /^Meus/ }).click()
  await page.getByRole('button', { name: 'Abrir ficha de Bruno Souza', exact: true }).click()
  const sellerDrawer = page.getByRole('dialog', { name: 'Bruno Souza', exact: true })
  assert.equal(
    await sellerDrawer
      .getByRole('combobox', { name: 'Responsável do contato', exact: true })
      .count(),
    0,
  )
  await sellerDrawer.getByRole('button', { name: 'Fechar ficha', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: resolve(output, 'kanban-mobile.png'), fullPage: true })
  const mobileColumn = page.getByLabel('Contatos em Primeiro contato', { exact: true })
  await mobileColumn.evaluate((element) => {
    element.scrollTop = 0
  })
  const touchRect = await mobileColumn.boundingBox(),
    cdp = await context.newCDPSession(page)
  const touchX = touchRect.x + 90,
    touchY = touchRect.y + 210
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: touchX, y: touchY, id: 1 }],
  })
  for (let step = 1; step <= 12; step++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: touchX, y: touchY - step * 12, id: 1 }],
    })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Contatos em Primeiro contato"]').scrollTop > 20,
  )
  await page.getByRole('button', { name: 'Abrir ficha de Bruno Souza', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Bruno Souza', exact: true })
    .screenshot({ path: resolve(output, 'crm-detail-mobile.png') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errors, [])
  console.log(
    'CRM navegador: arrastar entre fases, teclado, auto-scroll horizontal, scroll por toque, ficha, edicao parcial, atendimento, persona, cadastro sem duplicar, assumir lead e desktop/mobile verificados.',
  )
} finally {
  await browser?.close()
  server.kill()
}
