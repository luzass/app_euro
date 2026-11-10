import type { GenericRow } from './dashboardHelpers'
import { normalizedText, profileField } from './studentProfile.ts'

// The original records stay in Supabase; these confirmed processes are out of scope.
export function isDashboardEnrollment(row: GenericRow, table = '') {
  const level = normalizedText(profileField(row, 'nivel_de_ensino', 'nivel_ensino', 'NIVEL DE ENSINO'))
  const process = normalizedText(profileField(row, 'processo_seletivo', 'PROCESSO SELETIVO'))
  if (/POS[ -]?GRADUACAO|EXTENSAO/.test(level) || /POS[ -]?GRADUACAO|EXTENSAO/.test(process)) return false
  if (!table.startsWith('inscritos_')) return true
  const period = profileField(row, 'ano_semestre', 'ANO/SEMESTRE').replace(/\D/g, '') || table.replace('inscritos_', '')
  const company = profileField(row, 'codcoligada')
  const code = profileField(row, 'codigo_do_processo')
  return !(company === '2' && (
    (period === '20242' && ['292', '294'].includes(code)) ||
    (period === '20251' && ['316', '357'].includes(code))
  ))
}
