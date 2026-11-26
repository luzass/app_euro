import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readSheet } from 'read-excel-file/node'
import { canAccessEvents, eventColumns, eventEmail, eventFileKey, eventPhone, parseEventRows } from '../src/lib/eventos.ts'
import { canAccessPath, getAllowedNavItems } from '../src/lib/navigation.ts'

for (const email of ['lucasdtbritto@gmail.com','diego.eger@unieuro.edu.br']) {
  assert.equal(canAccessEvents({email}),true)
  assert.ok(getAllowedNavItems(email.startsWith('lucas') ? 'admin' : 'captacao_gerente',email).some(item => item.path==='/app/eventos'))
}
assert.equal(canAccessEvents({email:'outro@example.test'}),false)
assert.equal(canAccessEvents(null),false)
assert.equal(canAccessPath('/app/eventos','admin','outro@example.test'),false)
assert.equal(canAccessPath('/app/eventos','reitoria','outro@example.test'),false)
assert.equal(canAccessPath('/app/eventos','captacao','outro@example.test'),false)
assert.equal(canAccessPath('/app/eventos','admin'),false)
assert.equal(eventPhone('+55 (61) 91111-2222'),'61911112222')
assert.equal(eventPhone('00000000000'),null)
assert.equal(eventPhone('123'),null)
assert.equal(eventEmail(' A@EXAMPLE.TEST '),'a@example.test')
assert.equal(eventEmail('sem@email'),null)
const rows = parseEventRows([
  eventColumns.map(([,label]) => label),
  ['A',61911112222,null,'Direito',null,null,null,'Feira A'],
  [null,null,null,null,'Ensino médio',null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,'Responsável','61933334444',null],
], 'Feira padrão')
assert.equal(rows.rows.length,3); assert.equal(rows.blanks,1); assert.equal(rows.withoutIdentity,2)
assert.equal(rows.rows[0].telefone,'61911112222')
assert.equal(rows.rows[1].evento,'Feira padrão')
assert.equal(rows.rows[2].linha,5)
assert.equal(rows.rows[2].nome,null)
assert.equal(parseEventRows([['Curso'],['Direito']]).rows.length,1,'No individual business column is mandatory')
assert.equal(parseEventRows([['Evento'],['Feira anônima']]).rows.length,1)
assert.equal(parseEventRows([['Nome'],[null]],'Evento preenchido no formulário').rows.length,0,'Formatting and fallback do not create blank leads')
assert.equal(parseEventRows([['Evento'],['Feira A']],'Outro').effectiveFallback,'','An unused fallback must not change import identity')
assert.throws(() => parseEventRows([['Desconhecido'],['X']]),/coluna reconhecida/)
assert.throws(() => parseEventRows([['Nome','nome'],['A','B']]),/repetida/)
assert.throws(() => parseEventRows([['Nome'],['X'.repeat(2001)]]),/2.000/)
const bytes = new TextEncoder().encode('sample').buffer
assert.equal(await eventFileKey(bytes,'Feira Á'),await eventFileKey(bytes,'feira a'))
assert.notEqual(await eventFileKey(bytes,'Feira A'),await eventFileKey(bytes,'Feira B'))
const template = await readSheet(await readFile(new URL('../public/templates/modelo-leads-eventos.xlsx',import.meta.url)),1)
assert.deepEqual(template[0],eventColumns.map(([,label]) => label))
assert.equal(parseEventRows(template).rows.length,0)
const fixture = await readSheet(await readFile(new URL('./fixtures/eventos-importacao.xlsx',import.meta.url)),1)
const parsed = parseEventRows(fixture,'Evento sem nome')
assert.equal(parsed.rows.length,4); assert.equal(parsed.rows[0].telefone,'61911112222')
assert.equal(parsed.rows[3].evento,'Evento sem nome')
console.log('PASS: Events access/navigation, optional columns, empty rows, guardian contacts, Excel/text phones, file identity/idempotency, template and real XLSX fixture parsing.')
