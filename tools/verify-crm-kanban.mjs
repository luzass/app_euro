import assert from 'node:assert/strict'
import { detailPageFixture } from './crm-detail-page-fixture.mjs'
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
  await page.clock.install()
  await mkdir(output, { recursive: true })
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(45000)
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort())
  let rows = crmFixture(),
    eventId = 100
  let personaTimeout = true
  const reasons = [
    {
      id: 'reason-price',
      seed_key: 'price',
      name: 'Preço ou condições de pagamento',
      active: true,
      requires_note: false,
      version: 1,
    },
    {
      id: 'reason-other',
      seed_key: 'other',
      name: 'Outro',
      active: true,
      requires_note: true,
      version: 1,
    },
  ]
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
    { id: 'seller-3', nome: 'Agestone', role: 'captacao' },
    { id: 'admin-1', nome: 'Administrador', role: 'admin' },
    { id: 'rector-1', nome: 'Reitoria', role: 'reitoria' },
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
    if (name === 'crm_kanban_contacts') {
      const columns = url.searchParams.get('select').split(',')
      assert.ok(!columns.includes('*'))
      assert.ok(!columns.includes('source_data'))
      assert.ok(!columns.includes('manual_data'))
      assert.ok(columns.includes('current_data'))
      assert.equal(url.searchParams.get('intake_visible'), 'eq.true')
      result = [
        ...rows.filter((row) => !seller || row.owner_id === 'seller-1' || !row.owner_id),
        {
          ...rows[0],
          id: 'outside-intake',
          current_data: { ...rows[0].current_data, nome: 'Contato fora do recorte' },
          intake_visible: false,
        },
      ].filter((row) => row.intake_visible !== false)
        .map((row) => Object.fromEntries(columns.map((key) => [key, row[key]])))
    } else if (name === 'crm_kanban_workspace')
      result = {
        members,
        loss_reasons: reasons,
        config: {
          loss_version: 1,
          workflow_version: 2,
          cutoff: '2026-11-13',
          include_history: true,
          history_limit: 200,
          last_sync_at: '2026-11-13T12:00:00Z',
          last_sync_result: {},
        },
      }
    else if (name === 'crm_kanban_reason_save') {
      assert.equal(seller, false)
      const prior = reasons.find((r) => r.id === data.p_id)
      if (prior) {
        assert.equal(prior.version, data.p_version)
        Object.assign(prior, {
          name: data.p_name,
          active: data.p_active,
          requires_note: data.p_requires_note,
          version: prior.version + 1,
        })
        result = prior
      } else {
        result = {
          id: 'reason-new',
          seed_key: null,
          name: data.p_name,
          active: data.p_active,
          requires_note: data.p_requires_note,
          version: 1,
        }
        reasons.push(result)
      }
    } else if (name === 'crm_kanban_close_loss') {
      const contact = rows.find((r) => r.id === data.p_id),
        reason = reasons.find((r) => r.id === data.p_reason)
      assert.equal(contact.version, data.p_version)
      assert.equal(reason.active, true)
      assert.ok(!reason.requires_note || data.p_note.trim())
      contact.loss_data = {
        id: 'loss-' + ++eventId,
        reason_id: reason.id,
        reason_label: reason.name,
        note: data.p_note,
        evidence: data.p_evidence,
        closed_at: new Date().toISOString(),
        closed_by: seller ? 'seller-1' : 'manager-1',
        stage: contact.stage,
        owner_id: contact.owner_id,
        course: contact.current_data.curso,
        campus: contact.current_data.campus,
        shift: contact.current_data.turno,
        category: contact.has_inscription ? 'Inscrito' : 'Lead',
      }
      contact.archived = true
      contact.next_action_at = null
      contact.version++
      events.push({
        id: ++eventId,
        contact_id: contact.id,
        event_type: 'loss_closed',
        actor_id: contact.loss_data.closed_by,
        created_at: new Date().toISOString(),
        payload: structuredClone(contact.loss_data),
      })
      result = contact
    } else if (name === 'crm_kanban_reopen_loss') {
      const contact = rows.find((r) => r.id === data.p_id),
        previous = structuredClone(contact.loss_data)
      assert.equal(contact.version, data.p_version)
      contact.loss_data = null
      contact.archived = false
      contact.version++
      contact.stage_entered_at = new Date().toISOString()
      events.push({
        id: ++eventId,
        contact_id: contact.id,
        event_type: 'loss_reopened',
        actor_id: seller ? 'seller-1' : 'manager-1',
        created_at: new Date().toISOString(),
        payload: { previous, note: data.p_note },
      })
      result = contact
    } else if (name === 'crm_kanban_save') {
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
        stage_entered_at:
          patch.stage && patch.stage !== old.stage
            ? new Date().toISOString()
            : old.stage_entered_at,
      }
      result = rows[index]
    } else if (name === 'crm_kanban_detail_section') {
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
      result = detailPageFixture(result, data)
    } else if (name === 'crm_kanban_create') {
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
    } else if (name === 'crm_kanban_activity_v2') {
      const value = {
        id: data.p_activity ?? 'act' + ++eventId,
        contact_id: data.p_contact,
        author_id: 'manager-1',
        note: data.p_note,
        channel: data.p_channel,
        occurred_at: data.p_occurred,
        updated_at: new Date().toISOString(),
        direction: data.p_direction,
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
      const person = rows.find((row) => row.id === data.p_contact)
      person.version++
      if (data.p_direction !== 'note' && (!person.last_interaction_at || Date.parse(data.p_occurred) > Date.parse(person.last_interaction_at))) person.last_interaction_at = data.p_occurred
      if (data.p_direction === 'outbound' && (!person.last_outreach_at || Date.parse(data.p_occurred) > Date.parse(person.last_outreach_at))) person.last_outreach_at = data.p_occurred
      if (
        data.p_direction === 'outbound' &&
        person.next_action_at &&
        Date.parse(person.next_action_at) <= Date.parse(data.p_occurred)
      )
        person.next_action_at = null
      if (data.p_direction === 'inbound') {
        person.last_response_at = data.p_occurred
        person.checklist[
          'cadence-paused:' + person.stage + ':' + Date.parse(person.stage_entered_at)
        ] = true
      }
      if (data.p_code && Date.parse(data.p_occurred) >= Date.parse(person.stage_entered_at))
        person.checklist[
          'cadence:' + person.stage + ':' + Date.parse(person.stage_entered_at) + ':' + data.p_code
        ] = true
      result = value.id
    } else if (name === 'crm_kanban_resume_cadence') {
      const person = rows.find((row) => row.id === data.p_id)
      delete person.checklist[
        'cadence-paused:' + person.stage + ':' + Date.parse(person.stage_entered_at)
      ]
      person.version++
      result = person
    } else if (name === 'crm_kanban_persona_course') {
      assert.ok(
        ['Direito', 'Psicologia'].includes(data.p_course),
        'Persona must query only the selected course',
      )
      if (personaTimeout) {
        personaTimeout = false
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '57014',
            message: 'canceling statement due to statement timeout',
            details: null,
            hint: null,
          }),
        })
        return
      }
      result = {
        missing: [],
        rows: Array.from({ length: 25 }, (_, index) => ({
          cpf: String(index + 100).padStart(11, '0'),
          curso: data.p_course.toUpperCase(),
          periodo_letivo: '2026.1',
          tipo_aluno: 'CALOURO',
          contrato: 'ATIVO',
          idade_matricula: 19,
          filial: 'ASA SUL',
          turno: 'NOTURNO',
          tipo_de_ingresso: 'VESTIBULAR',
        })),
      }
    } else if (name === 'crm_kanban_sync')
      result = { updated: 0, conflicts: 0, invalid: 0, missing_sources: [] }
    else throw new Error('Unexpected request: ' + name)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.goto('http://127.0.0.1:5191', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('heading', { name: 'CRM · Captação' }).waitFor()
  await page.getByRole('button', { name: 'Abrir ficha de Ana Oliveira', exact: true }).waitFor()
  const selectableOwners = async (select) => {
    await select.waitFor()
    return select.locator('option:not([disabled])').evaluateAll(options => options.map(option => option.value))
  }
  await page.getByRole('button', { name: 'Filtros do quadro', exact: true }).click()
  assert.deepEqual(await selectableOwners(page.getByLabel('Filtrar responsável', { exact: true })), ['', 'seller-1', 'seller-3'])
  await page.getByRole('button', { name: 'Filtros do quadro', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir ficha de Carla Pereira', exact: true }).click()
  const legacyDrawer = page.getByRole('dialog', { name: 'Carla Pereira', exact: true })
  const legacySelect = legacyDrawer.getByLabel('Responsável do contato', { exact: true })
  assert.equal(await legacySelect.inputValue(), 'seller-2')
  assert.equal(await legacySelect.locator('option:checked').textContent(), 'Jordana (atual)')
  assert.deepEqual(await selectableOwners(legacySelect), ['', 'seller-1', 'seller-3'])
  await legacyDrawer.getByRole('button', { name: 'Editar dados', exact: true }).click()
  const legacyForm = legacyDrawer.getByLabel('Responsável no cadastro', { exact: true })
  assert.equal(await legacyForm.inputValue(), 'seller-2')
  assert.deepEqual(await selectableOwners(legacyForm), ['', 'seller-1', 'seller-3'])
  await legacyDrawer.getByRole('textbox', { name: 'Nome completo', exact: true }).fill('Carla Pereira')
  await legacyDrawer.getByRole('button', { name: 'Salvar', exact: true }).click()
  await legacyDrawer.getByRole('button', { name: 'Editar dados', exact: true }).waitFor()
  assert.equal(calls.findLast(call => call.name === 'crm_kanban_save').data.p_patch.owner_id, undefined, 'Editing data preserves a historical owner without attempting reassignment')
  await legacyDrawer.getByRole('button', { name: 'Fechar ficha', exact: true }).click()
  const reads = () => calls.filter((call) => call.name === 'crm_kanban_contacts').length
  const baselineReads = reads()
  await page.clock.fastForward(4 * 60000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(100)
  assert.equal(reads(), baselineReads, 'Kanban must not poll after 30 seconds or on early focus')
  await page.clock.fastForward(61000)
  for (let n = 0; n < 60 && reads() < baselineReads + 1; n++) await page.waitForTimeout(50)
  assert.equal(reads(), baselineReads + 1, 'Kanban refreshes at five minutes')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(100)
  assert.equal(reads(), baselineReads + 1)
  await page.getByRole('button', { name: 'Atualizar quadro', exact: true }).click()
  for (let n = 0; n < 60 && reads() < baselineReads + 2; n++) await page.waitForTimeout(50)
  assert.equal(reads(), baselineReads + 2, 'Manual board refresh is immediate')
  assert.equal(
    await page
      .getByRole('button', { name: 'Abrir ficha de Contato fora do recorte', exact: true })
      .count(),
    0,
  )
  await page.getByRole('button', { name: 'Motivos de desistência', exact: true }).click()
  const reasonManager = page.getByRole('dialog', { name: 'Motivos de desistência', exact: true })
  await reasonManager.getByRole('button', { name: 'Novo motivo', exact: true }).click()
  await reasonManager
    .getByRole('textbox', { name: 'Nome do motivo', exact: true })
    .fill('Mudou de cidade')
  await reasonManager.getByRole('checkbox', { name: 'Exigir observação', exact: true }).check()
  await reasonManager.getByRole('button', { name: 'Salvar motivo', exact: true }).click()
  await reasonManager
    .getByRole('button', { name: 'Editar motivo Mudou de cidade', exact: true })
    .click()
  await reasonManager
    .getByRole('textbox', { name: 'Nome do motivo', exact: true })
    .fill('Mudou de cidade ou estado')
  await reasonManager.getByRole('checkbox', { name: 'Ativo', exact: true }).uncheck()
  await reasonManager.getByRole('button', { name: 'Salvar motivo', exact: true }).click()
  await reasonManager
    .getByRole('button', { name: 'Editar motivo Mudou de cidade ou estado', exact: true })
    .waitFor()
  await reasonManager.screenshot({ path: resolve(output, 'crm-motivos-supervisao.png') })
  await reasonManager.getByRole('button', { name: 'Fechar motivos', exact: true }).click()
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
  await page.getByText('Agenda de atendimento', { exact: false }).first().click()
  await page.getByRole('combobox', { name: 'Exibir na agenda' }).selectOption('all')
  await page
    .getByRole('button', { name: /Ana Oliveira/ })
    .first()
    .waitFor()
  await page.getByText('Agenda de atendimento', { exact: false }).first().click()
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
    element.scrollLeft = element.scrollWidth
  })
  await page.screenshot({ path: resolve(output, 'crm-etapas-finais.png'), fullPage: true })
  await board.evaluate((element) => {
    element.scrollLeft = 0
  })
  await page.getByRole('button', { name: 'Abrir ficha de Ana Oliveira', exact: true }).click()
  let drawer = page.getByRole('dialog', { name: 'Ana Oliveira', exact: true })
  assert.deepEqual(await selectableOwners(drawer.getByLabel('Responsável do contato', { exact: true })), ['', 'seller-1', 'seller-3'])
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
  await drawer
    .getByRole('combobox', { name: 'Primeira graduação', exact: true })
    .selectOption('Sim')
  await drawer
    .getByRole('combobox', { name: 'Via de ingresso na negociação', exact: true })
    .selectOption('ENEM')
  await drawer.getByText('N6', { exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  const beforeActivityReads = reads()
  const activityCallStart = calls.length
  await drawer.getByRole('button', { name: 'Registrar contato N1', exact: true }).click()
  await drawer.getByRole('button', { name: 'Salvar atendimento', exact: true }).click()
  await drawer.getByRole('button', { name: 'Dados', exact: true }).click()
  await drawer.getByRole('button', { name: 'Registrar contato N1', exact: true }).waitFor()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-crm-drawer] button')].some(
      (button) => button.textContent.includes('Registrar contato N1') && button.disabled,
    ),
  )
  assert.equal(
    await drawer.getByRole('button', { name: 'Registrar contato N1', exact: true }).isDisabled(),
    true,
  )
  assert.equal(reads(), beforeActivityReads, 'Saving an activity must not reload all cards')
  const activityCalls = calls.slice(activityCallStart)
  const activityWrite = activityCalls.findIndex((call) => call.name === 'crm_kanban_activity_v2')
  assert.ok(activityWrite >= 0)
  assert.equal(
    activityCalls.slice(activityWrite + 1).filter((call) => call.name === 'crm_kanban_detail_section' && call.data.p_section === 'contact').length,
    1,
    'Saving an activity must refresh detail only once (excluding reads before the write)',
  )
  await drawer.getByRole('button', { name: 'Registrar contato N2', exact: true }).click()
  await drawer.getByLabel('Data do atendimento', { exact: true }).fill('2020-01-01T10:00')
  await drawer.getByRole('status').filter({ hasText: 'sem concluir a cadência atual' }).waitFor()
  await drawer.getByLabel('Observação do atendimento', { exact: true }).fill('Contato retroativo de teste')
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/rpc/crm_kanban_detail_section') && response.request().postDataJSON()?.p_section === 'contact'),
    drawer.getByRole('button', { name: 'Salvar atendimento', exact: true }).click(),
  ])
  await drawer.locator('article').filter({ hasText: 'Contato retroativo de teste' }).waitFor()
  await drawer.getByRole('button', { name: 'Dados', exact: true }).click()
  assert.equal(await drawer.getByRole('button', { name: 'Registrar contato N2', exact: true }).isEnabled(), true, 'Retroactive contact must not complete the current cadence')
  await drawer.getByRole('button', { name: 'Atendimentos', exact: true }).click()
  await drawer
    .getByRole('combobox', { name: 'Tipo de interação', exact: true })
    .selectOption('inbound')
  await drawer
    .getByRole('textbox', { name: 'Observação do atendimento', exact: true })
    .fill('Documentação solicitada')
  await drawer.getByRole('button', { name: 'Salvar atendimento', exact: true }).click()
  await drawer.getByText('Documentação solicitada', { exact: true }).waitFor()
  await drawer.getByRole('button', { name: 'Dados', exact: true }).click()
  await drawer.getByRole('button', { name: 'Retomar cadência', exact: true }).waitFor()
  await drawer
    .getByRole('heading', { name: 'Cadência de atendimento', exact: true })
    .scrollIntoViewIfNeeded()
  await drawer.screenshot({ path: resolve(output, 'crm-cadencias-desktop.png') })
  const beforeResumeReads = reads()
  const beforeResumeDetail = calls.filter((call) => call.name === 'crm_kanban_detail_section').length
  await Promise.all([
    drawer.getByRole('button', { name: 'Retomar cadência', exact: true }).click(),
  ])
  await drawer.getByRole('button', { name: 'Retomar cadência', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(reads(), beforeResumeReads, 'Resuming cadence must not reload all cards')
  assert.equal(
    calls.filter((call) => call.name === 'crm_kanban_detail_section').length,
    beforeResumeDetail,
    'Resuming cadence already returns the current contact and must not reread inactive sections',
  )
  await drawer.getByRole('button', { name: 'Registrar contato N2', exact: true }).waitFor()
  await drawer.getByRole('button', { name: 'Persona', exact: true }).click()
  await drawer.getByRole('alert').filter({ hasText: 'excedeu o tempo limite' }).waitFor()
  await drawer.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await drawer.getByText('100/100', { exact: true }).waitFor()
  assert.equal(calls.filter((call) => call.name === 'crm_kanban_persona_course').length, 2)
  await drawer.getByRole('button', { name: 'Dados', exact: true }).click()
  await drawer.getByRole('button', { name: 'Persona', exact: true }).click()
  await drawer.getByText('100/100', { exact: true }).waitFor()
  assert.equal(
    calls.filter((call) => call.name === 'crm_kanban_persona_course').length,
    2,
    'Reopening the same course reuses the cached reference',
  )
  await drawer.getByRole('button', { name: 'Histórico', exact: true }).click()
  await drawer.locator('article').filter({ hasText: 'Primeiro contato' }).first().waitFor()
  await drawer.screenshot({ path: resolve(output, 'crm-detail-desktop.png') })
  await drawer.getByRole('button', { name: 'Fechar ficha', exact: true }).click()
  await page.getByRole('button', { name: 'Novo contato', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Novo contato', exact: true })
  assert.deepEqual(await selectableOwners(create.getByLabel('Responsável no cadastro', { exact: true })), ['', 'seller-1', 'seller-3'])
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
  assert.equal(
    await page.getByRole('button', { name: 'Motivos de desistência', exact: true }).count(),
    0,
  )
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
  await sellerDrawer.getByRole('button', { name: 'Persona', exact: true }).click()
  await sellerDrawer.getByText('75/100', { exact: true }).waitFor()
  assert.equal(
    calls.filter((call) => call.name === 'crm_kanban_persona_course').length,
    3,
    'A different course gets its own reference',
  )
  await sellerDrawer.getByRole('button', { name: 'Dados', exact: true }).click()
  await sellerDrawer.getByRole('button', { name: 'Registrar desistência', exact: true }).click()
  await sellerDrawer
    .getByRole('combobox', { name: 'Motivo principal da desistência', exact: true })
    .selectOption('reason-other')
  await sellerDrawer
    .getByRole('combobox', { name: 'Origem do motivo', exact: true })
    .selectOption('candidate_reported')
  await sellerDrawer.getByRole('button', { name: 'Confirmar desistência', exact: true }).click()
  assert.equal(
    await sellerDrawer
      .getByRole('textbox', { name: 'Observação da desistência', exact: true })
      .evaluate((el) => el.validity.valueMissing),
    true,
  )
  await sellerDrawer
    .getByRole('textbox', { name: 'Observação da desistência', exact: true })
    .fill('Vai iniciar os estudos no próximo semestre')
  await sellerDrawer.getByRole('button', { name: 'Confirmar desistência', exact: true }).click()
  await sellerDrawer.getByRole('button', { name: 'Reabrir atendimento', exact: true }).waitFor()
  await sellerDrawer.screenshot({ path: resolve(output, 'crm-desistencia-mobile.png') })
  await sellerDrawer.getByRole('button', { name: 'Fechar ficha', exact: true }).click()
  await page.getByRole('button', { name: 'Filtros do quadro', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Situação do atendimento', exact: true })
    .selectOption('lost')
  await page.getByRole('button', { name: 'Abrir ficha de Bruno Souza', exact: true }).click()
  await sellerDrawer.getByRole('button', { name: 'Reabrir atendimento', exact: true }).click()
  await sellerDrawer
    .getByRole('textbox', { name: 'Motivo da reabertura', exact: true })
    .fill('Candidato voltou a conversar com a equipe')
  await sellerDrawer.getByRole('button', { name: 'Confirmar reabertura', exact: true }).click()
  await sellerDrawer.getByRole('button', { name: 'Registrar desistência', exact: true }).waitFor()
  await sellerDrawer.getByRole('button', { name: 'Histórico', exact: true }).click()
  await sellerDrawer.getByText('Atendimento reaberto', { exact: true }).waitFor()
  assert.ok(
    events.some(
      (e) =>
        e.contact_id === 'c2' &&
        e.event_type === 'loss_closed' &&
        e.payload.evidence === 'candidate_reported',
    ),
  )
  assert.equal(rows.find((r) => r.id === 'c2').loss_data, null)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errors, [])
  console.log(
    'CRM navegador: movimentacao, scroll, ficha, persona, cadencias, motivos editaveis pela supervisao, desistencia com observacao, filtros e reabertura com historico em desktop/mobile verificados.',
  )
} finally {
  await browser?.close()
  server.kill()
}
