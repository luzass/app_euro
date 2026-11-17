import { crmRpc } from './crmKanbanApi'
import type { BiSnapshot } from './crmManagement'

export const loadCrmManagement = (from: string, to: string, includeTests: boolean) =>
  crmRpc<BiSnapshot>('crm_kanban_bi_snapshot', {
    p_from: from,
    p_to: to,
    p_include_tests: includeTests,
  })
