import { supabase } from './supabase'
import type { EventImportRow, EventLeadPage, EventsDashboard } from './eventos'

async function rpc<T>(name: string, payload: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.rpc(name, payload)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code)) throw new Error('Execute o SQL eventos_captacao.sql no Supabase para liberar esta área.')
    if (error.code === '42501') throw new Error('Área restrita a Lucas Britto e Diego.')
    throw new Error(error.message)
  }
  return data as T
}
export const loadEventsDashboard = (period: string, force = false) => rpc<EventsDashboard>('eventos_painel', { p_periodo: period, p_forcar: force })
export const loadEventLeads = (period: string, event: string, status = '', page = 0) => rpc<EventLeadPage>('eventos_listar', { p_periodo: period, p_evento: event, p_situacao: status, p_pagina: page })
export async function importEventRows(key: string, name: string, fallback: string, rows: EventImportRow[], onProgress: (count: number) => void) {
  let imported = 0, ignored = 0
  for (let index = 0; index < rows.length; index += 250) {
    const result = await rpc<{ importados: number; ignorados: number }>('eventos_importar', {
      p_chave: key, p_arquivo: name, p_evento: fallback || null, p_linhas: rows.slice(index, index + 250),
    })
    imported += result.importados; ignored += result.ignorados
    onProgress(Math.min(index + 250, rows.length))
  }
  return { imported, ignored }
}
