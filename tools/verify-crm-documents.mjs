import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
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
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/Sao_Paulo',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => {
    errors.push(e.message)
    console.error(e.message)
  })
  const output = resolve('outputs/crm-documents-check')
  await mkdir(output, { recursive: true })
  let contact = {
    id: 'contact-1',
    cpf: '12345678901',
    owner_id: 'seller-1',
    stage: 'inscrito',
    position: 1024,
    current_data: {
      nome: 'Candidato de demonstração',
      curso: 'Direito',
      campus: 'Asa Sul',
      turno: 'NOTURNO',
    },
    source_data: {},
    manual_data: {},
    has_inscription: true,
    official_enrollment: false,
    test_only: false,
    archived: false,
    intake_visible: true,
    checklist: {},
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stage_entered_at: new Date().toISOString(),
    next_action_at: null,
  }
  const documents = [],
    events = []
  let missing = false
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort())
  await page.route('**/src/main.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: "import '/tools/crm-documents-preview-entry.tsx'",
    }),
  )
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const p = route.request().postDataJSON() ?? {}
    let result
    if (name === 'crm_kanban_detail')
      result = {
        contact,
        events: events.toReversed(),
        activities: [],
        sources: [],
        visited_stages: ['inscrito'],
      }
    else if (name === 'crm_kanban_save') {
      assert.equal(contact.version, p.p_version)
      contact = {
        ...contact,
        current_data: { ...contact.current_data, ...p.p_patch.manual_data },
        version: contact.version + 1,
      }
      result = contact
    } else if (name === 'crm_kanban_documents') {
      if (missing)
        return route.fulfill({
          status: 404,
          json: { code: 'PGRST202', message: 'Missing function' },
        })
      const valid = documents.filter((d) => !d.cancelled_at),
        done = valid.filter((d) => d.received_at)
      const hours = done.map((d) => (Date.parse(d.received_at) - Date.parse(d.sent_at)) / 3600000)
      result = {
        documents,
        courses: ['Direito', 'Enfermagem', 'Medicina'],
        generated_at: new Date().toISOString(),
        stats: valid.length
          ? [
              {
                course: 'Direito',
                completed: done.length,
                pending: valid.length - done.length,
                mean_hours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
                median_hours: hours.length ? hours[0] : null,
                oldest_hours: valid.length > done.length ? 2 : null,
              },
            ]
          : [],
      }
    } else if (name === 'crm_kanban_document_save' || name === 'crm_kanban_document_cancel') {
      const prior = documents.find((d) => d.id === p.p_id),
        before = prior ? structuredClone(prior) : null
      if (prior) assert.equal(prior.version, p.p_version)
      const doc =
        name === 'crm_kanban_document_cancel'
          ? {
              ...prior,
              cancelled_at: new Date().toISOString(),
              cancel_reason: p.p_reason,
              version: prior.version + 1,
            }
          : {
              id: p.p_id,
              contact_id: p.p_contact,
              course: p.p_course,
              description: p.p_description,
              sent_at: p.p_sent,
              received_at: p.p_received,
              note: p.p_note,
              receipt_note: p.p_receipt_note,
              version: (prior?.version ?? 0) + 1,
              cancelled_at: null,
              cancel_reason: null,
            }
      if (prior) documents.splice(documents.indexOf(prior), 1, doc)
      else documents.push(doc)
      contact = { ...contact, version: contact.version + 1 }
      events.push({
        id: events.length + 1,
        event_type: name.endsWith('cancel') ? 'document_cancelled' : 'document_saved',
        payload: { before, after: doc, reason: p.p_reason },
        created_at: new Date().toISOString(),
        actor_id: 'seller-1',
      })
      result = { contact, document: doc }
    } else throw new Error('Unexpected RPC ' + name)
    await route.fulfill({ json: result })
  })
  await page.goto('http://127.0.0.1:5194')
  let drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: 'Editar dados', exact: true }).click()
  assert.equal(
    await drawer.getByLabel('Ingressante de outra IES', { exact: true }).inputValue(),
    '',
  )
  await drawer.getByLabel('Ingressante de outra IES', { exact: true }).selectOption('Sim')
  await drawer.getByLabel('IES de origem', { exact: true }).fill('Instituição de origem')
  await drawer.getByRole('button', { name: 'Salvar', exact: true }).click()
  await drawer.getByText('Instituição de origem', { exact: true }).waitFor()
  assert.equal(contact.current_data.ingressante_outra_ies, 'Sim')
  await drawer.getByRole('button', { name: 'Documentação', exact: true }).click()
  await drawer.getByText('Nenhum envio registrado nesta ficha.').waitFor()
  await drawer.getByRole('button', { name: 'Registrar envio', exact: true }).click()
  await drawer
    .getByLabel('Documentação encaminhada', { exact: true })
    .fill('Histórico escolar para análise')
  await drawer.getByLabel('Data e hora do envio', { exact: true }).fill('2020-01-01T07:00')
  await drawer.getByRole('button', { name: 'Salvar documentação', exact: true }).click()
  await drawer.getByText('1 aguardando retorno · 0 retornos recebidos').waitFor()
  assert.equal(documents.length, 1)
  await drawer.getByRole('button', { name: 'Registrar recebimento', exact: true }).click()
  await drawer
    .getByLabel('Data e hora do retorno da análise', { exact: true })
    .fill('2020-01-01T11:00')
  await drawer.getByLabel('Retorno do curso', { exact: true }).fill('Análise recebida')
  await drawer.getByRole('button', { name: 'Salvar documentação', exact: true }).click()
  await drawer.getByText('Prazo de retorno: 4 h', { exact: true }).waitFor()
  assert.equal(documents[0].sent_at, '2020-01-01T10:00:00.000Z')
  assert.equal(documents[0].received_at, '2020-01-01T14:00:00.000Z')
  await page.screenshot({ path: resolve(output, 'desktop.png') })
  await drawer
    .getByRole('button', { name: 'Corrigir documentação de Direito', exact: true })
    .click()
  await drawer
    .getByLabel('Data e hora do retorno da análise', { exact: true })
    .fill('2020-01-01T13:00')
  await drawer
    .getByLabel('Motivo da alteração', { exact: true })
    .fill('Correção do horário informado')
  await drawer.getByRole('button', { name: 'Salvar documentação', exact: true }).click()
  await drawer.getByText('Prazo de retorno: 6 h', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(output, 'mobile.png') })
  assert.equal(await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth), true)
  await drawer
    .getByRole('button', { name: 'Cancelar documentação de Direito', exact: true })
    .click()
  await drawer.getByLabel('Motivo da alteração', { exact: true }).fill('Encaminhado em duplicidade')
  await drawer.getByRole('button', { name: 'Salvar documentação', exact: true }).click()
  await drawer.getByText('Cancelado', { exact: true }).waitFor()
  await drawer.getByText('Ainda não há envios válidos para comparação.').waitFor()
  await drawer.getByRole('button', { name: 'Histórico', exact: true }).click()
  await drawer.getByText('Envio cancelado', { exact: true }).waitFor()
  assert.equal(documents.length, 1)
  await page.goto('http://127.0.0.1:5194/?readonly=1')
  await page.getByRole('button', { name: 'Documentação', exact: true }).click()
  await page.getByText('Cancelado', { exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: 'Registrar envio', exact: true }).isDisabled(),
    true,
  )
  missing = true
  await page.getByRole('button', { name: 'Atualizar documentação', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'crm_kanban_documentacao.sql' }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'PASS: optional IES, document send/receipt/correct/cancel, history, read-only, missing migration, desktop/mobile screenshots; mocked RPC data only',
  )
} finally {
  await browser?.close()
  server.kill()
  await new Promise((resolve) =>
    server.exitCode !== null ? resolve() : server.once('exit', resolve),
  )
}
