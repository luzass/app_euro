import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarClock,
  Check,
  GripVertical,
  LoaderCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import type { Profile } from '../lib/types'
import {
  canEditCrm,
  crmMovePreview,
  crmSearchKey,
  crmStageLabel,
  crmStages,
  crmWhatsapp,
  formatCrmPhone,
  isCrmManager,
  type CrmContact,
  type CrmWorkspace,
} from '../lib/crmKanban'
import {
  crmRpc,
  loadCrmContacts,
  loadCrmWorkspace,
  saveCrmContact,
  syncCrmSources,
} from '../lib/crmKanbanApi'
import { CrmContactForm, crmButton, crmInput } from '../components/CRM/CrmContactForm'
import { CrmContactDrawer } from '../components/CRM/CrmContactDrawer'
import { Loading } from '../components/UI/Loading'
import { EmptyState } from '../components/UI/EmptyState'

type Scope = 'mine' | 'unassigned' | 'all'
const shortDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
const countLabel = (number: number) => new Intl.NumberFormat('pt-BR').format(number)

function CardContent({
  contact,
  owner,
  now,
}: {
  contact: CrmContact
  owner?: string
  now: number
}) {
  const overdue = contact.next_action_at && new Date(contact.next_action_at).getTime() < now
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 pr-6 text-[10px] font-semibold uppercase tracking-normal">
        <span
          className={
            'rounded px-1.5 py-0.5 ' +
            (contact.has_inscription ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700')
          }
        >
          {contact.has_inscription ? 'Inscrito' : 'Lead'}
        </span>
        {contact.test_only && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Teste</span>
        )}
        {contact.official_enrollment && (
          <span title="Matrícula confirmada na base" className="text-emerald-600">
            <Check size={13} />
          </span>
        )}
      </div>
      <h3 className="break-words text-sm font-semibold leading-5 text-slate-950">
        {contact.current_data.nome || 'Nome não informado'}
      </h3>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
        <Phone size={12} className="mt-0.5 shrink-0" />
        {formatCrmPhone(contact.current_data.telefone)}
      </p>
      <p className="mt-2 break-words text-xs font-medium leading-5 text-slate-700">
        {contact.current_data.curso || 'Curso não informado'}
      </p>
      <p className="break-words text-xs leading-5 text-slate-500">
        {contact.current_data.campus || 'Campus não informado'} ·{' '}
        {contact.current_data.turno || 'Turno não informado'}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 text-[11px]">
        <span className="truncate text-slate-500">{owner || 'Sem responsável'}</span>
        {contact.next_action_at && (
          <span
            className={
              'inline-flex items-center gap-1 ' +
              (overdue ? 'font-semibold text-red-700' : 'text-slate-500')
            }
          >
            <CalendarClock size={12} />
            {shortDate(contact.next_action_at)}
          </span>
        )}
      </div>
    </>
  )
}

function SortableCard({
  contact,
  owner,
  profile,
  busy,
  onOpen,
  onClaim,
  now,
}: {
  contact: CrmContact
  owner?: string
  profile: Profile
  busy: boolean
  onOpen: () => void
  onClaim: () => void
  now: number
}) {
  const editable = canEditCrm(contact, profile) && !busy
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: contact.id,
    disabled: !editable,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
  }
  const whatsapp = crmWhatsapp(contact.current_data.telefone)
  return (
    <article
      ref={setNodeRef}
      style={style}
      data-contact-id={contact.id}
      className="relative rounded-lg border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-sky-200"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        disabled={!editable}
        title={editable ? 'Mover cartão' : 'Assuma o contato para movimentar'}
        aria-label={'Mover ' + (contact.current_data.nome || 'contato')}
        className="absolute right-1.5 top-2 z-10 rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-25"
        style={{ touchAction: 'none' }}
      >
        <GripVertical size={16} />
      </button>
      <button
        type="button"
        aria-label={'Abrir ficha de ' + (contact.current_data.nome || 'contato')}
        className="block w-full rounded-lg p-3 text-left hover:bg-slate-50/60"
        onClick={onOpen}
      >
        <CardContent contact={contact} owner={owner} now={now} />
      </button>
      {(!contact.owner_id || whatsapp) && (
        <div className="flex items-center justify-end gap-2 px-3 pb-2">
          {!contact.owner_id && !isCrmManager(profile) && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-40"
              disabled={busy}
              onClick={onClaim}
            >
              <UserRoundCheck size={13} />
              Assumir
            </button>
          )}
          {whatsapp && canEditCrm(contact, profile) && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            >
              WhatsApp
            </a>
          )}
        </div>
      )}
    </article>
  )
}

function Column({
  stage,
  contacts,
  children,
}: {
  stage: (typeof crmStages)[number]
  contacts: CrmContact[]
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'stage:' + stage.id })
  return (
    <section
      ref={setNodeRef}
      id={'crm-stage-' + stage.id}
      data-stage={stage.id}
      className={
        'flex h-full w-[288px] shrink-0 flex-col rounded-lg border bg-slate-100/70 transition-colors ' +
        (isOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200')
      }
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color }} />
          {stage.label}
        </h2>
        <span className="text-xs font-semibold tabular-nums text-slate-500">{contacts.length}</span>
      </header>
      <div
        className="crm-column-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-y-contain p-2.5"
        tabIndex={0}
        aria-label={'Contatos em ' + stage.label}
      >
        <SortableContext
          items={contacts.map((contact) => contact.id)}
          strategy={verticalListSortingStrategy}
        >
          {children}
        </SortableContext>
        {!contacts.length && (
          <p className="py-10 text-center text-xs text-slate-400">Nenhum contato</p>
        )}
      </div>
    </section>
  )
}

export function CrmKanbanView({ profile }: { profile: Profile }) {
  const manager = isCrmManager(profile)
  const [contacts, setContacts] = useState<CrmContact[]>([]),
    [workspace, setWorkspace] = useState<CrmWorkspace | null>(null)
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [busy, setBusy] = useState(false)
  const [scope, setScope] = useState<Scope>(manager ? 'all' : 'mine'),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState(''),
    [course, setCourse] = useState(''),
    [campus, setCampus] = useState(''),
    [shift, setShift] = useState('')
  const [showFilters, setShowFilters] = useState(false),
    [archived, setArchived] = useState(false)
  const [selectedId, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const dragging = useRef(false),
    pending = useRef(false),
    snapshot = useRef<CrmContact[]>([]),
    contactsRef = useRef(contacts)
  const board = useRef<HTMLDivElement>(null),
    createClose = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    contactsRef.current = contacts
  }, [contacts])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  useLayoutEffect(() => {
    const resize = () => {
      if (board.current)
        board.current.style.setProperty(
          '--crm-board-height',
          Math.min(
            820,
            Math.max(360, window.innerHeight - board.current.getBoundingClientRect().top - 18),
          ) + 'px',
        )
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [loading, showFilters, feedback, workspace, loadError])
  const notify = useCallback((text: string, error = false) => setFeedback({ text, error }), [])
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 7000)
    return () => clearTimeout(timer)
  }, [feedback])
  const load = useCallback(async () => {
    if (pending.current || dragging.current) return
    pending.current = true
    try {
      const [rows, ws] = await Promise.all([loadCrmContacts(), loadCrmWorkspace()])
      if (!dragging.current) {
        setContacts((current) =>
          rows.map((row) => {
            const latest = current.find((item) => item.id === row.id)
            return latest && latest.version > row.version ? latest : row
          }),
        )
        setSelected((current) =>
          current && !rows.some((row) => row.id === current) ? null : current,
        )
        setWorkspace(ws)
        setLoadError('')
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar o CRM.')
    } finally {
      setLoading(false)
      pending.current = false
    }
  }, [])
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    const focus = () => void load()
    window.addEventListener('focus', focus)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
      window.removeEventListener('focus', focus)
    }
  }, [load])
  const closeDrawer = useCallback(() => setSelected(null), [])
  useEffect(() => {
    if (!creating) return
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    createClose.current?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCreating(false)
      if (event.key === 'Tab') {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-crm-create] button:not(:disabled),[data-crm-create] input:not(:disabled),[data-crm-create] select:not(:disabled),[data-crm-create] textarea:not(:disabled)',
          ),
        ).filter((item) => item.offsetParent !== null)
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault()
          items.at(-1)?.focus()
        }
        if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault()
          items[0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = oldOverflow
      previous?.focus()
    }
  }, [creating])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const collision: CollisionDetection = useCallback((args) => {
    const hits = pointerWithin(args)
    const cards = hits.filter((hit) => !String(hit.id).startsWith('stage:'))
    return cards.length ? cards : hits.length ? hits : closestCorners(args)
  }, [])
  const patch = useCallback(
    async (contact: CrmContact, changes: Record<string, unknown>) => {
      setBusy(true)
      try {
        const updated = await saveCrmContact(contact, changes)
        setContacts((current) => current.map((row) => (row.id === updated.id ? updated : row)))
        notify('Informações atualizadas.')
        return updated
      } catch (e) {
        await load()
        throw e
      } finally {
        setBusy(false)
      }
    },
    [load, notify],
  )
  const moveOver = (event: DragOverEvent) => {
    if (!event.over) return
    const translated = event.active.rect.current.translated
    const active = contactsRef.current.find((contact) => contact.id === String(event.active.id))
    const target = contactsRef.current.find((contact) => contact.id === String(event.over?.id))
    const centerDelta = translated
      ? translated.top + translated.height / 2 - event.over.rect.top - event.over.rect.height / 2
      : 0
    // Keyboard sorting resolves the insertion side from the previous order, not pointer geometry.
    const after =
      event.activatorEvent.type === 'keydown' || Math.abs(centerDelta) < 1
        ? Boolean(
            active && target && active.stage === target.stage && active.position < target.position,
          )
        : centerDelta > 0
    const next = crmMovePreview(
      contactsRef.current,
      String(event.active.id),
      String(event.over.id),
      after,
    )
    contactsRef.current = next
    setContacts(next)
  }
  const finishDrag = async (event: DragEndEvent) => {
    const before = snapshot.current.find((contact) => contact.id === String(event.active.id)),
      current = contactsRef.current.find((contact) => contact.id === String(event.active.id))
    dragging.current = false
    setDragId(null)
    if (!event.over || !before || !current) {
      setContacts(snapshot.current)
      return
    }
    if (before.stage === current.stage && before.position === current.position) return
    try {
      await patch(before, { stage: current.stage, position: current.position })
      notify('Contato movido para ' + crmStageLabel(current.stage) + '.')
    } catch (e) {
      setContacts(snapshot.current)
      notify(e instanceof Error ? e.message : 'Não foi possível mover o contato.', true)
      await load()
    }
  }
  const members = workspace?.members ?? []
  const scoped = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.archived === archived &&
          (scope === 'all' ||
            (scope === 'mine' && contact.owner_id === profile.id) ||
            (scope === 'unassigned' && !contact.owner_id)),
      ),
    [contacts, scope, profile.id, archived],
  )
  const visible = useMemo(
    () =>
      scoped
        .filter((contact) => {
          const d = contact.current_data
          return (
            (!query ||
              crmSearchKey([d.nome, d.telefone, contact.cpf, d.curso].join(' ')).includes(
                crmSearchKey(query),
              )) &&
            (kind === 'all' ||
              (kind === 'inscrito' && contact.has_inscription) ||
              (kind === 'lead' && !contact.has_inscription)) &&
            (!ownerFilter || contact.owner_id === ownerFilter) &&
            (!course || d.curso === course) &&
            (!campus || d.campus === campus) &&
            (!shift || d.turno === shift)
          )
        })
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    [scoped, query, kind, ownerFilter, course, campus, shift],
  )
  const selected = contacts.find((contact) => contact.id === selectedId)
  const draggingContact = contacts.find((contact) => contact.id === dragId)
  const options = (field: string) =>
    [
      ...new Set(
        scoped
          .map((contact) => contact.current_data[field])
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  if (loading) return <Loading message="Carregando o CRM…" />
  if (loadError && !workspace)
    return (
      <EmptyState
        title="CRM indisponível"
        description={loadError}
        action={
          <button className={crmButton} onClick={() => void load()}>
            <RefreshCw size={16} />
            Atualizar
          </button>
        }
      />
    )
  return (
    <div className="space-y-4" data-crm-workspace>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">CRM · Captação</h1>
          <p className="mt-1 text-xs text-slate-500">
            {countLabel(visible.length)} contatos ·{' '}
            {countLabel(visible.filter((contact) => !contact.has_inscription).length)} leads ·{' '}
            {countLabel(visible.filter((contact) => contact.has_inscription).length)} inscritos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {manager && (
            <button
              type="button"
              className={crmButton}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const result = await syncCrmSources()
                  await load()
                  notify(
                    result.busy
                      ? 'Uma sincronização já está em andamento.'
                      : result.conflicts || result.invalid || result.missing_sources?.length
                        ? `Sincronização concluída com pendências: ${result.conflicts ?? 0} conflitos, ${result.invalid ?? 0} registros sem CPF/data válida.`
                        : `Sincronização concluída: ${result.updated ?? 0} registros atualizados.`,
                  )
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Falha na sincronização.', true)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          )}
          <button
            type="button"
            className={crmButton + ' !border-slate-950 !bg-slate-950 !text-white'}
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            Novo contato
          </button>
        </div>
      </header>
      {workspace?.config.include_history && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Teste ativo · amostra de até {workspace.config.history_limit} contatos anteriores a
            13/11/2026
          </span>
          <span>
            {workspace.config.last_sync_at
              ? 'Última sincronização: ' + shortDate(workspace.config.last_sync_at)
              : 'Sem sincronização inicial'}
          </span>
        </div>
      )}
      {feedback && (
        <div
          role={feedback.error ? 'alert' : 'status'}
          aria-live="polite"
          className={
            'fixed left-1/2 top-16 z-[70] flex w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-md ' +
            (feedback.error
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800')
          }
        >
          <span>{feedback.text}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setFeedback(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-red-700">
          {loadError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-1 border-b border-slate-200"
          aria-label="Responsabilidade dos contatos"
        >
          {(
            [
              ['mine', 'Meus'],
              ['unassigned', 'Sem responsável'],
              ...(manager ? [['all', 'Todos']] : []),
            ] as Array<[Scope, string]>
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={scope === value}
              className={
                'border-b-2 px-3 py-2 text-sm font-medium ' +
                (scope === value
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500')
              }
              onClick={() => setScope(value)}
            >
              {label}
              <span className="ml-1.5 text-xs text-slate-400">
                {
                  contacts.filter(
                    (contact) =>
                      contact.archived === archived &&
                      (value === 'all' ||
                        (value === 'mine' && contact.owner_id === profile.id) ||
                        (value === 'unassigned' && !contact.owner_id)),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              className={crmInput + ' !pl-8 sm:!w-64'}
              aria-label="Buscar contato"
              placeholder="Buscar nome, telefone ou CPF"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className={crmInput + ' !w-auto'}
            aria-label="Tipo de cadastro"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">Leads e inscritos</option>
            <option value="lead">Leads</option>
            <option value="inscrito">Inscritos</option>
          </select>
          <button
            className={crmButton + ' !p-2.5'}
            type="button"
            title="Filtros do quadro"
            aria-label="Filtros do quadro"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>
      {showFilters && (
        <div className="grid items-end gap-3 border-y border-slate-200 py-3 sm:grid-cols-2 xl:grid-cols-5">
          {(
            [
              ['Curso', course, setCourse, options('curso')],
              ['Campus', campus, setCampus, options('campus')],
              ['Turno', shift, setShift, options('turno')],
            ] as const
          ).map(([label, value, setter, values]) => (
            <label key={label} className="space-y-1 text-xs text-slate-500">
              <span>{label}</span>
              <select
                className={crmInput}
                aria-label={'Filtrar ' + label.toLowerCase()}
                value={value}
                onChange={(event) => setter(event.target.value)}
              >
                <option value="">Todos</option>
                {values.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          {manager && (
            <label className="space-y-1 text-xs text-slate-500">
              <span>Responsável</span>
              <select
                className={crmInput}
                aria-label="Filtrar responsável"
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
              >
                <option value="">Todos</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-600"
                checked={archived}
                onChange={(event) => setArchived(event.target.checked)}
              />
              Arquivados
            </label>
            <button
              type="button"
              className={crmButton + ' !p-2'}
              title="Limpar filtros"
              aria-label="Limpar filtros do CRM"
              onClick={() => {
                setCourse('')
                setCampus('')
                setShift('')
                setOwnerFilter('')
                setKind('all')
                setQuery('')
                setArchived(false)
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <LoaderCircle size={13} className="animate-spin" />
              Salvando…
            </span>
          ) : (
            'Quadro de atendimento'
          )}
        </span>
        <select
          className="max-w-[210px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
          aria-label="Ir para fase"
          defaultValue=""
          onChange={(event) => {
            const target = document.getElementById('crm-stage-' + event.target.value)
            if (target && board.current)
              board.current.scrollTo({
                left: target.offsetLeft - board.current.offsetLeft,
                behavior: 'smooth',
              })
          }}
        >
          <option value="" disabled>
            Ir para fase
          </option>
          {crmStages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.label}
            </option>
          ))}
        </select>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(event) => {
          snapshot.current = contactsRef.current
          dragging.current = true
          setDragId(String(event.active.id))
        }}
        onDragOver={moveOver}
        onDragCancel={() => {
          setContacts(snapshot.current)
          setDragId(null)
          dragging.current = false
        }}
        onDragEnd={(event) => void finishDrag(event)}
        accessibility={{
          announcements: {
            onDragStart: () => 'Contato selecionado para movimentação.',
            onDragOver: ({ over }) => (over ? 'Destino selecionado.' : undefined),
            onDragEnd: () => 'Movimentação encerrada.',
            onDragCancel: () => 'Movimentação cancelada.',
          },
        }}
      >
        <div
          ref={board}
          aria-label="Quadro Kanban"
          className="crm-board flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-3"
          style={{ height: 'var(--crm-board-height, 520px)', scrollbarGutter: 'stable' }}
        >
          {crmStages.map((stage) => {
            const rows = visible.filter((contact) => contact.stage === stage.id)
            return (
              <Column key={stage.id} stage={stage} contacts={rows}>
                {rows.map((contact) => (
                  <SortableCard
                    key={contact.id}
                    contact={contact}
                    owner={members.find((member) => member.id === contact.owner_id)?.nome}
                    profile={profile}
                    busy={busy}
                    now={now}
                    onOpen={() => setSelected(contact.id)}
                    onClaim={() =>
                      void patch(contact, { owner_id: profile.id }).catch((e) =>
                        notify(e.message, true),
                      )
                    }
                  />
                ))}
              </Column>
            )
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingContact && (
            <div className="w-[267px] rounded-lg border border-sky-300 bg-white p-3 shadow-xl">
              <CardContent
                contact={draggingContact}
                now={now}
                owner={members.find((member) => member.id === draggingContact.owner_id)?.nome}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {selected && (
        <CrmContactDrawer
          key={selected.id}
          contact={selected}
          profile={profile}
          members={members}
          busy={busy}
          onClose={closeDrawer}
          onPatch={patch}
          onChanged={load}
          notify={notify}
        />
      )}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 p-3"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setCreating(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-create-title"
            data-crm-create
            className="max-h-[95dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <header className="mb-5 flex items-center justify-between gap-3">
              <h2 id="crm-create-title" className="text-lg font-semibold">
                Novo contato
              </h2>
              <button
                ref={createClose}
                className={crmButton + ' !p-2'}
                type="button"
                title="Fechar cadastro"
                aria-label="Fechar cadastro"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                <X size={16} />
              </button>
            </header>
            <CrmContactForm
              members={members}
              manager={manager}
              busy={busy}
              onCancel={() => setCreating(false)}
              onSave={async (data, cpf, owner) => {
                setBusy(true)
                try {
                  const contact = await crmRpc<CrmContact>('crm_kanban_create', {
                    p_cpf: cpf,
                    p_data: data,
                    p_owner: owner,
                  })
                  await load()
                  setCreating(false)
                  setSelected(contact.id)
                  notify(
                    'Cadastro salvo. Inscrições e contatos existentes foram mantidos no mesmo CPF.',
                  )
                } finally {
                  setBusy(false)
                }
              }}
            />
          </section>
        </div>
      )}
    </div>
  )
}

export function CrmKanban() {
  const { profile, loading } = useProfile()
  if (loading) return <Loading message="Validando acesso ao CRM…" />
  if (!profile)
    return (
      <EmptyState
        title="Perfil indisponível"
        description="Não foi possível identificar o usuário."
      />
    )
  return <CrmKanbanView profile={profile} />
}
