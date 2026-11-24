import assert from 'node:assert/strict'
import {
  createCrmManagementCache,
  CRM_MANAGEMENT_TTL,
  CRM_KANBAN_REFRESH,
} from '../src/lib/crmManagementCache.ts'

assert.equal(CRM_KANBAN_REFRESH, 300000)
assert.equal(CRM_MANAGEMENT_TTL, 86400000)
let now = 0,
  calls = 0,
  fail = false
const cache = createCrmManagementCache(
  async (from, to, includeTests) => {
    calls++
    if (fail) throw new Error('Temporary error')
    return { from, to, include_tests: includeTests, generated_at: String(calls) }
  },
  () => now,
)
const load = (force = false) =>
  cache.load('manager:captacao_gerente', '2026-11-13', '2026-11-17', false, force)
const first = load(),
  concurrent = load()
assert.equal(first, concurrent)
assert.equal((await first).expiresAt, CRM_MANAGEMENT_TTL)
await load()
assert.equal(calls, 1)
now = CRM_MANAGEMENT_TTL - 1
await load()
assert.equal(calls, 1, 'Reuse data until the full 24h expires')
now++
assert.equal((await load()).data.generated_at, '2')
await load(true)
assert.equal(calls, 3, 'Manual refresh must bypass a valid cache')
await load()
assert.equal(calls, 3, 'Manual refresh replaces cache for subsequent visits')
await cache.load('manager:captacao_gerente', '2026-11-14', '2026-11-17', false)
await cache.load('manager:captacao_gerente', '2026-11-13', '2026-11-17', true)
assert.equal(calls, 5, 'Date and test inclusion must not share a cache entry')
await load()
assert.equal(calls, 5)
await cache.load('other:reitoria', '2026-11-13', '2026-11-17', false)
assert.equal(calls, 6, 'Different users cannot reuse cached candidates')
await load()
assert.equal(calls, 7, 'Switching accounts evicts the previous account')
await cache.load('manager:admin', '2026-11-13', '2026-11-17', false)
assert.equal(calls, 8, 'Changed permissions require a new snapshot')
cache.clear()
await load()
assert.equal(calls, 9, 'Logout removes snapshots')
fail = true
await assert.rejects(() => load(true), /Temporary error/)
fail = false
await load()
assert.equal(calls, 11, 'Failures are not retained and retry can recover')

const resolvers = []
const delayed = createCrmManagementCache(
  () => new Promise((resolve) => resolvers.push(resolve)),
  () => now,
)
const oldRequest = delayed.load('a', 'from', 'to', false)
delayed.clear()
const newRequest = delayed.load('a', 'from', 'to', false)
resolvers[1]({ generated_at: 'new' })
await newRequest
resolvers[0]({ generated_at: 'old' })
await oldRequest
assert.equal(
  (await delayed.load('a', 'from', 'to', false)).data.generated_at,
  'new',
  'Late response cannot repopulate cache after logout',
)
console.log(
  'PASS: Kanban 5min, BI 24h, manual refresh, in-flight deduplication, query isolation, role/account/logout boundaries, error retry and late responses',
)
