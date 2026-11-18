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
  if (
    error &&
    ['crm_kanban_documents', 'crm_kanban_document_save', 'crm_kanban_document_cancel'].includes(
      name,
    ) &&
    ['PGRST202', '42883', '42P01'].includes(error.code)
  )
    throw new Error(
      'A atualização de Documentação ainda precisa ser instalada no Supabase: crm_kanban_documentacao.sql.',
    )
  if (error && name === 'crm_kanban_bi_snapshot' && ['PGRST202', '42883'].includes(error.code))
    throw new Error(
      'A consulta da Gestão do CRM ainda precisa ser instalada no Supabase: crm_kanban_gestao_bi.sql.',
    )
  if (error) {
    if (
      ['crm_kanban_reason_save', 'crm_kanban_close_loss', 'crm_kanban_reopen_loss'].includes(
        name,
      ) &&
      ['PGRST202', '42883'].includes(error.code)
    )
      throw new Error(
        'A atualização dos motivos de desistência ainda precisa ser instalada no Supabase.',
      )
    if (
      ['crm_kanban_activity_v2', 'crm_kanban_resume_cadence'].includes(name) &&
      ['PGRST202', '42883'].includes(error.code)
    )
      throw new Error(
        'A atualização do funil e das cadências ainda precisa ser instalada no Supabase.',
      )
    if (name === 'crm_kanban_persona_course' && ['PGRST202', '42883'].includes(error.code))
      throw new Error('A consulta atualizada da persona precisa ser instalada no Supabase.')
    if (name === 'crm_kanban_persona_course' && error.code === '57014')
      throw new Error(
        'A consulta da persona excedeu o tempo limite. Tente novamente; se persistir, revise a atualização da consulta no Supabase.',
      )
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
const personaCache = new Map<string, { expires: number; promise: Promise<CrmPersonaRows> }>()
export function loadCrmPersona(course: string) {
  const key = course.trim()
  if (!key) return Promise.resolve({ rows: [], missing: [] } as CrmPersonaRows)
  const cached = personaCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.promise
  const promise = crmRpc<CrmPersonaRows>('crm_kanban_persona_course', { p_course: key }).catch(
    (error) => {
      if (personaCache.get(key)?.promise === promise) personaCache.delete(key)
      throw error
    },
  )
  personaCache.set(key, { expires: Date.now() + 10 * 60 * 1000, promise })
  return promise
}
