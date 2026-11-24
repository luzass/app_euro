import { cpfKey } from './campaignData.ts'

export type FunnelOrigin = 'Lead' | 'Inscrito' | 'Matriculado'
export type FunnelChartKey = 'origin' | 'curso' | 'campus' | 'processo' | 'turno'
export type FunnelSelections = Record<FunnelChartKey, string[]>
export interface FunnelRow {
  origin: FunnelOrigin
  cpf: string
  curso: string
  campus: string
  processo: string
  turno: string
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
    const matches = inscriptions.get(cpf) ?? enrollments.get(cpf)
    return matches?.length ? matches.map(match => ({ ...match, origin: 'Lead' as const })) : [row]
  })
}

export function filterFunnelCohort(rows: FunnelRow[], selections: FunnelSelections) {
  const selected = new Set(selections.origin)
  const people = new Set(rows.filter(row => selected.has(row.origin)).map(row => cpfKey({ cpf: row.cpf })).filter(Boolean))
  return rows.filter(row => {
    const cpf = cpfKey({ cpf: row.cpf })
    // Missing/invalid identifiers must never join unrelated people across sources.
    if (selected.size && !(cpf ? people.has(cpf) : selected.has(row.origin))) return false
    return (['curso', 'campus', 'processo', 'turno'] as const).every(key =>
      !selections[key].length || selections[key].includes(row[key]))
  })
}
