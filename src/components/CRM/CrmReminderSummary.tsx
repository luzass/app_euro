import { Bell } from 'lucide-react'
import { useMemo } from 'react'
import { buildCrmActions, summarizeCrmActions } from '../../lib/crmActions'
import type { CrmContact } from '../../lib/crmKanban'

export function CrmReminderSummary({ contacts, now }: { contacts: CrmContact[]; now: number }) {
  const counts = useMemo(() => summarizeCrmActions(buildCrmActions(contacts, now), now), [contacts, now])
  return (
    <section aria-label="Resumo de ações do Kanban" className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 pb-3 text-sm text-slate-600">
      <span aria-label="Ações vencidas" className="inline-flex items-center gap-2">
        <Bell size={16} aria-hidden="true" className={counts.overdue ? 'text-red-700' : 'text-slate-500'} />
        Ações vencidas <strong className={counts.overdue ? 'text-red-700' : 'text-slate-950'}>{counts.overdue}</strong>
      </span>
      <span aria-label="Ações previstas para hoje">Previstas para hoje <strong className="ml-2 text-slate-950">{counts.today}</strong></span>
      <span aria-label="Contatos sem interação há 3 dias">Sem interação há 3 dias ou mais <strong className="ml-2 text-slate-950">{counts.idle}</strong></span>
      <span aria-label="Contatos sem resposta há 3 dias">Sem resposta há 3 dias ou mais <strong className="ml-2 text-slate-950">{counts.response}</strong></span>
    </section>
  )
}
