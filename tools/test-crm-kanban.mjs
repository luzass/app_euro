import assert from 'node:assert/strict'
import {
  crmMovePreview,
  crmPersona,
  canEditCrm,
  crmWhatsapp,
  formatCrmPhone,
  crmStages,
} from '../src/lib/crmKanban.ts'

const profile = {
  id: 'seller-1',
  role: 'captacao',
  nome: 'William',
  email: 'teste@example.test',
  created_at: '2026-11-13T12:00:00Z',
}
export function crmFixture() {
  const stages = crmStages.map((stage) => stage.id)
  const names = [
    'Ana Oliveira',
    'Bruno Souza',
    'Carla Pereira',
    'Diego Martins',
    'Fernanda Alves',
    'Gabriel Lima',
  ]
  return Array.from({ length: 42 }, (_, index) => ({
    id: 'c' + (index + 1),
    cpf: String(index + 1).padStart(11, '0'),
    owner_id: index === 1 ? null : index === 2 ? 'seller-2' : 'seller-1',
    stage: index < 19 ? 'primeiro_contato' : stages[((index - 19) % 5) + 1],
    position: (index + 1) * 1024,
    source_data: {},
    manual_data: {},
    current_data: {
      nome: names[index] ?? `Contato ${index + 1}`,
      telefone: '61900000000',
      curso: index % 2 ? 'Psicologia' : 'Direito',
      campus: index % 2 ? 'Águas Claras' : 'Asa Sul',
      turno: 'NOTURNO',
      forma_ingresso: 'Vestibular',
      email: 'teste@example.test',
      data_de_nascimento: '01/01/2007',
      data_inscricao: index % 2 ? null : '13/11/2026',
    },
    has_inscription: index % 2 === 0,
    official_enrollment: false,
    test_only: index > 4,
    archived: false,
    checklist: {},
    next_action_at: index === 0 ? '2026-11-12T12:00:00Z' : null,
    stage_entered_at: '2026-11-13T12:00:00Z',
    version: 1,
    created_at: '2026-11-13T12:00:00Z',
    updated_at: '2026-11-13T12:00:00Z',
  }))
}
const rows = crmFixture()
const moved = crmMovePreview(rows, 'c1', 'stage:negociacao', false)
assert.equal(moved.find((row) => row.id === 'c1').stage, 'negociacao')
assert.equal(rows[0].stage, 'primeiro_contato')
assert.equal(new Set(moved.map((row) => row.id)).size, rows.length)
const reordered = crmMovePreview(rows, 'c1', 'c5', true)
assert.ok(
  reordered.find((row) => row.id === 'c1').position > rows.find((row) => row.id === 'c5').position,
)
assert.equal(canEditCrm(rows[0], profile), true)
assert.equal(canEditCrm(rows[1], profile), false)
assert.equal(canEditCrm(rows[2], profile), false)
assert.equal(canEditCrm(rows[2], { ...profile, role: 'admin' }), true)
assert.equal(crmWhatsapp('61900000000'), 'https://wa.me/5561900000000')
assert.equal(crmWhatsapp('abc'), null)
assert.equal(formatCrmPhone('61900000000'), '(61) 90000-0000')
const baseline = {
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
assert.equal(crmPersona(rows[0], baseline, '2026-11-13').record.score, 100)
assert.equal(
  crmPersona(rows[0], { ...baseline, missing: ['2024.1'] }, '2026-11-13').incomplete,
  true,
)
console.log('CRM: movimentacao imutavel, ordem, papeis, contatos e persona descritiva verificados.')
