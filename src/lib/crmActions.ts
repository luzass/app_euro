import type { CrmContact } from './crmKanban'
import { crmCadence, crmReminders, type CrmReminder } from './crmWorkflow.ts'

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})
export const crmActionDay = (time: number) => dayFormat.format(time)
export type CrmActionWindow = 'pending' | 'overdue' | 'today' | 'future' | 'all'
export function crmActionInWindow(action: CrmReminder, now: number, window: CrmActionWindow) {
  const day = crmActionDay(action.due), today = crmActionDay(now)
  if (window === 'overdue') return action.due < now
  if (window === 'today') return day === today
  if (window === 'future') return day > today
  return window === 'all' || action.due <= now || day === today
}
export function buildCrmActions(contacts: CrmContact[], now: number, ownerId?: string) {
  return crmReminders(contacts.filter(contact => contact.intake_visible !== false
    && (!ownerId || contact.owner_id === ownerId)), now)
    .filter(action => Number.isFinite(action.due))
    .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id))
}
export function crmActionDescription(action: CrmReminder) {
  if (action.kind === 'manual') return 'Realizar o retorno agendado com o candidato.'
  if (action.kind === 'idle') return 'Entrar em contato e registrar o atendimento.'
  if (action.kind === 'response') return 'Retomar o contato e conferir se o candidato respondeu.'
  const script = crmCadence(action.contact).find(task => task.code === action.code)
  return (script?.text || 'Dar continuidade ao atendimento.').replaceAll(
    '{nome}', action.contact.current_data.nome || 'candidato',
  )
}
