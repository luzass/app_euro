import { supabase } from './supabase'
import type {
  CrmContact,
  CrmDetail,
  CrmPersonaRows,
  CrmSyncResult,
  CrmWorkspace,
} from './crmKanban'

export async function crmRpc<T>(name: string, parameters?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) {
    if (['PGRST202', '42P01', '42883'].includes(error.code))
      throw new Error('A estrutura do CRM ainda não está disponível no Supabase.')
    throw new Error(error.message || 'Não foi possível concluir a operação.')
  }
  return data as T
}
export async function loadCrmContacts(): Promise<CrmContact[]> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const rows: CrmContact[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('crm_kanban_contacts')
      .select('*')
      .order('id')
      .range(from, from + 999)
    if (error)
      throw new Error(
        error.code === '42P01' || error.code === 'PGRST205'
          ? 'A estrutura do CRM ainda não está disponível no Supabase.'
          : error.message,
      )
    rows.push(...(data as CrmContact[]))
    if (data.length < 1000) break
  }
  return [...new Map(rows.map((row) => [row.id, row])).values()]
}
export const loadCrmWorkspace = () => crmRpc<CrmWorkspace>('crm_kanban_workspace')
export const loadCrmDetail = (id: string, before?: number) =>
  crmRpc<CrmDetail>('crm_kanban_detail', { p_id: id, p_before: before ?? null })
export const saveCrmContact = (contact: CrmContact, patch: Record<string, unknown>) =>
  crmRpc<CrmContact>('crm_kanban_save', {
    p_id: contact.id,
    p_patch: patch,
    p_version: contact.version,
  })
export const syncCrmSources = () => crmRpc<CrmSyncResult>('crm_kanban_sync')
let personaCache: Promise<CrmPersonaRows> | null = null
export function loadCrmPersona() {
  if (!personaCache)
    personaCache = crmRpc<CrmPersonaRows>('crm_kanban_persona_rows').catch((error) => {
      personaCache = null
      throw error
    })
  return personaCache
}
