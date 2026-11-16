import { Bell, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { CrmContact } from '../../lib/crmKanban'
import { crmReminders } from '../../lib/crmWorkflow'
import { crmInput } from './CrmContactForm'

export function CrmAgenda({
  contacts,
  now,
  onOpen,
}: {
  contacts: CrmContact[]
  now: number
  onOpen: (id: string) => void
}) {
  const [filter, setFilter] = useState('due')
  const [page, setPage] = useState(0)
  const reminders = crmReminders(contacts, now)
  const today = (time: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(time)
  const filtered = reminders.filter((r) =>
    filter === 'due'
      ? ['cadence', 'manual'].includes(r.kind) && r.due <= now
      : filter === 'today'
        ? ['cadence', 'manual'].includes(r.kind) && today(r.due) === today(now)
        : filter === 'all'
          ? true
          : r.kind === filter,
  )
  const overdue = reminders.filter(
    (r) => ['cadence', 'manual'].includes(r.kind) && r.due < now,
  ).length
  const stamp = (time: number) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(time)
  return (
    <details className="border-y border-slate-200 py-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
        <Bell size={16} />
        Agenda de atendimento{' '}
        <span className={overdue ? 'text-red-700' : 'text-slate-500'}>
          {overdue} ações vencidas
        </span>
        <span className="text-xs text-slate-500">
          {new Set(reminders.filter((r) => r.kind === 'idle').map((r) => r.contact.id)).size}{' '}
          contatos sem interação há 3 dias ou mais
        </span>
      </summary>
      <div className="mt-4 space-y-3">
        <label className="block max-w-xs space-y-1 text-xs text-slate-600">
          <span>Exibir na agenda</span>
          <select
            aria-label="Exibir na agenda"
            className={crmInput}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="due">Ações vencidas</option>
            <option value="today">Previstas para hoje</option>
            <option value="idle">Sem interação há 3 dias</option>
            <option value="response">Sem resposta há 3 dias</option>
            <option value="all">Todas as pendências</option>
          </select>
        </label>
        <ul className="divide-y divide-slate-100">
          {filtered.slice(page * 8, page * 8 + 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50"
                onClick={() => onOpen(item.contact.id)}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium text-slate-900">
                    {item.contact.current_data.nome || 'Nome não informado'}
                  </span>
                  <span className="block break-words text-xs text-slate-500">
                    {item.contact.current_data.curso || 'Curso não informado'} · {item.label} ·{' '}
                    {stamp(item.due)}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
        {!filtered.length && (
          <p className="py-2 text-sm text-slate-500">Nenhuma pendência neste recorte.</p>
        )}
        {filtered.length > 8 && (
          <div className="flex items-center justify-end gap-3 text-xs text-slate-600">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span>
              {page + 1} / {Math.ceil(filtered.length / 8)}
            </span>
            <button
              type="button"
              disabled={(page + 1) * 8 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </details>
  )
}
