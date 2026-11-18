import { crmRpc } from './crmKanbanApi'
import type { CrmContact } from './crmKanban'
import type { CrmDocument, CrmDocumentsWorkspace } from './crmDocuments'
export const loadCrmDocuments = (contactId: string) =>
  crmRpc<CrmDocumentsWorkspace>('crm_kanban_documents', { p_contact: contactId })
export const saveCrmDocument = (
  contactId: string,
  document: Pick<
    CrmDocument,
    'id' | 'course' | 'description' | 'sent_at' | 'received_at' | 'note' | 'receipt_note'
  >,
  version: number | null,
  reason: string,
) =>
  crmRpc<{ document: CrmDocument; contact: CrmContact }>('crm_kanban_document_save', {
    p_contact: contactId,
    p_id: document.id,
    p_course: document.course,
    p_description: document.description,
    p_sent: document.sent_at,
    p_received: document.received_at,
    p_note: document.note,
    p_receipt_note: document.receipt_note,
    p_version: version,
    p_reason: reason || null,
  })
export const cancelCrmDocument = (id: string, version: number, reason: string) =>
  crmRpc<{ document: CrmDocument; contact: CrmContact }>('crm_kanban_document_cancel', {
    p_id: id,
    p_version: version,
    p_reason: reason,
  })
