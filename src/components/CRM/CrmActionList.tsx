import { ChevronLeft, ChevronRight, ClipboardList, Phone, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { crmStageLabel, crmWhatsapp, formatCrmPhone, type CrmContact, type CrmMember } from '../../lib/crmKanban'
import { buildCrmActions, crmActionDay, crmActionDescription, crmActionInWindow, type CrmActionWindow } from '../../lib/crmActions'
import type { CrmReminder } from '../../lib/crmWorkflow'
import { crmButton, crmInput } from './CrmContactForm'

const kinds = { cadence: 'Cadência', manual: 'Retorno agendado', idle: 'Sem interação', response: 'Sem resposta' }
const stamp = (time: number) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(time)
function timing(due: number, now: number) {
  if (due >= now) return crmActionDay(due) === crmActionDay(now) ? 'Prevista para hoje' : 'Agendada'
  const minutes = Math.floor((now - due) / 60000)
  if (minutes < 1) return 'Vencendo agora'
  if (minutes < 60) return `Vencida há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Vencida há ${hours} h`
  const days = Math.floor(hours / 24)
  return `Vencida há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

export function CrmActionList({ contacts, members, now, ownerId, onOpen }: {
  contacts: CrmContact[]
  members: CrmMember[]
  now: number
  ownerId?: string
  onOpen: (action: CrmReminder) => void
}) {
  const [window, setWindow] = useState<CrmActionWindow>('pending')
  const [kind, setKind] = useState('all')
  const [page, setPage] = useState(0)
  const actions = useMemo(() => buildCrmActions(contacts, now, ownerId), [contacts, now, ownerId])
  const filtered = actions.filter(action => crmActionInWindow(action, now, window)
    && (kind === 'all' || action.kind === kind))
  const lastPage = Math.max(0, Math.ceil(filtered.length / 20) - 1)
  const currentPage = Math.min(page, lastPage)
  const overdue = actions.filter(action => action.due < now).length
  const today = actions.filter(action => crmActionDay(action.due) === crmActionDay(now)).length
  return (
    <section aria-label="Fila de ações" className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-slate-200 pb-3 text-sm text-slate-600">
        <span>Vencidas <strong className={overdue ? 'ml-2 text-red-700' : 'ml-2 text-slate-950'}>{overdue}</strong></span>
        <span>Previstas para hoje <strong className="ml-2 text-slate-950">{today}</strong></span>
        <span>Contatos na fila <strong className="ml-2 text-slate-950">{new Set(filtered.map(action => action.contact.id)).size}</strong></span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 space-y-1 text-xs text-slate-600 sm:max-w-xs">
          <span>Prazo</span>
          <select aria-label="Prazo das ações" className={crmInput} value={window} onChange={event => { setWindow(event.target.value as CrmActionWindow); setPage(0) }}>
            <option value="pending">Vencidas e hoje</option>
            <option value="overdue">Somente vencidas</option>
            <option value="today">Previstas para hoje</option>
            <option value="future">Próximos dias</option>
            <option value="all">Todas as ações</option>
          </select>
        </label>
        <label className="min-w-48 flex-1 space-y-1 text-xs text-slate-600 sm:max-w-xs">
          <span>Tipo de ação</span>
          <select aria-label="Tipo de ação" className={crmInput} value={kind} onChange={event => { setKind(event.target.value); setPage(0) }}>
            <option value="all">Todos os tipos</option>
            {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span className="pb-2 text-xs text-slate-500">{filtered.length} ações</span>
      </div>
      <ol className="divide-y divide-slate-200 border-y border-slate-200">
        {filtered.slice(currentPage * 20, currentPage * 20 + 20).map(action => {
          const contact = action.contact, data = contact.current_data
          const whatsapp = crmWhatsapp(data.telefone)
          const owner = members.find(member => member.id === contact.owner_id)
          return (
            <li key={action.id} data-action-id={action.id} data-action-due={action.due} className="grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,.7fr)_auto] md:items-start">
              <div className="min-w-0 space-y-1 break-words">
                <button className="text-left text-sm font-semibold text-sky-700 underline decoration-sky-200 underline-offset-2 hover:decoration-sky-700" onClick={() => onOpen(action)}>{data.nome || 'Nome não informado'}</button>
                <p className="text-xs text-slate-600">{data.curso || 'Curso não informado'} · {data.campus || 'Campus não informado'} · {data.turno || 'Turno não informado'}</p>
                {data.telefone && <p className="text-xs text-slate-600">{formatCrmPhone(data.telefone)}</p>}
                <p className="flex items-center gap-1 text-xs text-slate-500"><UserRound size={12} className="shrink-0" />{owner?.nome || 'Sem responsável'}</p>
              </div>
              <div className="min-w-0 space-y-1 break-words">
                <p className="text-sm font-medium text-slate-900">{action.kind === 'manual' ? action.label : `${kinds[action.kind]} · ${action.label}`}</p>
                <p className="text-sm text-slate-600">{crmActionDescription(action)}</p>
                <p className="text-xs text-slate-500">{crmStageLabel(contact.stage)}</p>
              </div>
              <div className="space-y-1 text-xs">
                <p className={action.due < now ? 'font-medium text-red-700' : 'font-medium text-slate-700'}>{timing(action.due, now)}</p>
                <p className="text-slate-500">{stamp(action.due)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className={crmButton} title="Abrir ação" aria-label={`Abrir ação de ${data.nome || 'contato'}: ${action.label}`} onClick={() => onOpen(action)}><ClipboardList size={16} /><span className="md:sr-only">Abrir ação</span></button>
                {whatsapp && <a className={crmButton} href={whatsapp} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" aria-label={`WhatsApp de ${data.nome || 'contato'}`}><Phone size={16} /><span className="md:sr-only">WhatsApp</span></a>}
              </div>
            </li>
          )
        })}
      </ol>
      {!filtered.length && <p role="status" className="py-8 text-center text-sm text-slate-500">Nenhuma ação pendente neste recorte.</p>}
      {filtered.length > 20 && <div className="flex items-center justify-end gap-3 text-xs text-slate-600">
        <button className={crmButton} title="Página anterior" aria-label="Página anterior de ações" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
        <span>Página {currentPage + 1} de {lastPage + 1}</span>
        <button className={crmButton} title="Próxima página" aria-label="Próxima página de ações" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button>
      </div>}
    </section>
  )
}
