import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const SUPABASE_PAGE_SIZE = 1000

export type GenericRow = Record<string, unknown>

export interface PeriodTable {
  period: string
  label: string
  semester: '1' | '2'
  inscritosTable: string
  matriculadosTable: string
}

export const periodTables: PeriodTable[] = [
  {
    period: '2024.1',
    label: '2024.1',
    semester: '1',
    inscritosTable: 'inscritos_20241',
    matriculadosTable: 'matriculados_20241',
  },
  {
    period: '2024.2',
    label: '2024.2',
    semester: '2',
    inscritosTable: 'inscritos_20242',
    matriculadosTable: 'matriculados_20242',
  },
  {
    period: '2025.1',
    label: '2025.1',
    semester: '1',
    inscritosTable: 'inscritos_20251',
    matriculadosTable: 'matriculados_20251',
  },
  {
    period: '2025.2',
    label: '2025.2',
    semester: '2',
    inscritosTable: 'inscritos_20252',
    matriculadosTable: 'matriculados_20252',
  },
  {
    period: '2026.1',
    label: '2026.1',
    semester: '1',
    inscritosTable: 'inscritos_20261',
    matriculadosTable: 'matriculados_20261',
  },
  {
    period: '2026.2',
    label: '2026.2',
    semester: '2',
    inscritosTable: 'inscritos_20262',
    matriculadosTable: 'matriculados_20262',
  },
  {
    period: '2027.1',
    label: '2027.1',
    semester: '1',
    inscritosTable: 'inscritos_20271',
    matriculadosTable: 'matriculados_20271',
  },
  {
    period: '2027.2',
    label: '2027.2',
    semester: '2',
    inscritosTable: 'inscritos_20272',
    matriculadosTable: 'matriculados_20272',
  },
]

export async function fetchAllRows(tableName: string) {
  if (!supabase) {
    return { rows: [] as GenericRow[], error: null as PostgrestError | null }
  }

  const rows: GenericRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + SUPABASE_PAGE_SIZE - 1)

    if (error) {
      return { rows, error }
    }

    const pageRows = (data ?? []) as GenericRow[]
    rows.push(...pageRows)

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return { rows, error: null as PostgrestError | null }
}

export function normalizeCpf(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

export function pickText(row: GenericRow, fields: string[]) {
  for (const field of fields) {
    const value = row[field]

    if (value === null || value === undefined) {
      continue
    }

    const text = String(value).trim()

    if (text) {
      return text
    }
  }

  return ''
}

export function normalizeText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function titleize(value?: string | null) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()

  if (!text) {
    return 'Não informado'
  }

  return text
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((part) => {
      if (part.length <= 2) {
        return part
      }

      return part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1)
    })
    .join(' ')
}

export function normalizeCampus(value?: string | null) {
  const normalized = normalizeText(value)

  if (normalized.includes('AGUAS CLARAS')) {
    return 'Águas Claras'
  }

  if (normalized.includes('ASA SUL') || normalized.includes('EUROAM')) {
    return 'Asa Sul'
  }

  return titleize(value)
}

export function normalizeIngresso(value?: string | null) {
  const normalized = normalizeText(value)

  if (!normalized) {
    return 'Não informado'
  }

  if (normalized.includes('PROUNI')) {
    return 'PROUNI'
  }

  if (normalized.includes('FIES')) {
    return 'FIES'
  }

  if (normalized.includes('VESTIBULAR')) {
    return 'Vestibular'
  }

  if (normalized.includes('ENEM')) {
    return 'ENEM'
  }

  if (normalized.includes('GRADUADO')) {
    return 'Graduado'
  }

  if (normalized.includes('REINGRESSO')) {
    return 'Reingresso'
  }

  if (normalized.includes('READMISSAO') || normalized.includes('READMISSÃO')) {
    return 'Readmissão'
  }

  if (normalized.includes('TRANSFERENCIA') || normalized.includes('TRANSFERÊNCIA')) {
    return 'Transferência Externa'
  }

  if (normalized.includes('SEMIPRESENCIAL')) {
    return 'Semipresencial'
  }

  if (normalized === 'EAD') {
    return 'EAD'
  }

  return titleize(value)
}

export function getUniqueCpfCount(rows: GenericRow[]) {
  const cpfs = new Set<string>()

  rows.forEach((row) => {
    const cpf = normalizeCpf(row.cpf)

    if (cpf) {
      cpfs.add(cpf)
    }
  })

  return cpfs.size || rows.length
}

export function countBy<T>(
  rows: T[],
  getLabel: (row: T) => string,
  options: { includeEmpty?: boolean; limit?: number } = {},
) {
  const includeEmpty = options.includeEmpty ?? false
  const totals = new Map<string, number>()

  rows.forEach((row) => {
    const rawLabel = getLabel(row)
    const label = rawLabel?.trim() || 'Não informado'

    if (!includeEmpty && label === 'Não informado') {
      return
    }

    totals.set(label, (totals.get(label) ?? 0) + 1)
  })

  return Array.from(totals, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, options.limit ?? 12)
}

