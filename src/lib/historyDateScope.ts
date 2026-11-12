import type { GenericRow } from './dashboardHelpers'
import { academicPeriod } from './enrollmentRenewal.ts'
import { dateDay, shiftedDay } from './campaignData.ts'
import { normalizedText, profileField } from './studentProfile.ts'

export type HistoryDateMode = 'full' | 'sameDate'
export type HistoryPeriod = { period: string; label: string; semester: '1' | '2'; inscritos: GenericRow[]; matriculados: GenericRow[] }
export function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value ?? '').join('-')
}
export function historyCutoff(period: string, asOf: string) {
  const day = dateDay(asOf), ps = academicPeriod(period)
  if (day === null || !ps) return null
  const date = new Date(day * 86400000), year = date.getUTCFullYear(), month = date.getUTCMonth() + 1
  const anchorYear = ps.endsWith('.1') ? month >= 7 ? year + 1 : year : month >= 4 ? year : year - 1
  return Math.min(day, shiftedDay(day, Number(ps.slice(0, 4)) - anchorYear))
}
export function scopeHistoryByDate(periods: HistoryPeriod[], mode: HistoryDateMode, asOf: string) {
  const sources = periods.map((source) => ({ ...source, inscritos: source.inscritos.map((row) => ({ row, period: academicPeriod(profileField(row, 'ano_semestre')) || source.period })), matriculados: source.matriculados.map((row) => ({ row, period: academicPeriod(profileField(row, 'periodo_letivo')) || source.period })) }))
  let invalidRegistrationDates = 0, invalidEnrollmentDates = 0, unplacedVeterans = 0
  const cutoffs: Array<{ period: string; day: number | null }> = []
  const result = periods.map((source) => {
    const cutoff = mode === 'sameDate' ? historyCutoff(source.period, asOf) : null
    cutoffs.push({ period: source.period, day: cutoff })
    const enrolled = sources.flatMap((item) => item.matriculados.filter((entry) => entry.period === source.period).map((entry) => entry.row))
    const registered = sources.flatMap((item) => item.inscritos.filter((entry) => entry.period === source.period).map((entry) => entry.row))
    if (mode === 'full') return { ...source, inscritos: registered, matriculados: enrolled }
    const year = Number(source.period.slice(0, 4))
    const renewalStart = Date.UTC(source.semester === '1' ? year - 1 : year, source.semester === '1' ? 6 : 0, 1) / 86400000
    return { ...source, inscritos: registered.filter((row) => {
      const day = dateDay(profileField(row, 'data_inscricao'))
      if (day === null) { invalidRegistrationDates++; return false }
      return cutoff !== null && day <= cutoff
    }), matriculados: enrolled.filter((row) => {
      const day = dateDay(profileField(row, 'data_baixa_do_pagamento'))
      if (day === null) { invalidEnrollmentDates++; return false }
      if (normalizedText(profileField(row, 'tipo_aluno')) === 'VETERANO' && day < renewalStart) { unplacedVeterans++; return false }
      return cutoff !== null && day <= cutoff
    }) }
  })
  return { periods: result, cutoffs, invalidRegistrationDates, invalidEnrollmentDates, unplacedVeterans }
}
