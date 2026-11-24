import { cpfKey, dateDay, isMedicine } from './campaignData.ts'
import { profileField } from './studentProfile.ts'
import type { GenericRow } from './dashboardHelpers'

export const funnelLeadCutoff = '2026-11-15'
const leadCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function funnelLeadDay(value: unknown) {
  const text = String(value ?? '').trim()
  const day = dateDay(text)
  if (day === null) return null
  if (/^\d{4}-\d{2}-\d{2}[T ].*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const instant = new Date(text)
    if (!Number.isFinite(instant.getTime())) return null
    const parts = leadCalendar.formatToParts(instant)
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
  }
  return new Date(day * 86400000).toISOString().slice(0, 10)
}

export function scopeFunnelLeadsByDate<T extends GenericRow>(rows: T[], cutoff = funnelLeadCutoff) {
  const eligible: T[] = []
  let excludedBefore = 0, missingOrInvalidDates = 0
  for (const row of rows) {
    const day = funnelLeadDay(profileField(row, 'created_at', 'data_criacao', 'data'))
    if (!day) missingOrInvalidDates++
    else if (day < cutoff) excludedBefore++
    else eligible.push(row)
  }
  return { rows: eligible, excludedBefore, missingOrInvalidDates }
}

export type FunnelOrigin = 'Lead' | 'Inscrito' | 'Matriculado'
export type FunnelChartKey = 'origin' | 'status' | 'curso' | 'campus' | 'processo' | 'turno'
export type FunnelSelections = Record<FunnelChartKey, string[]>
export const funnelStatuses = ['Não inscritos', 'Inscritos sem matrícula', 'Matriculados', 'Sem CPF para cruzar'] as const
export const funnelStatusColors: Record<string, string> = {
  'Não inscritos': '#64748b',
  'Inscritos sem matrícula': '#0284c7',
  Matriculados: '#059669',
  'Sem CPF para cruzar': '#b45309',
}
export interface FunnelRow {
  origin: FunnelOrigin
  cpf: string
  curso: string
  campus: string
  processo: string
  turno: string
  leadId?: string
  studentType?: 'calouro' | 'veterano'
}

export function linkFunnelLeads(rows: FunnelRow[]) {
  const inscriptions = new Map<string, FunnelRow[]>()
  const enrollments = new Map<string, FunnelRow[]>()
  for (const row of rows) {
    const cpf = cpfKey({ cpf: row.cpf })
    if (!cpf || row.origin === 'Lead') continue
    const index = row.origin === 'Inscrito' ? inscriptions : enrollments
    const matches = index.get(cpf) ?? []
    matches.push(row)
    index.set(cpf, matches)
  }
  // Only the analytical projection changes. Each actual registration tuple is kept intact.
  return rows.flatMap(row => {
    if (row.origin !== 'Lead') return [row]
    const cpf = cpfKey({ cpf: row.cpf })
    const matches = [...(inscriptions.get(cpf) ?? []), ...(enrollments.get(cpf) ?? [])]
    return matches.length ? matches.map(match => ({ ...match, origin: 'Lead' as const, leadId: row.leadId })) : [row]
  })
}

export function analyzeLeadFunnel(
  rows: FunnelRow[],
  selections: FunnelSelections,
  options: { includeMedicine: boolean; studentType: 'all' | 'calouro' | 'veterano' },
) {
  const linked = linkFunnelLeads(rows.map((row, index) => ({
    ...row,
    cpf: cpfKey({ cpf: row.cpf }),
    leadId: row.leadId ?? `row:${index}`,
  })))
  const scoped = linked.filter(row =>
    (options.includeMedicine || !isMedicine({ curso: row.curso })) &&
    (options.studentType === 'all' || row.studentType === options.studentType) &&
    (['curso', 'campus', 'processo', 'turno'] as const).every(key =>
      !selections[key].length || selections[key].includes(row[key])))
  const identity = (row: FunnelRow) => row.cpf || `unmatched:${row.leadId}`
  const leads = scoped.filter(row => row.origin === 'Lead')
  const people = new Map(leads.map(row => [identity(row), row]))
  const inscriptions = new Set(scoped.filter(row => row.origin === 'Inscrito' && row.cpf && people.has(row.cpf)).map(row => row.cpf))
  const enrollments = new Set(scoped.filter(row => row.origin === 'Matriculado' && row.cpf && people.has(row.cpf)).map(row => row.cpf))
  const statusFor = (key: string, row: FunnelRow) => !row.cpf ? funnelStatuses[3]
    : enrollments.has(key) ? funnelStatuses[2]
    : inscriptions.has(key) ? funnelStatuses[1] : funnelStatuses[0]
  const selected = new Set([...people].filter(([key, row]) => {
    const originMatch = !selections.origin.length || selections.origin.includes('Lead') ||
      selections.origin.includes('Inscrito') && inscriptions.has(key) ||
      selections.origin.includes('Matriculado') && enrollments.has(key)
    return originMatch && (!selections.status.length || selections.status.includes(statusFor(key, row)))
  }).map(([key]) => key))
  const matchedCount = (matches: Set<string>) => [...selected].filter(key => matches.has(key)).length
  const statusData = funnelStatuses.map(label => ({
    label,
    value: [...selected].filter(key => statusFor(key, people.get(key)!) === label).length,
  })).filter(row => row.label !== funnelStatuses[3] || row.value > 0)
  const chartRows = leads.filter(row => selected.has(identity(row)))
  const byDimension = (field: 'curso' | 'campus' | 'processo' | 'turno') => {
    const totals = new Map<string, Set<string>>()
    for (const row of chartRows) {
      const label = row[field] || 'Não informado'
      const keys = totals.get(label) ?? new Set<string>()
      keys.add(identity(row))
      totals.set(label, keys)
    }
    return [...totals].map(([label, keys]) => ({ label, value: keys.size })).sort((a, b) => b.value - a.value)
  }
  return {
    leadsCount: selected.size,
    inscritosCount: matchedCount(inscriptions),
    matriculadosCount: matchedCount(enrollments),
    unknownCpfCount: [...selected].filter(key => !people.get(key)!.cpf).length,
    enrollmentWithoutInscription: [...selected].filter(key => enrollments.has(key) && !inscriptions.has(key)).length,
    sourceData: statusData,
    courseData: byDimension('curso'), campusData: byDimension('campus'),
    processoData: byDimension('processo'), turnoData: byDimension('turno'),
  }
}
