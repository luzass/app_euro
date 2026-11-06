import type { GenericRow } from './dashboardHelpers'

export function normalizedText(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
}

export function profileField(row: GenericRow, ...names: string[]) {
  for (const name of names) {
    const direct = row[name]
    if (direct !== null && direct !== undefined && String(direct).trim()) return String(direct).trim()
    const value = Object.entries(row).find(([key, candidate]) => normalizedText(key) === normalizedText(name) && candidate !== null && candidate !== undefined && String(candidate).trim())?.[1]
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function normalizeCep(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!/^\d{7,8}$/.test(digits) || /^0+$/.test(digits)) return ''
  return digits.padStart(8, '0')
}

function parseDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value)
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(value)
  if (!match && !br) return null
  const [year, month, day] = match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [Number(br![3]), Number(br![2]), Number(br![1])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? [year, month, day] : null
}

export function enrollmentAge(row: GenericRow): number | null {
  const birth = parseDate(profileField(row, 'data_de_nascimento', 'DATA DE NASCIMENTO'))
  const enrollment = parseDate(profileField(row, 'data_de_matricula', 'DATA DE MATRÍCULA'))
    ?? parseDate(profileField(row, 'data_baixa_do_pagamento', 'DATA BAIXA DO PAGAMENTO'))
  if (birth && enrollment) {
    const age = enrollment[0] - birth[0] - (enrollment[1] < birth[1] || (enrollment[1] === birth[1] && enrollment[2] < birth[2]) ? 1 : 0)
    return age >= 10 && age <= 100 ? age : null
  }
  const value = profileField(row, 'idade_matricula', 'IDADE MATRICULA')
  const age = Number(value)
  return /^\d{1,3}$/.test(value) && age >= 10 && age <= 100 ? age : null
}

export function schoolType(value: string) {
  const text = normalizedText(value)
  if (/PUBLIC|ESTADUAL|MUNICIPAL|FEDERAL/.test(text)) return 'Pública'
  if (/PRIVAD|PARTICULAR/.test(text)) return 'Privada'
  return ''
}

export function genderLabel(value: string) {
  const text = normalizedText(value)
  if (text === 'M' || text === 'MASCULINO') return 'Masculino'
  if (text === 'F' || text === 'FEMININO') return 'Feminino'
  if (text === 'OUTRO' || text === 'OUTROS') return 'Outro'
  return ''
}

export function ageBand(age: number | null) {
  if (age === null) return ''
  if (age < 18) return 'Até 17 anos'
  if (age <= 24) return '18 a 24 anos'
  if (age <= 34) return '25 a 34 anos'
  if (age <= 44) return '35 a 44 anos'
  return '45 anos ou mais'
}

export function medianAge(ages: number[]): number | null {
  if (!ages.length) return null
  const sorted = ages.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export interface ProfileSource {
  period: string
  rows: GenericRow[]
}

// One snapshot per person: the most recent selected period, then an active contract.
export function uniqueProfileRows(sources: ProfileSource[]) {
  const people = new Map<string, GenericRow>()
  const sorted = sources.slice().sort((a, b) => b.period.localeCompare(a.period))
  for (const source of sorted) {
    const byCpf = new Map<string, GenericRow>()
    for (const row of source.rows) {
      const digits = profileField(row, 'cpf').replace(/\D/g, '')
      if (!/^\d{1,11}$/.test(digits) || /^0+$/.test(digits)) continue
      const cpf = digits.padStart(11, '0')
      const existing = byCpf.get(cpf)
      const active = normalizedText(profileField(row, 'contrato')) === 'ATIVO'
      if (!existing || (active && normalizedText(profileField(existing, 'contrato')) !== 'ATIVO')) byCpf.set(cpf, row)
    }
    for (const [cpf, row] of byCpf) {
      if (!people.has(cpf)) people.set(cpf, { ...row, cpf })
    }
  }
  return [...people.values()]
}

export function buildCepCache(rows: GenericRow[]) {
  const cache = new Map<string, GenericRow>()
  for (const row of rows) {
    const cep = normalizeCep(row.cep)
    if (cep && row.erro !== true && row.erro !== 'true') cache.set(cep, row)
  }
  return cache
}

export function profileAddress(row: GenericRow, cache: Map<string, GenericRow>) {
  const cep = normalizeCep(profileField(row, 'cep', 'cep_normalizado'))
  const cached = cache.get(cep) ?? {}
  return {
    bairro: profileField(row, 'bairro_cep') || profileField(cached, 'bairro'),
    cidade: profileField(row, 'cidade_cep') || profileField(cached, 'cidade'),
    estado: (profileField(row, 'estado_cep') || profileField(cached, 'estado')).toUpperCase(),
  }
}
