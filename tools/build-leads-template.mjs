import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'outputs')
const outputPath = path.join(outputDir, 'modelo-leads-vendedores.xlsx')
const previewPath = path.join(outputDir, 'modelo-leads-vendedores.png')

const titleFill = '#004181'
const accentFill = '#BA9008'
const softFill = '#F8FAFC'
const borderColor = '#D7E0EA'
const textDark = '#0F172A'
const textSoft = '#475569'

const headers = [
  'Nome',
  'Curso',
  'Forma de ingresso',
  'Campus',
  'Termômetro da oportunidade',
  'Próximo passo',
  'Data da ação',
]

const sampleRows = [
  ['Maria Eduarda Souza', 'Psicologia', 'Vestibular', 'Águas Claras', 'Quente', 'Enviar condições da campanha', new Date('2026-07-20')],
  ['João Pedro Lima', 'Direito', 'ENEM', 'Asa Sul', 'Morno', 'Retornar ligação no período da tarde', new Date('2026-07-21')],
  ['Ana Clara Martins', 'Odontologia', '2ª Graduação', 'Águas Claras', 'Frio', 'Fazer primeiro contato por WhatsApp', new Date('2026-07-22')],
]

function applyBaseGridStyle(range) {
  range.format = {
    fill: softFill,
    font: { color: textDark, size: 11, name: 'Aptos' },
    wrapText: true,
    verticalAlignment: 'center',
    borders: { preset: 'all', style: 'thin', color: borderColor },
  }
}

function buildSheet(sheet, { blank = false } = {}) {
  sheet.showGridLines = false

  sheet.getRange('A1:G1').merge()
  sheet.getRange('A1').values = [['Modelo de importação de leads do vendedor']]
  sheet.getRange('A1').format = {
    fill: titleFill,
    font: { bold: true, color: '#FFFFFF', size: 16, name: 'Aptos Display' },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
  }
  sheet.getRange('A1:G1').format.rowHeight = 30

  sheet.getRange('A2:G2').merge()
  sheet.getRange('A2').values = [[
    blank
      ? 'Preencha uma linha por lead. Use exatamente estas colunas para importar no painel do vendedor.'
      : 'Exemplo preenchido para orientar o time sobre como subir os leads no painel do vendedor.',
  ]]
  sheet.getRange('A2').format = {
    fill: '#EAF2FB',
    font: { color: textSoft, size: 11, name: 'Aptos' },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
    wrapText: true,
  }
  sheet.getRange('A2:G2').format.rowHeight = 34

  sheet.getRange('A4:G4').values = [headers]
  sheet.getRange('A4:G4').format = {
    fill: accentFill,
    font: { bold: true, color: '#FFFFFF', size: 11, name: 'Aptos' },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
    borders: { preset: 'all', style: 'thin', color: accentFill },
  }
  sheet.getRange('A4:G4').format.rowHeight = 26

  const dataStart = 5
  const rows = blank ? Array.from({ length: 18 }, () => [null, null, null, null, null, null, null]) : sampleRows
  const dataEnd = dataStart + rows.length - 1

  const dataRange = sheet.getRange(`A${dataStart}:G${dataEnd}`)
  dataRange.values = rows
  applyBaseGridStyle(dataRange)

  sheet.getRange(`G${dataStart}:G${dataEnd}`).format.numberFormat = 'dd/mm/yyyy'

  sheet.getRange(`E${dataStart}:E${dataEnd}`).dataValidation = {
    rule: { type: 'list', values: ['Frio', 'Morno', 'Quente'] },
  }

  sheet.getRange(`D${dataStart}:D${dataEnd}`).dataValidation = {
    rule: { type: 'list', values: ['Asa Sul', 'Águas Claras'] },
  }

  sheet.getRange(`A${dataStart}:A${dataEnd}`).format.columnWidth = 30
  sheet.getRange(`B${dataStart}:B${dataEnd}`).format.columnWidth = 24
  sheet.getRange(`C${dataStart}:C${dataEnd}`).format.columnWidth = 24
  sheet.getRange(`D${dataStart}:D${dataEnd}`).format.columnWidth = 18
  sheet.getRange(`E${dataStart}:E${dataEnd}`).format.columnWidth = 22
  sheet.getRange(`F${dataStart}:F${dataEnd}`).format.columnWidth = 34
  sheet.getRange(`G${dataStart}:G${dataEnd}`).format.columnWidth = 16

  sheet.freezePanes.freezeRows(4)

  const noteRow = dataEnd + 2
  sheet.getRange(`A${noteRow}:G${noteRow}`).merge()
  sheet.getRange(`A${noteRow}`).values = [[
    'Valores esperados: Campus = Asa Sul ou Águas Claras | Termômetro = Frio, Morno ou Quente | Data da ação no formato dia/mês/ano.',
  ]]
  sheet.getRange(`A${noteRow}`).format = {
    fill: '#FFF7E6',
    font: { color: '#8A5B00', italic: true, size: 10, name: 'Aptos' },
    wrapText: true,
    verticalAlignment: 'center',
    borders: { preset: 'outside', style: 'thin', color: '#F3D28E' },
  }
  sheet.getRange(`A${noteRow}:G${noteRow}`).format.rowHeight = 30
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  const workbook = Workbook.create()
  const blankSheet = workbook.worksheets.add('Modelo em Branco')
  const sampleSheet = workbook.worksheets.add('Exemplo Preenchido')

  buildSheet(blankSheet, { blank: true })
  buildSheet(sampleSheet, { blank: false })

  const preview = await workbook.render({
    sheetName: 'Modelo em Branco',
    range: 'A1:G24',
    scale: 2,
    format: 'png',
  })
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()))

  const exported = await SpreadsheetFile.exportXlsx(workbook)
  await exported.save(outputPath)

  console.log(outputPath)
}

await main()
