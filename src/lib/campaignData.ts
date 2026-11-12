import type { GenericRow } from './dashboardHelpers'
import { academicPeriod } from './enrollmentRenewal.ts'
import { normalizedText, profileField } from './studentProfile.ts'

export interface CampaignData { period: string; inscritos: GenericRow[]; matriculados: GenericRow[]; inscritosError?: string; matriculadosError?: string }
export interface ForecastConfig { currentPeriod: string; start: string; end: string; asOf: string; references: string[]; matriculaDate?: 'payment' | 'enrollment'; medicineCapacity?: number }
export interface ForecastScenario {
  observed: number; low: number | null; reference: number | null; high: number | null; reason: string
  method?: 'historical' | 'linear' | 'mixed' | 'cohort'; note?: string; complete?: boolean
}
export interface ActivePerson { cpf: string; type: 'calouro' | 'veterano' | null; rows: GenericRow[] }

export function matriculaDateFields(config: Pick<ForecastConfig, 'matriculaDate'>) {
  return config.matriculaDate === 'payment' ? ['data_baixa_do_pagamento'] : config.matriculaDate === 'enrollment' ? ['data_de_matricula'] : ['data_de_matricula', 'data_baixa_do_pagamento']
}
export function dateDay(value: unknown): number | null {
  const text = String(value ?? '').trim(), iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(text), br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(text)
  if (!iso && !br) return null
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(br![3]), Number(br![2]), Number(br![1])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() / 86400000 : null
}
export function cpfKey(row: GenericRow) {
  const digits = profileField(row, 'cpf').replace(/\D/g, '')
  return /^\d{1,11}$/.test(digits) && !/^0+$/.test(digits) ? digits.padStart(11, '0') : ''
}
export function activePeople(rows: GenericRow[]) {
  const groups = new Map<string, GenericRow[]>()
  for (const row of rows) {
    const cpf = cpfKey(row), contract = normalizedText(profileField(row, 'contrato'))
    if (!cpf || !['ATIVO', 'CONTRATO ATIVO'].includes(contract)) continue
    groups.set(cpf, [...(groups.get(cpf) ?? []), row])
  }
  const people = new Map<string, ActivePerson>()
  for (const [cpf, entries] of groups) {
    const types = new Set(entries.map((row) => normalizedText(profileField(row, 'tipo_aluno'))))
    const type = types.size === 1 && types.has('CALOURO') ? 'calouro' : types.size === 1 && types.has('VETERANO') ? 'veterano' : null
    people.set(cpf, { cpf, rows: entries, type })
  }
  return people
}
export function matriculasForPeriod(data: CampaignData[], period: string) {
  return data.flatMap((item) => item.matriculados).filter((row) => academicPeriod(profileField(row, 'periodo_letivo', 'PERIODO LETIVO')) === period)
}
export function registrationsForPeriod(data: CampaignData[], period: string) {
  return data.flatMap((source) => source.inscritos.filter((row) => (academicPeriod(profileField(row, 'ano_semestre', 'ANO/SEMESTRE')) || source.period) === period))
}
export function previousPeriod(period: string) { const [year, semester] = period.split('.'); return semester === '1' ? `${Number(year) - 1}.2` : `${year}.1` }
export function shiftedDay(day: number, years: number) {
  const date = new Date(day * 86400000), year = date.getUTCFullYear() + years, month = date.getUTCMonth(), last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(date.getUTCDate(), last)) / 86400000
}
export function personEvents(rows: GenericRow[], fields: string[]) {
  const people = new Map<string, number | null>()
  let invalidCpf = 0
  for (const row of rows) {
    const cpf = cpfKey(row)
    if (!cpf) { invalidCpf++; continue }
    const day = fields.map((field) => dateDay(profileField(row, field))).find((value) => value !== null) ?? null, existing = people.get(cpf)
    if (!people.has(cpf) || day !== null && (existing === null || existing === undefined || day < existing)) people.set(cpf, day)
  }
  return { people, invalidCpf, missingDates: [...people.values()].filter((day) => day === null).length }
}
export const isMedicine = (row: GenericRow) => normalizedText(profileField(row, 'curso')) === 'MEDICINA'
