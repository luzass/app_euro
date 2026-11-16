import { useState, type FormEvent } from 'react'
import { RotateCcw, UserRoundX, X } from 'lucide-react'
import type { CrmContact, CrmLossReason } from '../../lib/crmKanban'
import { crmStageLabel } from '../../lib/crmKanban'
import { crmRpc } from '../../lib/crmKanbanApi'
import { lossEvidence } from '../../lib/crmLoss'
import { crmButton, crmInput } from './CrmContactForm'

export function CrmLossPanel({
  contact,
  reasons,
  ready,
  editable,
  busy,
  onSaved,
  notify,
}: {
  contact: CrmContact
  reasons: CrmLossReason[]
  ready: boolean
  editable: boolean
  busy: boolean
  onSaved: (contact: CrmContact) => void
  notify: (text: string, error?: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [reasonId, setReasonId] = useState('')
  const [evidence, setEvidence] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const loss = contact.loss_data
  const selected = reasons.find((r) => r.id === reasonId)
  if (contact.archived && !loss) return null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')
    if (!loss && (!selected?.active || !evidence)) {
      setError('Selecione um motivo ativo e a origem da informação.')
      return
    }
    if (!loss && selected?.requires_note && !note.trim()) {
      setError('Este motivo exige uma observação.')
      return
    }
    setSaving(true)
    try {
      const updated = loss
        ? await crmRpc<CrmContact>('crm_kanban_reopen_loss', {
            p_id: contact.id,
            p_version: contact.version,
            p_note: note.trim(),
          })
        : await crmRpc<CrmContact>('crm_kanban_close_loss', {
            p_id: contact.id,
            p_version: contact.version,
            p_reason: reasonId,
            p_evidence: evidence,
            p_note: note.trim(),
          })
      onSaved(updated)
      setOpen(false)
      setNote('')
      setReasonId('')
      setEvidence('')
      notify(
        loss
          ? 'Atendimento reaberto. O histórico da desistência foi preservado.'
          : 'Desistência registrada com motivo e origem da informação.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="space-y-3 border-y border-slate-200 py-4">
      {loss ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-700">Desistência registrada</p>
              <h3 className="mt-1 break-words text-sm font-semibold text-slate-900">
                {loss.reason_label}
              </h3>
            </div>
            <button
              type="button"
              className={crmButton}
              disabled={!editable || busy || saving || !ready}
              onClick={() => {
                setOpen(!open)
                setError('')
                setNote('')
              }}
            >
              <RotateCcw size={15} />
              Reabrir atendimento
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {lossEvidence[loss.evidence]} · {crmStageLabel(loss.stage)} ·{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(loss.closed_at))}
          </p>
          {loss.note && (
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{loss.note}</p>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Encerramento do atendimento</h3>
          <button
            type="button"
            className={crmButton + ' !text-red-700'}
            disabled={
              !editable ||
              busy ||
              !ready ||
              contact.official_enrollment ||
              contact.stage === 'matriculado'
            }
            title={!ready ? 'Atualização dos motivos pendente no banco' : 'Registrar desistência'}
            onClick={() => {
              setOpen(!open)
              setError('')
            }}
          >
            <UserRoundX size={15} />
            Registrar desistência
          </button>
        </div>
      )}
      {open && (
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          {!loss && (
            <>
              <label className="block space-y-1 text-xs text-slate-600">
                <span>Motivo principal</span>
                <select
                  required
                  aria-label="Motivo principal da desistência"
                  className={crmInput}
                  value={reasonId}
                  disabled={saving}
                  onChange={(e) => setReasonId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {reasons
                    .filter((r) => r.active || r.id === reasonId)
                    .map((r) => (
                      <option key={r.id} value={r.id} disabled={!r.active}>
                        {r.name}
                        {!r.active ? ' · desativado' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-slate-600">
                <span>Origem da informação</span>
                <select
                  required
                  aria-label="Origem do motivo"
                  className={crmInput}
                  value={evidence}
                  disabled={saving}
                  onChange={(e) => setEvidence(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {Object.entries(lossEvidence).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="block space-y-1 text-xs text-slate-600">
            <span>
              {loss
                ? 'Motivo da reabertura'
                : selected?.requires_note
                  ? 'Observação obrigatória'
                  : 'Observação'}
            </span>
            <textarea
              aria-label={loss ? 'Motivo da reabertura' : 'Observação da desistência'}
              className={crmInput}
              rows={3}
              maxLength={2000}
              minLength={loss ? 3 : undefined}
              required={Boolean(loss || selected?.requires_note)}
              value={note}
              disabled={saving}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={crmButton}
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              <X size={15} />
              Cancelar
            </button>
            <button type="submit" className={crmButton} disabled={saving || busy || !editable}>
              {saving ? 'Salvando…' : loss ? 'Confirmar reabertura' : 'Confirmar desistência'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
