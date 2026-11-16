import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Save, X } from 'lucide-react'
import type { CrmLossReason } from '../../lib/crmKanban'
import { crmRpc } from '../../lib/crmKanbanApi'
import { crmButton, crmInput } from './CrmContactForm'

export function CrmLossReasonManager({
  reasons,
  onClose,
  onSaved,
}: {
  reasons: CrmLossReason[]
  onClose: () => void
  onSaved: (reason: CrmLossReason) => void
}) {
  const [editing, setEditing] = useState<CrmLossReason | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [requiresNote, setRequiresNote] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onClose()
      if (event.key === 'Tab') {
        const list = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-crm-reasons] button:not(:disabled),[data-crm-reasons] input:not(:disabled)',
          ),
        ].filter((el) => el.offsetParent !== null)
        if (event.shiftKey && document.activeElement === list[0]) {
          event.preventDefault()
          list.at(-1)?.focus()
        } else if (!event.shiftKey && document.activeElement === list.at(-1)) {
          event.preventDefault()
          list[0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [onClose])
  const edit = (reason: CrmLossReason | null) => {
    setEditing(reason)
    setName(reason?.name || '')
    setActive(reason?.active ?? true)
    setRequiresNote(reason?.requires_note ?? false)
    setError('')
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <section
        data-crm-reasons
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-reasons-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-5">
          <h2 id="crm-reasons-title" className="text-lg font-semibold">
            Motivos de desistência
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={crmButton + ' !p-2'}
            title="Fechar motivos"
            aria-label="Fechar motivos"
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="flex justify-end">
            <button type="button" className={crmButton} disabled={busy} onClick={() => edit(null)}>
              <Plus size={15} />
              Novo motivo
            </button>
          </div>
          {editing !== undefined && (
            <form
              className="space-y-3 border-y border-slate-200 py-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (busy) return
                setBusy(true)
                setError('')
                try {
                  const result = await crmRpc<CrmLossReason>('crm_kanban_reason_save', {
                    p_id: editing?.id ?? null,
                    p_name: name.trim(),
                    p_active: active,
                    p_requires_note: requiresNote,
                    p_version: editing?.version ?? null,
                  })
                  onSaved(result)
                  setEditing(undefined)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <label className="block space-y-1 text-xs text-slate-600">
                <span>Nome do motivo</span>
                <input
                  aria-label="Nome do motivo"
                  className={crmInput}
                  required
                  minLength={3}
                  maxLength={120}
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-sky-600"
                    checked={active}
                    disabled={busy}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Ativo
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-sky-600"
                    checked={requiresNote}
                    disabled={busy || editing?.seed_key === 'other'}
                    onChange={(e) => setRequiresNote(e.target.checked)}
                  />
                  Exigir observação
                </label>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={crmButton}
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  Cancelar
                </button>
                <button type="submit" className={crmButton} disabled={busy}>
                  <Save size={15} />
                  {busy ? 'Salvando…' : 'Salvar motivo'}
                </button>
              </div>
            </form>
          )}
          <ul className="divide-y divide-slate-100">
            {reasons.map((reason) => (
              <li key={reason.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-slate-900">{reason.name}</p>
                  <p
                    className={
                      'mt-1 text-xs ' + (reason.active ? 'text-emerald-700' : 'text-slate-500')
                    }
                  >
                    {reason.active ? 'Ativo' : 'Desativado'}
                    {reason.requires_note ? ' · observação obrigatória' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className={crmButton + ' !p-2'}
                  disabled={busy}
                  title={'Editar ' + reason.name}
                  aria-label={'Editar motivo ' + reason.name}
                  onClick={() => edit(reason)}
                >
                  <Pencil size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
