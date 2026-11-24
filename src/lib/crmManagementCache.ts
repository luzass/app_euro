import type { BiSnapshot } from './crmManagement.ts'

export const CRM_MANAGEMENT_TTL = 24 * 60 * 60 * 1000
export const CRM_KANBAN_REFRESH = 5 * 60 * 1000
export interface CrmManagementCacheEntry {
  data: BiSnapshot
  expiresAt: number
}

export function createCrmManagementCache(
  fetchSnapshot: (from: string, to: string, includeTests: boolean) => Promise<BiSnapshot>,
  now: () => number = Date.now,
) {
  const entries = new Map<string, CrmManagementCacheEntry>()
  const pending = new Map<string, Promise<CrmManagementCacheEntry>>()
  let activeScope = ''
  let generation = 0
  const clear = () => {
    generation++
    entries.clear()
    pending.clear()
    activeScope = ''
  }
  return {
    clear,
    load(scope: string, from: string, to: string, includeTests: boolean, force = false) {
      if (scope !== activeScope) {
        clear()
        activeScope = scope
      }
      const key = JSON.stringify([scope, from, to, includeTests])
      const inFlight = pending.get(key)
      if (inFlight) return inFlight
      const cached = entries.get(key)
      if (!force && cached && cached.expiresAt > now()) return Promise.resolve(cached)
      entries.delete(key)
      const requestGeneration = generation
      const request = fetchSnapshot(from, to, includeTests)
        .then((data) => {
          const entry = { data, expiresAt: now() + CRM_MANAGEMENT_TTL }
          // A response from a previous login must not repopulate the cache.
          if (generation === requestGeneration) {
            entries.set(key, entry)
            if (entries.size > 8) entries.delete(entries.keys().next().value!)
          }
          return entry
        })
        .finally(() => {
          if (pending.get(key) === request) pending.delete(key)
        })
      pending.set(key, request)
      return request
    },
  }
}
