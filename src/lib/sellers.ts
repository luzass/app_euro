import type { Profile } from './types'

export type Seller = 'Agestone' | 'William' | 'Gustavo' | 'Jordana'
export type GoalMonthKey = '05' | '06' | '07' | '08' | '09'

export interface GoalStage {
  label: string
  target: number
  reward: number
}

export const sellers: Seller[] = ['Agestone', 'William', 'Gustavo', 'Jordana']

export const monthConfig: Record<
  GoalMonthKey,
  {
    label: string
    normalTargets: number[]
  }
> = {
  '05': { label: 'Maio', normalTargets: [14, 15, 16, 18] },
  '06': { label: 'Junho', normalTargets: [21, 22, 23, 27] },
  '07': { label: 'Julho', normalTargets: [47, 49, 52, 60] },
  '08': { label: 'Agosto', normalTargets: [106, 110, 115, 134] },
  '09': { label: 'Setembro', normalTargets: [35, 36, 38, 44] },
}

export const normalRewards = [20, 30, 40, 60]
export const prouniTargets = [138, 150, 156]
export const prouniRewards = [20, 30, 40]

export function normalizeSellerString(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

export function normalizeSellerValue(value?: string | null): Seller | null {
  const normalized = normalizeSellerString(value)

  if (!normalized) {
    return null
  }

  if (
    normalized.includes('TONY') ||
    normalized.includes('AGESTONE') ||
    normalized.includes('FRANCISCO ALVES DA SILVA')
  ) {
    return 'Agestone'
  }

  if (
    normalized.includes('WILLIAM') ||
    normalized.includes('WILLAM') ||
    normalized.includes('SIDOU')
  ) {
    return 'William'
  }

  if (normalized.includes('GUSTAVO')) {
    return 'Gustavo'
  }

  if (normalized.includes('JORDANA')) {
    return 'Jordana'
  }

  return null
}

export function resolveSellerFromProfile(profile?: Profile | null) {
  if (!profile) {
    return null
  }

  return normalizeSellerValue(profile.nome) ?? normalizeSellerValue(profile.email)
}

export function getCurrentGoalMonthKey(): GoalMonthKey {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    month: '2-digit',
  })

  const month = formatter.format(new Date()) as GoalMonthKey

  if (month in monthConfig) {
    return month
  }

  return '07'
}

export function getVendorThresholds(targets: number[]) {
  return targets.map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target: Math.ceil(target / sellers.length),
  }))
}

export function buildNormalStages(monthKey: GoalMonthKey): GoalStage[] {
  const vendorTargets = getVendorThresholds(monthConfig[monthKey].normalTargets)

  return vendorTargets.map((item, index) => ({
    label: item.label,
    target: item.target,
    reward: normalRewards[index] ?? 0,
  }))
}

export function resolveGoalStage(count: number, stages: GoalStage[]) {
  let achieved: GoalStage | null = null
  let next: GoalStage | null = null

  for (const stage of stages) {
    if (count >= stage.target) {
      achieved = stage
      continue
    }

    next = stage
    break
  }

  return {
    achieved,
    next,
    remaining: next ? Math.max(next.target - count, 0) : 0,
  }
}

export function buildPayout(count: number, stage: GoalStage | null) {
  if (!stage || count <= 0) {
    return 0
  }

  return count * stage.reward
}
