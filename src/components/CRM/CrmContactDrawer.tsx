import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  Check,
  Circle,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import type { Profile } from '../../lib/types'
import {
  canEditCrm,
  crmPersona,
  crmSourceLabel,
  crmStageLabel,
  crmStages,
  crmWhatsapp,
  formatCrmPhone,
  isCrmManager,
  type CrmActivity,
  type CrmContact,
  type CrmDetail,
  type CrmMember,
  type CrmLossReason,
  type CrmPersonaRows,
} from '../../lib/crmKanban'
import { crmRpc, loadCrmDetail, loadCrmPersona } from '../../lib/crmKanbanApi'
import { CrmContactForm, crmButton, crmInput } from './CrmContactForm'
import { todayInBrazil } from '../../lib/historyDateScope'
import { activityDirections, crmAcademicProgress } from '../../lib/crmWorkflow'
import { CrmFollowupPanel } from './CrmFollowupPanel'
import { CrmLossPanel } from './CrmLossPanel'
import { lossEvidence } from '../../lib/crmLoss'
import { CrmDocumentsPanel } from './CrmDocumentsPanel'
import type { CrmDocument } from '../../lib/crmDocuments'

const stamp = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
const localNow = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const localValue = (value: string) => {
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const labels: Record<string, string> = {
  nome: 'Nome',
  telefone: 'Telefone',
  curso: 'Curso',
  campus: 'Campus',
  turno: 'Turno',
  forma_ingresso: 'Forma de ingresso',
  email: 'E-mail',
  data_de_nascimento: 'Nascimento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  estado: 'Estado',
  observacao: 'Observação',
  ingressante_outra_ies: 'Ingressante de outra IES',
  ies_origem: 'IES de origem',
  data_inscricao: 'Data da inscrição',
  etapa_atual: 'Etapa acadêmica',
  data_matricula: 'Data da matrícula',
}
const tabs = ['Dados', 'Atendimentos', 'Documentação', 'Histórico', 'Persona', 'Origens'] as const

function EventContent({
  event,
  members,
}: {
  event: CrmDetail['events'][number]
  members: CrmMember[]
}) {
  const p = event.payload
  if (['document_saved', 'document_cancelled'].includes(event.event_type)) {
    const before = p.before as CrmDocument | null
    const after = p.after as CrmDocument
    return (
      <div>
        <strong>
          {event.event_type === 'document_cancelled'
            ? 'Envio cancelado'
            : !before
              ? 'Documentação enviada'
              : !before.received_at && after.received_at
                ? 'Retorno da análise recebido'
                : 'Documentação corrigida'}
        </strong>
        <p className="mt-1 text-xs">
          {after.course} · {after.description}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Envio: {stamp(after.sent_at)} · Retorno:{' '}
          {after.received_at ? stamp(after.received_at) : 'Pendente'}
        </p>
        {p.reason ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-xs">Motivo: {String(p.reason)}</p>
        ) : null}
        {before && (
          <details className="mt-1 text-xs text-slate-500">
            <summary>Registro anterior</summary>
            <p>
              {before.course} · {before.description}
            </p>
            <p>
              Envio: {stamp(before.sent_at)} · Retorno:{' '}
              {before.received_at ? stamp(before.received_at) : 'Pendente'}
            </p>
            <p className="whitespace-pre-wrap break-words">
              {before.note} {before.receipt_note}
            </p>
          </details>
        )}
      </div>
    )
  }
  if (event.event_type === 'stage')
    return (
      <span>
        {crmStageLabel(String(p.from))} → <strong>{crmStageLabel(String(p.to))}</strong>
        {p.reason ? <span className="block text-xs text-slate-500">{String(p.reason)}</span> : null}
      </span>
    )
  if (event.event_type === 'assignment')
    return (
      <span>
        Responsável:{' '}
        <strong>{members.find((member) => member.id === p.to)?.nome ?? 'Sem responsável'}</strong>
        <span className="block text-xs text-slate-500">
          Anterior: {members.find((member) => member.id === p.from)?.nome ?? 'Sem responsável'}
        </span>
      </span>
    )
  if (event.event_type === 'edited') {
    const before = (p.before ?? {}) as Record<string, unknown>,
      after = (p.after ?? {}) as Record<string, unknown>
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (key) => before[key] !== after[key],
    )
    return (
      <div>
        Informações atualizadas
        {keys.length > 0 && (
          <dl className="mt-2 space-y-2 text-xs">
            {keys.map((key) => (
              <div key={key}>
                <dt className="font-semibold text-slate-600">{labels[key] ?? key}</dt>
                <dd className="whitespace-pre-wrap break-words text-slate-500">
                  {String(before[key] || 'Não informado')} →{' '}
                  <span className="text-slate-800">{String(after[key] || 'Não informado')}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    )
  }
  if (event.event_type === 'source_update')
    return (
      <div>
        <strong>{crmSourceLabel(String(p.source))}</strong>
        <details className="mt-1 text-xs text-slate-500">
          <summary className="cursor-pointer">Dados anteriores e recebidos</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(['before', 'after'] as const).map((key) => (
              <section key={key}>
                <h4 className="mb-1 font-semibold">{key === 'before' ? 'Anterior' : 'Recebido'}</h4>
                <dl className="space-y-1">
                  {p[key] && typeof p[key] === 'object' ? (
                    Object.entries(p[key] as Record<string, unknown>).map(([field, value]) => (
                      <div key={field} className="break-words">
                        <dt className="font-medium">{field.replaceAll('_', ' ')}</dt>
                        <dd>{String(value ?? '—')}</dd>
                      </div>
                    ))
                  ) : (
                    <p>Primeiro registro</p>
                  )}
                </dl>
              </section>
            ))}
          </div>
        </details>
      </div>
    )
  if (event.event_type === 'activity')
    return (
      <span>
        {p.before ? 'Atendimento editado' : 'Atendimento registrado'}
        {p.direction ? (
          <span className="block text-xs text-slate-500">
            {activityDirections[p.direction as keyof typeof activityDirections]}
          </span>
        ) : null}
        <span className="mt-1 block whitespace-pre-wrap text-slate-600">
          {String(p.note ?? '')}
        </span>
        {Boolean(p.before) && (
          <details className="mt-1 text-xs text-slate-500">
            <summary>Versão anterior</summary>
            <p className="whitespace-pre-wrap">{String((p.before as CrmActivity).note)}</p>
          </details>
        )}
      </span>
    )
  if (event.event_type === 'cadence_completed')
    return <span>Cadência {String(p.code)} · contato registrado</span>
  if (event.event_type === 'cadence_paused')
    return <span>Cadência pausada após resposta do candidato</span>
  if (event.event_type === 'cadence_resumed') return <span>Cadência retomada pelo atendente</span>
  if (event.event_type === 'callback_completed') return <span>Retorno agendado realizado</span>
  if (event.event_type === 'loss_closed')
    return (
      <div>
        <strong>Desistência · {String(p.reason_label)}</strong>
        <p className="mt-1 text-xs text-slate-500">
          {lossEvidence[p.evidence as keyof typeof lossEvidence]} · {crmStageLabel(String(p.stage))}
        </p>
        {p.note ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{String(p.note)}</p>
        ) : null}
      </div>
    )
  if (event.event_type === 'loss_reopened') {
    const previous = p.previous as Record<string, unknown> | undefined
    return (
      <div>
        <strong>Atendimento reaberto</strong>
        <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">
          {String(p.note || '')}
        </p>
        {previous && (
          <p className="mt-1 text-xs text-slate-500">
            Encerramento anterior: {String(previous.reason_label)} ·{' '}
            {lossEvidence[previous.evidence as keyof typeof lossEvidence]}
          </p>
        )}
      </div>
    )
  }
  return (
    <span>
      {event.event_type === 'created'
        ? 'Cadastro criado · ' + crmSourceLabel(String(p.source))
        : 'Informações atualizadas'}
    </span>
  )
}

export function CrmContactDrawer({
  contact,
  now,
  profile,
  members,
  lossReasons,
  lossReady,
  onContactUpdated,
  busy,
  onClose,
  onPatch,
  notify,
}: {
  contact: CrmContact
  now: number
  profile: Profile
  members: CrmMember[]
  lossReasons: CrmLossReason[]
  lossReady: boolean
  onContactUpdated: (contact: CrmContact) => void
  busy: boolean
  onClose: () => void
  onPatch: (contact: CrmContact, patch: Record<string, unknown>) => Promise<CrmContact>
  notify: (text: string, error?: boolean) => void
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Dados')
  const [detail, setDetail] = useState<CrmDetail | null>(null)
  const [historyMore, setHistoryMore] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<CrmContact | null>(null)
  const [personaBase, setPersonaBase] = useState<{
    course: string
    data?: CrmPersonaRows
    error?: string
  } | null>(null)
  const [personaAttempt, setPersonaAttempt] = useState(0)
  const personaCourse = contact.current_data.curso?.trim() ?? ''
  const baseline = personaBase?.course === personaCourse ? (personaBase.data ?? null) : null
  const personaError = personaBase?.course === personaCourse ? (personaBase.error ?? '') : ''
  const [note, setNote] = useState(''),
    [channel, setChannel] = useState('whatsapp'),
    [occurred, setOccurred] = useState(localNow)
  const [activity, setActivity] = useState<CrmActivity | null>(null),
    [activityBusy, setActivityBusy] = useState(false)
  const [direction, setDirection] = useState<NonNullable<CrmActivity['direction']>>('outbound')
  const [cadence, setCadence] = useState<{ code: string; anchor: string } | null>(null)
  const [nextAction, setNextAction] = useState(
    contact.next_action_at ? localValue(contact.next_action_at) : '',
  )
  const [nextActionBase, setNextActionBase] = useState(contact)
  const closeRef = useRef<HTMLButtonElement>(null)
  const manager = isCrmManager(profile),
    editable = canEditCrm(contact, profile)
  const operationalEditable = editable && !contact.loss_data
  const owner = members.find((member) => member.id === contact.owner_id)
  const stage = crmStages.find((item) => item.id === contact.stage)!
  const retroactiveCadence = cadence && Date.parse(occurred) < Date.parse(cadence.anchor)
  useEffect(() => {
    // A post-write detail response already contains the new contact version.
    if (detail?.contact.id === contact.id && detail.contact.version >= contact.version) return
    let live = true
    void loadCrmDetail(contact.id)
      .then((data) => {
        if (live) {
          setDetail(data)
          setHistoryMore(data.events.length === 50)
          setError('')
        }
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [contact.id, contact.version, detail?.contact.id, detail?.contact.version])
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null,
      old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const list = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-crm-drawer] button:not(:disabled),[data-crm-drawer] input:not(:disabled),[data-crm-drawer] select:not(:disabled),[data-crm-drawer] textarea:not(:disabled),[data-crm-drawer] a[href]',
          ),
        ).filter((item) => item.offsetParent !== null)
        if (event.shiftKey && document.activeElement === list[0]) {
          event.preventDefault()
          list.at(-1)?.focus()
        }
        if (!event.shiftKey && document.activeElement === list.at(-1)) {
          event.preventDefault()
          list[0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = old
      window.removeEventListener('keydown', key)
      active?.focus()
    }
  }, [onClose])
  useEffect(() => {
    if (tab !== 'Persona' || !personaCourse) return
    let live = true
    void loadCrmPersona(personaCourse)
      .then((data) => {
        if (live) setPersonaBase({ course: personaCourse, data })
      })
      .catch((e) => {
        if (live) setPersonaBase({ course: personaCourse, error: e.message })
      })
    return () => {
      live = false
    }
  }, [tab, personaCourse, personaAttempt])
  const persona = useMemo(
    () => (baseline ? crmPersona(contact, baseline, todayInBrazil()) : null),
    [contact, baseline],
  )
  const patch = async (changes: Record<string, unknown>) => {
    try {
      await onPatch(contact, changes)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Falha ao salvar.', true)
    }
  }
  const whatsapp = crmWhatsapp(contact.current_data.telefone)
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <aside
        data-crm-drawer
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-contact-title"
        className="flex h-[100dvh] w-full max-w-[720px] flex-col bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
              <span>{contact.has_inscription ? 'Inscrito' : 'Lead'}</span>
              {contact.loss_data && <span className="text-red-700">Desistência registrada</span>}
              {contact.test_only && <span className="text-amber-700">Teste</span>}
              {contact.official_enrollment && (
                <span className="text-emerald-700">Matrícula confirmada na base</span>
              )}
            </div>
            <h2 id="crm-contact-title" className="break-words text-xl font-semibold text-slate-950">
              {contact.current_data.nome || 'Nome não informado'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">CPF {contact.cpf}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={crmButton + ' !p-2'}
            title="Fechar ficha"
            aria-label="Fechar ficha"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="shrink-0 space-y-3 border-b border-slate-200 px-5 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-500">
              <span>Fase</span>
              <select
                className={crmInput}
                aria-label="Fase do contato"
                value={contact.stage}
                disabled={!operationalEditable || busy}
                onChange={(event) => void patch({ stage: event.target.value })}
              >
                {crmStages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-xs text-slate-500">
              <span>Responsável</span>
              {manager ? (
                <select
                  className={crmInput}
                  aria-label="Responsável do contato"
                  disabled={busy}
                  value={contact.owner_id ?? ''}
                  onChange={(event) => void patch({ owner_id: event.target.value || null })}
                >
                  <option value="">Sem responsável</option>
                  {members
                    .filter((member) =>
                      ['captacao', 'funcionario', 'captacao_gerente'].includes(member.role),
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.nome}
                      </option>
                    ))}
                </select>
              ) : (
                <div className="flex min-h-10 items-center justify-between gap-2 text-sm font-medium text-slate-800">
                  {owner?.nome || 'Sem responsável'}
                  {!contact.owner_id && (
                    <button
                      type="button"
                      className={crmButton}
                      disabled={busy}
                      onClick={() => void patch({ owner_id: profile.id })}
                    >
                      Assumir
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <nav
          aria-label="Abas da ficha"
          className="flex shrink-0 gap-4 overflow-x-auto border-b border-slate-200 px-5"
        >
          {tabs.map((item) => (
            <button
              type="button"
              key={item}
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => setTab(item)}
              className={
                'shrink-0 border-b-2 py-3 text-sm font-medium ' +
                (tab === item ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500')
              }
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {error}
            </p>
          )}
          {tab === 'Dados' &&
            (editing ? (
              <CrmContactForm
                initial={editing.current_data}
                cpf={editing.cpf}
                members={members}
                manager={manager}
                owner={editing.owner_id}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={async (data, _cpf, ownerId) => {
                  await onPatch(editing, {
                    manual_data: data,
                    ...(manager ? { owner_id: ownerId } : {}),
                  })
                  setEditing(null)
                }}
              />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap justify-between gap-2">
                  <a
                    className={
                      crmButton +
                      (!whatsapp || !operationalEditable ? ' pointer-events-none opacity-50' : '')
                    }
                    aria-disabled={!whatsapp || !operationalEditable}
                    href={operationalEditable ? (whatsapp ?? undefined) : undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} />
                    WhatsApp
                  </a>
                  <div className="flex gap-2">
                    <button
                      className={crmButton}
                      type="button"
                      disabled={!editable || busy}
                      onClick={() => setEditing(contact)}
                    >
                      <Pencil size={15} />
                      Editar dados
                    </button>
                    {!contact.loss_data && (
                      <button
                        className={crmButton + ' !p-2'}
                        type="button"
                        title={
                          contact.archived
                            ? 'Reabrir contato'
                            : 'Arquivar sem registrar desistência'
                        }
                        aria-label={contact.archived ? 'Reabrir contato' : 'Arquivar contato'}
                        disabled={!editable || busy}
                        onClick={() => void patch({ archived: !contact.archived })}
                      >
                        {contact.archived ? <ArrowLeft size={16} /> : <Archive size={16} />}
                      </button>
                    )}
                  </div>
                </div>
                <CrmLossPanel
                  contact={contact}
                  reasons={lossReasons}
                  ready={lossReady}
                  editable={editable}
                  busy={busy}
                  onSaved={(updated) => {
                    setActivity(null)
                    setCadence(null)
                    onContactUpdated(updated)
                  }}
                  notify={notify}
                />
                <p className="border-l-2 border-sky-500 pl-3 text-sm text-slate-700">
                  {crmAcademicProgress(contact, now).label}
                </p>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {Object.entries(labels).map(([key, label]) => (
                    <div key={key} className={key === 'observacao' ? 'sm:col-span-2' : ''}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="mt-1 break-words whitespace-pre-wrap text-sm text-slate-900">
                        {key === 'telefone'
                          ? formatCrmPhone(contact.current_data[key])
                          : contact.current_data[key] || 'Não informado'}
                      </dd>
                    </div>
                  ))}
                </dl>
                <section className="border-t border-slate-200 pt-4">
                  <h3 className="mb-3 text-sm font-semibold">Próxima ação</h3>
                  <dl className="mb-4 grid gap-3 text-xs sm:grid-cols-3">
                    {(
                      [
                        ['Último contato da equipe', contact.last_outreach_at],
                        ['Última resposta do candidato', contact.last_response_at],
                        ['Última interação', contact.last_interaction_at],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="mt-1 text-slate-800">
                          {value ? stamp(value) : 'Não registrado'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void onPatch(nextActionBase, {
                        next_action_at: nextAction ? new Date(nextAction).toISOString() : null,
                      })
                        .then(setNextActionBase)
                        .catch((e) => notify(e.message, true))
                    }}
                  >
                    <input
                      type="datetime-local"
                      aria-label="Data da próxima ação"
                      className={crmInput + ' sm:!w-auto'}
                      value={nextAction}
                      onChange={(event) => {
                        setNextAction(event.target.value)
                        setNextActionBase(contact)
                      }}
                      disabled={!operationalEditable || busy}
                    />
                    <button
                      type="submit"
                      className={crmButton}
                      disabled={!operationalEditable || busy}
                    >
                      <Save size={15} />
                      Salvar
                    </button>
                  </form>
                </section>
                <section className="border-t border-slate-200 pt-4">
                  <h3 className="mb-3 text-sm font-semibold">{stage.label}</h3>
                  <div className="space-y-3">
                    {stage.tasks.map((task, index) => {
                      const key = `${stage.id}:${index}`
                      return (
                        <label key={key} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-sky-600"
                            checked={Boolean(contact.checklist[key])}
                            disabled={!operationalEditable || busy}
                            onChange={(event) =>
                              void patch({
                                checklist: { ...contact.checklist, [key]: event.target.checked },
                              })
                            }
                          />
                          {task}
                        </label>
                      )
                    })}
                  </div>
                </section>
                <CrmFollowupPanel
                  contact={contact}
                  now={now}
                  editable={operationalEditable}
                  busy={busy}
                  onPatch={patch}
                  notify={notify}
                  onResume={() => {
                    void crmRpc<CrmContact>('crm_kanban_resume_cadence', {
                      p_id: contact.id,
                      p_version: contact.version,
                    })
                      .then((updated) => {
                        onContactUpdated(updated)
                        notify('Cadência retomada.')
                      })
                      .catch((e) => notify(e.message, true))
                  }}
                  onRecord={(code, text) => {
                    setCadence({ code, anchor: contact.stage_entered_at })
                    setActivity(null)
                    setDirection('outbound')
                    setOccurred(localNow())
                    setNote(text)
                    setTab('Atendimentos')
                  }}
                />
              </div>
            ))}
          {tab === 'Atendimentos' && (
            <div className="space-y-5">
              <form
                className="space-y-3 border-b border-slate-200 pb-5"
                onSubmit={async (event) => {
                  event.preventDefault()
                  setActivityBusy(true)
                  try {
                    await crmRpc('crm_kanban_activity_v2', {
                      p_contact: contact.id,
                      p_note: note,
                      p_channel: channel,
                      p_occurred: new Date(occurred).toISOString(),
                      p_activity: activity?.id ?? null,
                      p_direction: contact.loss_data ? 'note' : direction,
                      p_code: contact.loss_data ? null : (cadence?.code ?? null),
                      p_anchor: contact.loss_data ? null : (cadence?.anchor ?? null),
                    })
                    setNote('')
                    setActivity(null)
                    setCadence(null)
                    const updated = await loadCrmDetail(contact.id)
                    setDetail((current) =>
                      current && current.contact.version > updated.contact.version ? current : updated,
                    )
                    setHistoryMore(updated.events.length === 50)
                    setError('')
                    onContactUpdated(updated.contact)
                    notify('Atendimento salvo.')
                  } catch (e) {
                    notify(e instanceof Error ? e.message : 'Erro ao salvar.', true)
                  } finally {
                    setActivityBusy(false)
                  }
                }}
              >
                <h3 className="font-semibold">
                  {activity ? 'Editar atendimento' : 'Novo atendimento'}
                </h3>
                {cadence && !contact.loss_data && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-sky-800">
                    <span>Registrar contato da cadência {cadence.code}</span>
                    <button type="button" onClick={() => setCadence(null)}>
                      Desvincular cadência
                    </button>
                  </div>
                )}
                {retroactiveCadence && !contact.loss_data && (
                  <p role="status" className="text-xs text-amber-800">
                    Data anterior à entrada nesta fase. O atendimento será registrado no histórico,
                    sem concluir a cadência atual.
                  </p>
                )}
                <label className="block space-y-1 text-xs text-slate-500">
                  <span>Tipo de registro</span>
                  <select
                    aria-label="Tipo de interação"
                    className={crmInput}
                    disabled={
                      !editable || activityBusy || Boolean(cadence) || Boolean(contact.loss_data)
                    }
                    value={contact.loss_data ? 'note' : direction}
                    onChange={(e) =>
                      setDirection(e.target.value as NonNullable<CrmActivity['direction']>)
                    }
                  >
                    {Object.entries(activityDirections)
                      .filter(([value]) => value !== 'unknown' || activity?.direction === 'unknown')
                      .map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>Data e hora</span>
                    <input
                      className={crmInput}
                      aria-label="Data do atendimento"
                      type="datetime-local"
                      required
                      value={occurred}
                      onChange={(event) => setOccurred(event.target.value)}
                      disabled={!editable || activityBusy}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>Canal</span>
                    <select
                      className={crmInput}
                      value={channel}
                      onChange={(event) => setChannel(event.target.value)}
                      disabled={!editable || activityBusy}
                    >
                      {['whatsapp', 'telefone', 'email', 'presencial', 'outro'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <textarea
                  className={crmInput}
                  aria-label="Observação do atendimento"
                  rows={3}
                  maxLength={10000}
                  required
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={!editable || activityBusy}
                />
                <div className="flex justify-end gap-2">
                  {activity && (
                    <button
                      className={crmButton}
                      type="button"
                      onClick={() => {
                        setActivity(null)
                        setCadence(null)
                        setNote('')
                      }}
                    >
                      Cancelar edição
                    </button>
                  )}
                  <button className={crmButton} type="submit" disabled={!editable || activityBusy}>
                    <Plus size={15} />
                    {activityBusy ? 'Salvando…' : 'Salvar atendimento'}
                  </button>
                </div>
              </form>
              <div className="divide-y divide-slate-100">
                {detail?.activities.map((item) => (
                  <article key={item.id} className="py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {stamp(item.occurred_at)} · {item.channel} ·{' '}
                        {members.find((member) => member.id === item.author_id)?.nome ??
                          'Atendente'}
                      </p>
                      {editable &&
                        (!contact.loss_data || item.direction === 'note') &&
                        (manager || item.author_id === profile.id) && (
                          <button
                            type="button"
                            className={crmButton + ' !p-1.5'}
                            title="Editar atendimento"
                            aria-label="Editar atendimento"
                            onClick={() => {
                              setActivity(item)
                              setCadence(null)
                              setDirection(item.direction || 'unknown')
                              setNote(item.note)
                              setChannel(item.channel)
                              setOccurred(localValue(item.occurred_at))
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {activityDirections[item.direction || 'unknown']}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                      {item.note}
                    </p>
                  </article>
                ))}
                {detail && !detail.activities.length && (
                  <p className="py-5 text-sm text-slate-500">Nenhum atendimento registrado.</p>
                )}
              </div>
            </div>
          )}
          {tab === 'Documentação' && (
            <CrmDocumentsPanel
              key={contact.id}
              contact={contact}
              editable={editable}
              now={now}
              onSaved={onContactUpdated}
            />
          )}
          {tab === 'Histórico' && (
            <div className="space-y-4">
              <ol
                aria-label="Fases percorridas"
                className="grid gap-2 border-b border-slate-200 pb-4 sm:grid-cols-2"
              >
                {crmStages.map((item) => (
                  <li
                    key={item.id}
                    className={
                      'flex items-center gap-2 text-xs ' +
                      ((detail?.visited_stages ?? [contact.stage]).includes(item.id)
                        ? 'font-medium text-slate-800'
                        : 'text-slate-400')
                    }
                  >
                    {(detail?.visited_stages ?? [contact.stage]).includes(item.id) ? (
                      <Check size={13} style={{ color: item.color }} />
                    ) : (
                      <Circle size={13} className="text-slate-300" />
                    )}
                    {item.label}
                    {contact.stage === item.id && <span className="text-sky-700">· atual</span>}
                  </li>
                ))}
              </ol>
              {detail?.events.map((event) => (
                <article key={event.id} className="border-l-2 border-slate-200 pl-4">
                  <p className="mb-1 text-xs text-slate-500">
                    {stamp(event.created_at)} ·{' '}
                    {members.find((member) => member.id === event.actor_id)?.nome ??
                      'Sincronização'}
                  </p>
                  <div className="break-words text-sm text-slate-800">
                    <EventContent event={event} members={members} />
                  </div>
                </article>
              ))}
              {detail && historyMore && (
                <button
                  className={crmButton}
                  type="button"
                  onClick={async () => {
                    try {
                      const more = await loadCrmDetail(contact.id, detail.events.at(-1)?.id)
                      setDetail({ ...detail, events: [...detail.events, ...more.events] })
                      setHistoryMore(more.events.length === 50)
                    } catch (e) {
                      notify(e instanceof Error ? e.message : 'Falha ao carregar.', true)
                    }
                  }}
                >
                  Carregar anteriores
                </button>
              )}
            </div>
          )}
          {tab === 'Persona' && (
            <section className="space-y-4">
              <h3 className="font-semibold">Compatibilidade com a persona do curso</h3>
              {!personaCourse ? (
                <p className="text-sm text-amber-800">Curso não informado.</p>
              ) : personaError ? (
                <div className="space-y-3">
                  <p role="alert" className="text-sm text-amber-800">
                    {personaError}
                  </p>
                  <button
                    type="button"
                    className={crmButton}
                    onClick={() => {
                      setPersonaBase(null)
                      setPersonaAttempt((value) => value + 1)
                    }}
                  >
                    <RefreshCw size={15} />
                    Tentar novamente
                  </button>
                </div>
              ) : !persona ? (
                <p className="text-sm text-slate-500">Consultando base histórica…</p>
              ) : persona.incomplete ? (
                <p className="text-sm text-amber-800">
                  Base histórica incompleta. A compatibilidade está pendente.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-700">
                    {persona.record?.label ?? 'Dados insuficientes'}
                  </p>
                  <p className="text-3xl font-semibold text-slate-950">
                    {persona.record?.score === null || persona.record?.score === undefined
                      ? '—'
                      : persona.record.score + '/100'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {persona.record?.sample ?? 0} CPFs históricos no curso · {persona.basis}
                  </p>
                  {persona.record?.reason && (
                    <p className="text-sm text-amber-800">{persona.record.reason}</p>
                  )}
                  <dl className="divide-y divide-slate-100">
                    {persona.record?.evidence.map((evidence) => (
                      <div
                        key={evidence.dimension}
                        className="flex justify-between gap-3 py-3 text-sm"
                      >
                        <dt className="text-slate-500">
                          {
                            {
                              idade: 'Idade',
                              campus: 'Campus',
                              turno: 'Turno',
                              ingresso: 'Ingresso',
                            }[evidence.dimension]
                          }
                        </dt>
                        <dd className="text-right">
                          {evidence.value || 'Não informado'}
                          <span className="block text-xs text-slate-500">
                            {evidence.total
                              ? `${evidence.count} de ${evidence.total} na referência`
                              : 'Sem referência'}
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="border-l-2 border-sky-500 pl-3 text-xs leading-5 text-slate-500">
                    Índice descritivo, não probabilidade de matrícula nem critério de elegibilidade.
                    Não restringe atendimento ou oportunidades.
                  </p>
                </>
              )}
            </section>
          )}
          {tab === 'Origens' && (
            <div className="space-y-5">
              {detail?.sources.map((source) => (
                <section
                  key={source.source + source.source_key}
                  className="border-b border-slate-200 pb-5"
                >
                  <h3 className="text-sm font-semibold">
                    {crmSourceLabel(source.source)}{' '}
                    {source.is_test && <span className="ml-1 text-xs text-amber-700">Teste</span>}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Referência:{' '}
                    {source.source_date_inferred
                      ? 'data de inscrição ausente ou inválida'
                      : source.source_date}{' '}
                    · consultado em {stamp(source.observed_at)}
                  </p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {Object.entries(source.payload).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <dt className="break-words text-xs text-slate-500">
                          {key.replaceAll('_', ' ')}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-800">
                          {value === null || value === ''
                            ? '—'
                            : typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {detail && !detail.sources.length && (
                <p className="text-sm text-slate-500">
                  Cadastro manual, sem registros externos vinculados.
                </p>
              )}
            </div>
          )}
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          <Check size={14} />
          Atualizado em {stamp(contact.updated_at)}
        </footer>
      </aside>
    </div>
  )
}
