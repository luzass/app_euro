import type { CrmContact } from './crmKanban'

export type CrmArchiveView = 'board' | 'active' | 'lost' | 'archived'
export const crmLossColumn = { id: 'desistencia', label: 'Desistência', color: '#b91c1c' } as const
export const crmContactColumn = (contact: CrmContact) => contact.loss_data ? crmLossColumn.id : contact.stage
export const isCrmLossTarget = (id: string, contacts: CrmContact[]) =>
  id === 'stage:' + crmLossColumn.id || Boolean(contacts.find(contact => contact.id === id)?.loss_data)
export const lossEvidence = {
  candidate_reported: 'Informado pelo candidato',
  staff_inferred: 'Percepção do atendente',
} as const
export function matchesCrmArchiveView(contact: CrmContact, view: CrmArchiveView) {
  if (view === 'board') return !contact.archived || Boolean(contact.loss_data)
  if (view === 'active') return !contact.archived && !contact.loss_data
  return view === 'lost' ? Boolean(contact.loss_data) : contact.archived && !contact.loss_data
}
