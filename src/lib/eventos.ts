import type { Profile } from './types'

export const eventAccessEmails = ['lucasctdebritto@gmail.com', 'diego.eger@unieuro.edu.br']
export const canAccessEvents = (profile?: Pick<Profile, 'email'> | null) =>
  Boolean(profile && eventAccessEmails.includes(profile.email.trim().toLowerCase()))
export const eventColumns = [
  ['nome', 'Nome'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['curso', 'Curso'],
  ['escolaridade', 'Escolaridade'], ['nome_responsavel', 'Nome do Responsável'],
  ['telefone_responsavel', 'Telefone do Responsável'], ['evento', 'Evento'],
] as const
export type EventField = (typeof eventColumns)[number][0]
export type EventImportRow = { linha: number } & Record<EventField, string | null>
export type EventMatchStatus = 'identificado' | 'ambiguo' | 'conflito' | 'sem_identificador' | 'nao_encontrado'
export const eventMatchLabels: Record<EventMatchStatus, string> = {
  identificado: 'Pessoa identificada', ambiguo: 'Mais de uma pessoa possível', conflito: 'Telefone e e-mail conflitantes',
  sem_identificador: 'Sem telefone/e-mail válido', nao_encontrado: 'Correspondência não encontrada',
}
export interface EventSummary {
  chave: string; nome: string; leads: number; inscritos: number | null; matriculados: number | null
  sem_identificador: number; revisar: number; nao_encontrados: number; repeticoes_identificadas: number
}
export interface EventsDashboard { periodo: string; atualizado_em: string; fontes_ausentes: string[]; eventos: EventSummary[] }
export interface EventLead extends Omit<EventImportRow, 'linha'> {
  id: string; linha_origem: number; arquivo_nome: string; criado_em: string
  situacao: EventMatchStatus; criterio: 'email' | 'telefone' | 'email_telefone' | null; candidatos: number
  inscrito: boolean | null; matriculado: boolean | null; cursos_inscricao: string[]; cursos_matricula: string[]
}
export interface EventLeadPage { total: number; linhas: EventLead[]; pagina: number; fontes_ausentes: string[] }
export const eventTextKey = (value: string) => value.trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
export function eventPhone(value: string | null) {
  let digits = (value ?? '').replace(/\D/g, '')
  if ([12, 13].includes(digits.length) && digits.startsWith('55')) digits = digits.slice(2)
  return /^\d{10,11}$/.test(digits) && !/^(\d)\1+$/.test(digits) ? digits : null
}
export const eventEmail = (value: string | null) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value?.trim() ?? '') ? value!.trim().toLowerCase() : null
const aliases: Record<string, EventField> = {
  nome: 'nome', telefone: 'telefone', celular: 'telefone', email: 'email', 'e mail': 'email', curso: 'curso',
  escolaridade: 'escolaridade', 'nome do responsavel': 'nome_responsavel', 'nome responsavel': 'nome_responsavel',
  responsavel: 'nome_responsavel', 'telefone do responsavel': 'telefone_responsavel', 'telefone responsavel': 'telefone_responsavel', evento: 'evento',
}
function cellText(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && !(value instanceof Date)) throw new Error('A planilha contém uma célula que não pode ser lida como texto.')
  const text = (value instanceof Date ? value.toISOString().slice(0, 10) : String(value)).trim()
  if (text.length > 2000) throw new Error('Uma célula ultrapassa o limite de 2.000 caracteres.')
  return text || null
}
export function parseEventRows(matrix: unknown[][], fallbackEvent = '') {
  if (!matrix.length) throw new Error('A planilha está vazia.')
  let header = -1, score = 0
  matrix.slice(0, 20).forEach((row, index) => {
    const matches = row.filter(value => aliases[eventTextKey(String(value ?? ''))]).length
    if (matches > score) { header = index; score = matches }
  })
  if (header < 0) throw new Error('Nenhuma coluna reconhecida. Use os cabeçalhos do modelo.')
  const fields = matrix[header].map(value => aliases[eventTextKey(String(value ?? ''))])
  const recognized = fields.filter(Boolean)
  if (new Set(recognized).size !== recognized.length) throw new Error('Há uma coluna repetida no cabeçalho.')
  const rows: EventImportRow[] = []
  let blanks = 0
  for (let index = header + 1; index < matrix.length; index++) {
    const row = Object.fromEntries(eventColumns.map(([field]) => [field, null])) as Record<EventField, string | null>
    fields.forEach((field, column) => { if (field) row[field] = cellText(matrix[index][column]) })
    if (!Object.values(row).some(Boolean)) { blanks++; continue }
    if (index + 1 > 5001 || rows.length >= 5000) throw new Error('O arquivo aceita até 5.000 linhas, com o cabeçalho na primeira linha.')
    rows.push({ ...row, linha: index + 1 })
  }
  const needsFallback = rows.some(row => !row.evento)
  const effectiveFallback = needsFallback ? fallbackEvent.trim() : ''
  const prepared = rows.map(row => ({ ...row, evento: row.evento || effectiveFallback || null }))
  return { rows: prepared, blanks, effectiveFallback,
    withoutIdentity: prepared.filter(row => !eventPhone(row.telefone) && !eventEmail(row.email)).length,
  }
}
export async function eventFileKey(bytes: ArrayBuffer, fallback: string) {
  const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('')
  const fileHash = hex(await crypto.subtle.digest('SHA-256', bytes))
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([fileHash, eventTextKey(fallback)]))))
}
