import type { Profile, Role } from './types'
import { buildCoursePersona } from './coursePersona.ts'
import type { CampaignData } from './campaignForecast'
import type { GenericRow } from './dashboardHelpers'

export const crmRoles: Role[] = ['admin', 'reitoria', 'captacao_gerente', 'captacao', 'funcionario']
export const crmStages = [
  {
    id: 'primeiro_contato',
    label: 'Primeiro contato',
    color: '#0284c7',
    tasks: ['Identificar a origem', 'Confirmar o contato', 'Direcionar o atendimento'],
    scripts: [
      {
        day: 0,
        text: 'Olá, {nome}! Sou da equipe de captação do UNIEURO. Como posso ajudar você?',
      },
    ],
  },
  {
    id: 'abordagem',
    label: 'Abordagem / Sondagem',
    color: '#0d9488',
    tasks: ['Identificar o curso de interesse', 'Confirmar o campus'],
    scripts: [
      { day: 0, text: 'Olá, {nome}! Qual curso você tem interesse em conhecer?' },
      { day: 2, text: 'Você ainda tem interesse em conhecer os cursos do UNIEURO?' },
      { day: 5, text: 'Posso apresentar as condições vigentes para o curso de seu interesse?' },
    ],
  },
  {
    id: 'negociacao',
    label: 'Negociação',
    color: '#7c3aed',
    tasks: [
      'Enviar apresentação do curso',
      'Informar investimento vigente dos turnos',
      'Confirmar preferência de turno',
      'Identificar a forma de ingresso',
    ],
    scripts: [
      { day: 0, text: 'O investimento está dentro do que você esperava? Qual turno prefere?' },
      {
        day: 1,
        text: 'Você deseja conhecer as alternativas de pagamento disponíveis para o curso?',
      },
      { day: 5, text: 'Podemos dar continuidade ao seu atendimento? É sua primeira graduação?' },
    ],
  },
  {
    id: 'fechamento',
    label: 'Fechamento',
    color: '#d97706',
    tasks: [
      'Conferir os dados da inscrição',
      'Orientar vestibular, transferência ou reingresso',
      'Solicitar documentação aplicável',
      'Acompanhar prova ou análise documental',
    ],
    scripts: [
      { day: 1, text: 'Olá, {nome}! Conseguiu acessar o portal do candidato?' },
      { day: 3, text: 'Conseguiu realizar a prova ou encaminhar a documentação solicitada?' },
      { day: 5, text: 'Posso ajudar você com alguma pendência para avançarmos?' },
    ],
  },
  {
    id: 'vestibular',
    label: 'Vestibular',
    color: '#db2777',
    tasks: [
      'Conferir resultado da seleção',
      'Orientar assinatura do contrato',
      'Orientar pagamento da primeira mensalidade',
    ],
    scripts: [
      {
        day: 0,
        text: 'Olá, {nome}! Podemos conferir o resultado da sua seleção e os próximos passos para a matrícula?',
      },
      {
        day: 3,
        text: 'Precisa de ajuda para assinar o contrato ou consultar as condições vigentes?',
      },
      { day: 10, text: 'Você tem interesse em conhecer o campus? Podemos combinar uma visita.' },
    ],
  },
  {
    id: 'matriculado',
    label: 'Matriculado',
    color: '#059669',
    tasks: ['Conferir matrícula na base oficial', 'Acompanhar conclusão do processo'],
    scripts: [
      { day: 0, text: 'Olá, {nome}! Ficou alguma dúvida sobre os próximos passos no UNIEURO?' },
    ],
  },
] as const
export type CrmStage = (typeof crmStages)[number]['id']
export type CrmData = Record<string, string | null>
export interface CrmContact {
  id: string
  cpf: string
  owner_id: string | null
  stage: CrmStage
  position: number
  source_data: CrmData
  manual_data: CrmData
  current_data: CrmData
  has_inscription: boolean
  official_enrollment: boolean
  test_only: boolean
  archived: boolean
  checklist: Record<string, boolean>
  next_action_at: string | null
  stage_entered_at: string
  version: number
  created_at: string
  updated_at: string
}
export interface CrmMember {
  id: string
  nome: string
  role: Role
}
export interface CrmSyncResult {
  updated?: number
  unchanged?: number
  conflicts?: number
  invalid?: number
  missing_sources?: string[]
  busy?: boolean
}
export interface CrmWorkspace {
  members: CrmMember[]
  config: {
    cutoff: string
    include_history: boolean
    history_limit: number
    last_sync_at: string | null
    last_sync_result: CrmSyncResult
  }
}
export interface CrmEvent {
  id: number
  event_type: string
  actor_id: string | null
  created_at: string
  payload: Record<string, unknown>
}
export interface CrmActivity {
  id: string
  contact_id: string
  author_id: string
  note: string
  channel: string
  occurred_at: string
  updated_at: string
}
export interface CrmSource {
  source: string
  source_key: string
  source_date: string
  is_test: boolean
  payload: GenericRow
  observed_at: string
}
export interface CrmDetail {
  contact: CrmContact
  sources: CrmSource[]
  activities: CrmActivity[]
  events: CrmEvent[]
  visited_stages: CrmStage[]
}
export interface CrmPersonaRows {
  rows: GenericRow[]
  missing: string[]
}
export const isCrmManager = (profile: Pick<Profile, 'role'>) =>
  ['admin', 'reitoria', 'captacao_gerente'].includes(profile.role)
export const canEditCrm = (contact: CrmContact, profile: Profile) =>
  isCrmManager(profile) || contact.owner_id === profile.id
export const crmStageLabel = (id: string) => crmStages.find((stage) => stage.id === id)?.label ?? id
export const crmSourceLabel = (id: string) =>
  ({
    leads_cursos: 'Landing page',
    inscritos_20271: 'Inscritos 2027.1',
    matriculados_20271: 'Matrículas 2027.1',
    manual: 'Cadastro manual',
  })[id] ?? id
export const crmSearchKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
export function formatCrmPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const local = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits
  return local.length === 11
    ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
    : local.length === 10
      ? `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
      : value || 'Telefone não informado'
}
export function crmWhatsapp(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
    ? `https://wa.me/${digits.length <= 11 ? '55' : ''}${digits}`
    : null
}
export function crmMovePreview(contacts: CrmContact[], id: string, over: string, after: boolean) {
  const active = contacts.find((contact) => contact.id === id)
  const destination = over.startsWith('stage:')
    ? over.slice(6)
    : contacts.find((contact) => contact.id === over)?.stage
  if (
    !active ||
    !destination ||
    !crmStages.some((stage) => stage.id === destination) ||
    over === id
  )
    return contacts
  const list = contacts
    .filter((contact) => contact.stage === destination && contact.id !== id && !contact.archived)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const index = over.startsWith('stage:')
    ? list.length
    : Math.max(0, list.findIndex((contact) => contact.id === over) + (after ? 1 : 0))
  const before = list[index - 1]?.position,
    next = list[index]?.position
  const position =
    before === undefined
      ? (next ?? 1024) - 1024
      : next === undefined
        ? before + 1024
        : before + (next - before) / 2
  return contacts.map((contact) =>
    contact.id === id ? { ...contact, stage: destination as CrmStage, position } : contact,
  )
}
export function crmPersona(contact: CrmContact, baseline: CrmPersonaRows, asOf: string) {
  const periods = new Map<string, CampaignData>()
  for (const row of baseline.rows) {
    const period = String(row.periodo_letivo)
    if (!periods.has(period)) periods.set(period, { period, inscritos: [], matriculados: [] })
    periods.get(period)!.matriculados.push(row)
  }
  const actualDate = contact.current_data.data_inscricao
  const reference = actualDate || contact.created_at.slice(0, 10)
  const candidate = {
    ...contact.current_data,
    cpf: contact.cpf,
    candidato: contact.current_data.nome,
    data_inscricao: reference,
    forma_de_ingresso: contact.current_data.forma_ingresso,
  }
  const data = [...periods.values(), { period: '2027.1', inscritos: [candidate], matriculados: [] }]
  const result = buildCoursePersona(data, '2027.1', asOf)
  return {
    record: result.records[0],
    basis: actualDate ? 'Data da inscrição' : 'Data de entrada do contato',
    incomplete: baseline.missing.length > 0,
  }
}
