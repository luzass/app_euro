import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Executa as funcoes puras reais, sem carregar o cliente Supabase ou fazer chamadas externas.
const source = await readFile(new URL('../src/lib/dashboardHelpers.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('dashboardHelpers.ts', source, ts.ScriptTarget.Latest, true)
const wanted = ['normalizeText', 'titleize', 'normalizeIngresso']
const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && wanted.includes(node.name.text))
assert.equal(functions.length, wanted.length)
const transpiled = ts.transpileModule(functions.map((node) => node.getText(parsed)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
})
const { normalizeIngresso } = await import('data:text/javascript;base64,' + Buffer.from(transpiled.outputText).toString('base64'))
const cases = [
  ['2ª GRADUAÇÃO - ASA SUL 2027.1', 'Graduado'],
  [' 2ª GRADUAÇÃO - ÁGUAS CLARAS 2026.2 ', 'Graduado'],
  ['2a graduação', 'Graduado'], ['Segunda graduação', 'Graduado'], ['Graduado', 'Graduado'],
  ['TRANSFERÊNCIA INTERNA - ASA SUL 2027.1', 'Transferência Interna'],
  ['TRANSFERÊNCIA INTERNA - ÁGUAS CLARAS  2026.2', 'Transferência Interna'],
  ['Transf. Interna', 'Transferência Interna'], ['Trans. Interna', 'Transferência Interna'],
  ['TRANSFERÊNCIA EXTERNA  MEDICINA- 2026.2', 'Transferência Externa'],
  ['Transf. Externa', 'Transferência Externa'], ['Trans. Externa', 'Transferência Externa'],
  ['MEDICINA NOTA ENEM- ASA SUL 2027', 'ENEM'],
  ['MEDICINA PRESENCIAL- ASA SUL 2027', 'Vestibular'],
  ['MEDICINA PRESENCIAL - PROUNI', 'PROUNI'],
  ['MEDICINA PRESENCIAL - ENEM', 'ENEM'],
  ['MEDICINA PRESENCIAL - TRANSFERÊNCIA INTERNA', 'Transferência Interna'],
  ['PROUNI ONLINE- UNIEURO ASA SUL 2026.2', 'PROUNI'],
  ['CURSOS EAD - VESTIBULAR DIGITAL 2027.1', 'Vestibular'],
  ['PROCESSO SELETIVO EAD PROUNI 2024.1', 'PROUNI'],
  ['Vagas Novas - ENEM - FIES', 'FIES'],
  ['CURSOS SEMIPRESENCIAIS', 'Semipresencial'],
  ['CURSOS SEMIPRESENCIAIS - NOTA ENEM - 2026.2', 'ENEM'],
  ['CURSOS SEMIPRESENCIAIS - VESTIBULAR DIGITAL - 2027.1', 'Vestibular'],
  ['REINGRESSO MEDICINA', 'Reingresso'], ['Readmissão por trancamento', 'Readmissão'],
  ['', 'Não informado'], [null, 'Não informado'],
]
for (const [input, expected] of cases) assert.equal(normalizeIngresso(input), expected, String(input))
console.log(`Ingresso no app: ${cases.length} casos de Medicina, segunda graduacao, transferencias distintas, ENEM, PROUNI, FIES, modalidades e categorias existentes verificados sem acesso ao Supabase.`)
