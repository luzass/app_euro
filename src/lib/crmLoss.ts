import type { CrmContact } from './crmKanban'

export type CrmArchiveView = 'active' | 'lost' | 'archived'
export const lossEvidence = {
  candidate_reported: 'Informado pelo candidato',
  staff_inferred: 'Percepção do atendente',
} as const
export function matchesCrmArchiveView(contact: CrmContact, view: CrmArchiveView) {
  if (view === 'active') return !contact.archived && !contact.loss_data
  return view === 'lost' ? Boolean(contact.loss_data) : contact.archived && !contact.loss_data
}
