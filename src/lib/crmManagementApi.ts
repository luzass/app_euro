import { crmRpc } from './crmKanbanApi'
import type { BiSnapshot } from './crmManagement'
import { createCrmManagementCache } from './crmManagementCache'

const managementCache = createCrmManagementCache((from, to, includeTests) =>
  crmRpc<BiSnapshot>('crm_kanban_bi_snapshot', {
    p_from: from,
    p_to: to,
    p_include_tests: includeTests,
  }),
)

export const loadCrmManagement = managementCache.load
export const clearCrmManagementCache = managementCache.clear
