import { supabase } from './supabase'
import type { WeeklyAction, WeeklyMember, WeeklyReport } from '../../supabase/functions/_shared/weeklyIntelligence'
export type WeeklyReportSummary = Pick<WeeklyReport,'id'|'cutoff'|'week_start'|'created_at'|'generated_at'|'model'|'last_error'>
export interface WeeklyWorkspace { reports: WeeklyReportSummary[]; actions: WeeklyAction[]; members: WeeklyMember[] }
async function rpc<T>(name: string, args?: Record<string,unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const {data,error} = await supabase.rpc(name,args)
  if (error) throw new Error(['PGRST202','42883','42P01'].includes(error.code) ? 'Instale o SQL captacao_inteligencia_semanal.sql no Supabase para abrir esta área.' : error.message)
  return data as T
}
export const loadWeeklyWorkspace = () => rpc<WeeklyWorkspace>('weekly_list')
export const loadWeeklyReport = async (id: string) => {
  const report = await rpc<WeeklyReport | null>('weekly_get',{p_id:id})
  if (!report) throw new Error('Fotografia não encontrada. Atualize a lista.')
  return report
}
export const saveWeeklyAction = (id: string, report: string, version: number | null, patch: Record<string,unknown>) => rpc<WeeklyAction>('weekly_action_save',{p_id:id,p_report:report,p_version:version,p_patch:patch})
async function invoke(body: Record<string,unknown>) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const {data,error} = await supabase.functions.invoke('weekly-intelligence',{body})
  if (error) {
    if (error.context instanceof Response) {
      const detail = await error.context.clone().json().catch(() => null)
      if (detail?.error) throw new Error(detail.error)
    }
    throw new Error('Não foi possível acessar a análise semanal. Confira se a função weekly-intelligence foi publicada e atualize a lista antes de repetir.')
  }
  if (data?.error) throw new Error(data.error)
  return data.report as WeeklyReport
}
export const captureWeeklyReport = (id: string, cutoff: string) => invoke({action:'capture',id,cutoff})
export const generateWeeklyDiagnosis = (id: string, includeNotes: boolean) => invoke({action:'generate',id,include_notes:includeNotes,reviewed:true})
