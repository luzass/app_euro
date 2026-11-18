export interface CrmDocument {
  id: string
  contact_id: string
  course: string
  description: string
  sent_at: string
  received_at: string | null
  note: string
  receipt_note: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  version: number
  cancelled_at: string | null
  cancel_reason: string | null
}
export interface CrmDocumentStats {
  course: string
  completed: number
  pending: number
  mean_hours: number | null
  median_hours: number | null
  oldest_hours: number | null
}
export interface CrmDocumentsWorkspace {
  documents: CrmDocument[]
  courses: string[]
  stats: CrmDocumentStats[]
  generated_at: string
}
export const documentLocalTime = (iso = new Date().toISOString()) => {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}
export const documentHours = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) return '—'
  return hours < 1
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours * 60) + ' min'
    : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours) + ' h'
}
export function documentDuration(row: CrmDocument, now: number) {
  const hours =
    ((row.received_at ? Date.parse(row.received_at) : now) - Date.parse(row.sent_at)) / 3600000
  return documentHours(Number.isFinite(hours) ? Math.max(0, hours) : null)
}
