import type { Profile } from './types'

export type Seller = 'Agestone' | 'William' | 'Gustavo' | 'Jordana'
export type GoalMonthKey = '05' | '06' | '07' | '08' | '09'
export type ActiveTeamSize = 2 | 3 | 4

export interface GoalStage {
  label: string
  target: number
  reward: number
}

export const sellers: Seller[] = ['Agestone', 'William', 'Gustavo', 'Jordana']

export const monthConfig: Record<GoalMonthKey, { label: string }> = {
  '05': { label: 'Maio' },
  '06': { label: 'Junho' },
  '07': { label: 'Julho' },
  '08': { label: 'Agosto' },
  '09': { label: 'Setembro' },
}

export const normalRewards = [20, 30, 40, 60]
export const prouniTargets = [138, 150, 156]
export const prouniRewards = [20, 30, 40]

export const policyNormalTargets: Record<ActiveTeamSize, Record<GoalMonthKey, number[]>> = {
  2: {
    '05': [7, 8, 9, 10],
    '06': [10, 11, 12, 13],
    '07': [24, 25, 26, 30],
    '08': [53, 55, 58, 67],
    '09': [17, 18, 19, 22],
  },
  3: {
    '05': [5, 6, 7, 8],
    '06': [7, 8, 9, 10],
    '07': [16, 17, 18, 20],
    '08': [35, 37, 38, 45],
    '09': [12, 13, 14, 15],
  },
  4: {
    '05': [4, 5, 6, 7],
    '06': [6, 7, 8, 9],
    '07': [12, 13, 14, 15],
    '08': [27, 28, 29, 34],
    '09': [9, 10, 11, 12],
  },
}

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

export function getDefaultActiveTeamSize(): ActiveTeamSize {
  return 4
}

export function buildNormalStages(
  monthKey: GoalMonthKey,
  teamSize: ActiveTeamSize = getDefaultActiveTeamSize(),
): GoalStage[] {
  return policyNormalTargets[teamSize][monthKey].map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target,
    reward: normalRewards[index] ?? 0,
  }))
}

export function buildProuniStages() {
  return prouniTargets.map((target, index) => ({
    label: `Meta ${String(index + 1).padStart(2, '0')}`,
    target: Math.ceil(target / sellers.length),
    reward: prouniRewards[index] ?? 0,
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
