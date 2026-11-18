import { useEffect, useId, useState } from 'react'
import { Ban, Check, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react'
import type { CrmContact } from '../../lib/crmKanban'
import {
  documentDuration,
  documentHours,
  documentLocalTime,
  type CrmDocument,
  type CrmDocumentsWorkspace,
} from '../../lib/crmDocuments'
import { cancelCrmDocument, loadCrmDocuments, saveCrmDocument } from '../../lib/crmDocumentsApi'
import { crmButton, crmInput } from './CrmContactForm'

type Mode = 'new' | 'receipt' | 'edit' | 'cancel'
interface Draft {
  mode: Mode
  row: CrmDocument | null
  id: string
  course: string
  description: string
  sent: string
  received: string
  note: string
  receiptNote: string
  reason: string
}
const stamp = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
const dateValue = (local: string, original?: string | null) =>
  original && documentLocalTime(original) === local ? original : new Date(local).toISOString()

export function CrmDocumentsPanel({
  contact,
  editable,
  now,
  onSaved,
}: {
  contact: CrmContact
  editable: boolean
  now: number
  onSaved: (contact: CrmContact) => void
}) {
  const [workspace, setWorkspace] = useState<CrmDocumentsWorkspace | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const coursesId = useId()
  useEffect(() => {
    let live = true
    void loadCrmDocuments(contact.id)
      .then((data) => {
        if (live) {
          setWorkspace(data)
          setError('')
          setLoading(false)
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => {
      live = false
    }
  }, [contact.id, contact.version, refresh])
  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((n) => n + 1), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const begin = (mode: Mode, row: CrmDocument | null = null) => {
    setError('')
    setDraft({
      mode,
      row,
      id: row?.id ?? crypto.randomUUID(),
      course: row?.course ?? contact.current_data.curso ?? '',
      description: row?.description ?? '',
      sent: documentLocalTime(row?.sent_at),
      received: row?.received_at
        ? documentLocalTime(row.received_at)
        : mode === 'receipt'
          ? documentLocalTime()
          : '',
      note: row?.note ?? '',
      receiptNote: row?.receipt_note ?? '',
      reason: '',
    })
  }
  const change = (field: keyof Draft, value: string) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d))
  const pending = workspace?.documents.filter((d) => !d.cancelled_at && !d.received_at).length ?? 0
  const completed = workspace?.documents.filter((d) => !d.cancelled_at && d.received_at).length ?? 0
  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Documentação</h3>
          <p className="mt-1 text-xs text-slate-500">
            Envio ao curso · retorno da análise ao vendedor
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={crmButton + ' !p-2'}
            title="Atualizar documentação"
            aria-label="Atualizar documentação"
            disabled={saving || loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className={crmButton}
            disabled={
              !editable ||
              saving ||
              !workspace ||
              contact.archived ||
              Boolean(contact.loss_data) ||
              contact.intake_visible === false
            }
            onClick={() => begin('new')}
          >
            <Plus size={16} />
            Registrar envio
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-slate-500">Carregando documentação...</p>}
      {workspace && (
        <p className="text-sm text-slate-600">
          {pending} aguardando retorno · {completed} retornos recebidos
        </p>
      )}
      {draft && (
        <form
          className="space-y-3 border-y border-slate-200 py-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            setError('')
            try {
              const result =
                draft.mode === 'cancel' && draft.row
                  ? await cancelCrmDocument(draft.id, draft.row.version, draft.reason)
                  : await saveCrmDocument(
                      contact.id,
                      {
                        id: draft.id,
                        course: draft.course,
                        description: draft.description,
                        sent_at: dateValue(draft.sent, draft.row?.sent_at),
                        received_at: draft.received
                          ? dateValue(draft.received, draft.row?.received_at)
                          : null,
                        note: draft.note,
                        receipt_note: draft.receiptNote,
                      },
                      draft.row?.version ?? null,
                      draft.reason,
                    )
              setDraft(null)
              onSaved(result.contact)
              setRefresh((n) => n + 1)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
            } finally {
              setSaving(false)
            }
          }}
        >
          <h4 className="text-sm font-semibold">
            {
              {
                new: 'Novo envio',
                receipt: 'Recebimento da análise',
                edit: 'Corrigir registro',
                cancel: 'Cancelar envio',
              }[draft.mode]
            }
          </h4>
          <fieldset disabled={saving || !editable} className="space-y-3">
            {['new', 'edit'].includes(draft.mode) ? (
              <>
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Curso responsável pela análise</span>
                  <input
                    className={crmInput}
                    aria-label="Curso responsável pela análise"
                    list={coursesId}
                    required
                    maxLength={200}
                    value={draft.course}
                    onChange={(e) => change('course', e.target.value)}
                  />
                  <datalist id={coursesId}>
                    {workspace?.courses.map((course) => (
                      <option key={course} value={course} />
                    ))}
                  </datalist>
                </label>
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Documentação encaminhada</span>
                  <input
                    className={crmInput}
                    aria-label="Documentação encaminhada"
                    required
                    maxLength={500}
                    value={draft.description}
                    onChange={(e) => change('description', e.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Data e hora do envio</span>
                  <input
                    className={crmInput}
                    aria-label="Data e hora do envio"
                    type="datetime-local"
                    step="1"
                    required
                    value={draft.sent}
                    onChange={(e) => change('sent', e.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Observação do envio · opcional</span>
                  <textarea
                    className={crmInput}
                    aria-label="Observação do envio"
                    maxLength={2000}
                    value={draft.note}
                    onChange={(e) => change('note', e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="break-words text-sm">
                {draft.course} · {draft.description}
              </p>
            )}
            {['receipt', 'edit'].includes(draft.mode) && (
              <>
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Data e hora do retorno da análise</span>
                  <input
                    className={crmInput}
                    aria-label="Data e hora do retorno da análise"
                    type="datetime-local"
                    step="1"
                    required={draft.mode === 'receipt'}
                    value={draft.received}
                    onChange={(e) => change('received', e.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Retorno do curso · opcional</span>
                  <textarea
                    className={crmInput}
                    aria-label="Retorno do curso"
                    maxLength={2000}
                    value={draft.receiptNote}
                    onChange={(e) => change('receiptNote', e.target.value)}
                  />
                </label>
              </>
            )}
            {['edit', 'cancel'].includes(draft.mode) && (
              <label className="block space-y-1 text-xs text-slate-500">
                <span>
                  {draft.mode === 'cancel' ? 'Motivo do cancelamento' : 'Motivo da correção'}
                </span>
                <textarea
                  className={crmInput}
                  aria-label="Motivo da alteração"
                  required
                  maxLength={2000}
                  value={draft.reason}
                  onChange={(e) => change('reason', e.target.value)}
                />
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={crmButton} onClick={() => setDraft(null)}>
                <X size={15} />
                Cancelar edição
              </button>
              <button className={crmButton} type="submit">
                <Save size={15} />
                {saving ? 'Salvando...' : 'Salvar documentação'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="divide-y divide-slate-200">
        {workspace?.documents.map((row) => (
          <article key={row.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="min-w-0 break-words text-sm font-semibold">{row.course}</h4>
              <span
                className={
                  'text-xs ' +
                  (row.cancelled_at
                    ? 'text-slate-500'
                    : row.received_at
                      ? 'text-emerald-700'
                      : 'text-amber-800')
                }
              >
                {row.cancelled_at
                  ? 'Cancelado'
                  : row.received_at
                    ? 'Retorno recebido'
                    : 'Aguardando retorno'}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{row.description}</p>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Envio</dt>
                <dd>{stamp(row.sent_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Retorno da análise</dt>
                <dd>{row.received_at ? stamp(row.received_at) : 'Ainda não recebido'}</dd>
              </div>
            </dl>
            {!row.cancelled_at && (
              <p className="text-sm font-medium">
                {row.received_at ? 'Prazo de retorno' : 'Tempo em aberto'}:{' '}
                {documentDuration(row, now)}
              </p>
            )}
            {row.note && (
              <p className="whitespace-pre-wrap break-words text-xs text-slate-600">
                Envio: {row.note}
              </p>
            )}
            {row.receipt_note && (
              <p className="whitespace-pre-wrap break-words text-xs text-slate-600">
                Análise: {row.receipt_note}
              </p>
            )}
            {row.cancelled_at && (
              <p className="whitespace-pre-wrap break-words text-xs text-slate-500">
                Cancelado em {stamp(row.cancelled_at)}: {row.cancel_reason}
              </p>
            )}
            {editable && !row.cancelled_at && (
              <div className="flex flex-wrap justify-end gap-2">
                {!row.received_at && (
                  <button
                    className={crmButton}
                    disabled={saving}
                    onClick={() => begin('receipt', row)}
                  >
                    <Check size={15} />
                    Registrar recebimento
                  </button>
                )}
                <button
                  className={crmButton + ' !p-2'}
                  disabled={saving}
                  title="Corrigir documentação"
                  aria-label={'Corrigir documentação de ' + row.course}
                  onClick={() => begin('edit', row)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className={crmButton + ' !p-2'}
                  disabled={saving}
                  title="Cancelar envio"
                  aria-label={'Cancelar documentação de ' + row.course}
                  onClick={() => begin('cancel', row)}
                >
                  <Ban size={15} />
                </button>
              </div>
            )}
          </article>
        ))}
        {workspace && !workspace.documents.length && (
          <p className="py-4 text-sm text-slate-500">Nenhum envio registrado nesta ficha.</p>
        )}
      </div>
      {workspace && (
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h3 className="font-semibold">Prazo de retorno por curso</h3>
          <p className="text-xs text-slate-500">
            Histórico acessível ao seu perfil · horas corridas · média e mediana somente dos
            retornos concluídos. Testes e cancelamentos excluídos.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  {['Curso', 'Retornos', 'Média', 'Mediana', 'Abertos', 'Maior espera'].map((h) => (
                    <th key={h} className="px-2 py-3 font-medium text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.stats.map((row) => (
                  <tr key={row.course} className="border-b border-slate-100">
                    <td className="min-w-28 px-2 py-3">{row.course}</td>
                    <td className="px-2 py-3">{row.completed}</td>
                    <td className="whitespace-nowrap px-2 py-3">{documentHours(row.mean_hours)}</td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {documentHours(row.median_hours)}
                    </td>
                    <td className="px-2 py-3">{row.pending}</td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {documentHours(row.oldest_hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!workspace.stats.length && (
            <p className="text-sm text-slate-500">Ainda não há envios válidos para comparação.</p>
          )}
          <p className="text-xs text-slate-500">
            Referência observada, não uma meta de SLA contratada. Consulta:{' '}
            {stamp(workspace.generated_at)}.
          </p>
        </section>
      )}
    </section>
  )
}
