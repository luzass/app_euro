import {
  crmSearchKey,
  crmStages,
  type CrmData,
  type CrmLossInfo,
  type CrmMember,
} from './crmKanban.ts'
import { crmReminders, type CrmReminderBase } from './crmWorkflow.ts'

export interface BiContact extends CrmReminderBase {
  owner_id: string | null
  has_inscription: boolean
  test_only: boolean
  loss_data?: Omit<CrmLossInfo, 'note'> | null
  entry_at: string
  entry_day: string
  entry_basis: 'event' | 'fallback' | 'test'
  entry_event_id: number | null
  entry_stage: string
  origin: string
  first_inscription_at: string | null
  first_inscription_day: string | null
  first_inscription_event_id: number | null
  first_enrollment_at: string | null
  first_enrollment_day: string | null
  first_enrollment_event_id: number | null
  enrolled_as_of: boolean
  history_complete: boolean
}
export interface BiEvent {
  id: number
  contact_id: string
  at: string
  day: string
  actor_id: string | null
  type: string
  data: Record<string, unknown>
}
export interface BiActivity {
  id: string
  contact_id: string
  author_id: string
  at: string
  day: string
  direction: string
}
export interface BiSnapshot {
  version: number
  generated_at: string
  from: string
  to: string
  from_at: string
  cutoff_at: string
  include_tests: boolean
  tracking_started_at: string | null
  sync: {
    at: string | null
    result: { invalid?: number; conflicts?: number; missing_sources?: string[] }
  } | null
  contacts: BiContact[]
  events: BiEvent[]
  activities: BiActivity[]
  members: CrmMember[]
  reasons: Array<{ id: string; name: string; active: boolean }>
}
export interface BiFilters {
  from: string
  to: string
  owner: string
  course: string
  campus: string
  origin: string
  admission: string
  includeTests: boolean
  bucket: 'day' | 'week'
  tab: 'Resumo' | 'Funil' | 'Equipe' | 'Desistências'
}
export interface BiListRow {
  id: string
  contactId: string
  name: string
  course: string
  campus: string
  owner: string
  detail: string
  at?: string | null
}
export const originLabels: Record<string, string> = {
  leads_cursos: 'Landing page',
  inscritos_20271: 'Inscritos 2027.1',
  manual: 'Cadastro manual',
  unknown: 'Não identificada',
}
export const biKey = (value: unknown) => crmSearchKey(value).trim().replace(/\s+/g, ' ')
export const biTime = (value: string | null | undefined) => (value ? Date.parse(value) : NaN)
const uniq = <T extends { id: string }>(rows: T[]) => [
  ...new Map(rows.map((row) => [row.id, row])).values(),
]
const within = (day: string | null | undefined, from: string, to: string) =>
  Boolean(day && day >= from && day <= to)
export function biMedian(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
export function biDuration(hours: number | null) {
  if (hours === null) return '—'
  if (hours < 1) return Math.round(hours * 60) + ' min'
  if (hours < 48)
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours) + ' h'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours / 24) + ' dias'
}
export function biPercent(n: number, d: number) {
  return d
    ? new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(n / d)
    : '—'
}
const dayNumber = (value: string) => Date.parse(value + 'T00:00:00Z') / 86400000
const isoDay = (number: number) => new Date(number * 86400000).toISOString().slice(0, 10)
export const shiftBiDay = (day: string, delta: number) => isoDay(dayNumber(day) + delta)
export function biDefaultFrom(today: string) {
  return [shiftBiDay(today, -29), '2026-11-13'].sort().at(-1)!
}
export function biOptions(values: Array<string | null | undefined>) {
  return [
    ...new Map(
      values.filter((v): v is string => Boolean(v?.trim())).map((v) => [biKey(v), v.trim()]),
    ).values(),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
export function buildCrmManagement(snapshot: BiSnapshot, filters: BiFilters) {
  const now = biTime(snapshot.generated_at),
    cutoff = biTime(snapshot.cutoff_at)
  const contacts = uniq(snapshot.contacts).filter((c) => filters.includeTests || !c.test_only)
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const events = snapshot.events
    .filter((e) => byId.has(e.contact_id) && biTime(e.at) <= now)
    .sort((a, b) => biTime(a.at) - biTime(b.at) || a.id - b.id)
  const assignments = new Map<string, BiEvent[]>()
  for (const e of events)
    if (e.type === 'assignment')
      assignments.set(e.contact_id, [...(assignments.get(e.contact_id) || []), e])
  const initialOwner = (c: BiContact) => {
    const first = assignments.get(c.id)?.[0]
    return first ? (first.data.from as string | null) || null : c.owner_id
  }
  const ownerAt = (c: BiContact, at: number, eventId = Infinity) => {
    let owner = initialOwner(c)
    for (const e of assignments.get(c.id) || [])
      if (biTime(e.at) < at || (biTime(e.at) === at && e.id <= eventId))
        owner = (e.data.to as string | null) || null
    return owner || null
  }
  const firstOwner = (c: BiContact) =>
    ownerAt(c, biTime(c.entry_at), c.entry_event_id ?? Infinity) ||
    ((assignments.get(c.id) || []).find(
      (e) => biTime(e.at) >= biTime(c.entry_at) && biTime(e.at) < cutoff && e.data.to,
    )?.data.to as string | undefined) ||
    null
  const ownerMatch = (owner: string | null | undefined) =>
    !filters.owner || (filters.owner === 'unassigned' ? !owner : owner === filters.owner)
  const attributes = (
    data:
      | CrmData
      | { curso?: string | null; campus?: string | null; forma_ingresso?: string | null },
    c: BiContact,
  ) =>
    (!filters.course || biKey(data.curso) === biKey(filters.course)) &&
    (!filters.campus || biKey(data.campus) === biKey(filters.campus)) &&
    (!filters.admission || biKey(data.forma_ingresso) === biKey(filters.admission)) &&
    (!filters.origin || c.origin === filters.origin)
  const base = contacts.filter((c) => attributes(c.current_data, c)),
    baseIds = new Set(base.map((c) => c.id))
  const scoped = base.filter((c) => ownerMatch(c.owner_id))
  const active = scoped.filter((c) => !c.archived && !c.loss_data)
  const stock = {
    active,
    leads: active.filter((c) => !c.has_inscription && !c.official_enrollment),
    inscriptions: active.filter((c) => c.has_inscription && !c.official_enrollment),
    enrolled: active.filter((c) => c.official_enrollment),
    lost: scoped.filter((c) => c.loss_data),
  }
  const validEntry = (c: BiContact) =>
    c.entry_basis === 'event' || (filters.includeTests && c.test_only)
  const entries = base.filter(
    (c) =>
      validEntry(c) && within(c.entry_day, filters.from, filters.to) && ownerMatch(firstOwner(c)),
  )
  const cohort = entries.filter((c) => c.history_complete)
  const baselineEnrolled = cohort.filter((c) => biTime(c.first_enrollment_at) <= biTime(c.entry_at))
  const leads = cohort.filter(
    (c) =>
      !(biTime(c.first_inscription_at) <= biTime(c.entry_at)) &&
      !(biTime(c.first_enrollment_at) <= biTime(c.entry_at)),
  )
  const direct = cohort.filter(
    (c) =>
      biTime(c.first_inscription_at) <= biTime(c.entry_at) &&
      !(biTime(c.first_enrollment_at) <= biTime(c.entry_at)),
  )
  const registered = leads.filter(
    (c) =>
      biTime(c.first_inscription_at) > biTime(c.entry_at) &&
      biTime(c.first_inscription_at) < cutoff,
  )
  const converted = (rows: BiContact[]) =>
    rows.filter(
      (c) =>
        c.enrolled_as_of &&
        biTime(c.first_enrollment_at) > biTime(c.entry_at) &&
        biTime(c.first_enrollment_at) < cutoff,
    )
  const cohortGroups = [
    {
      label: 'Entraram como lead',
      id: 'lead',
      base: leads,
      registered,
      converted: converted(leads),
    },
    {
      label: 'Entraram já inscritos',
      id: 'direct',
      base: direct,
      registered: [] as BiContact[],
      converted: converted(direct),
    },
  ]
  const inscriptionFlow = base.filter(
    (c) =>
      within(c.first_inscription_day, filters.from, filters.to) &&
      ownerMatch(
        ownerAt(c, biTime(c.first_inscription_at), c.first_inscription_event_id ?? Infinity),
      ),
  )
  const enrollmentFlow = base.filter(
    (c) =>
      within(c.first_enrollment_day, filters.from, filters.to) &&
      ownerMatch(
        ownerAt(c, biTime(c.first_enrollment_at), c.first_enrollment_event_id ?? Infinity),
      ),
  )
  const activities = snapshot.activities.filter(
    (a) =>
      baseIds.has(a.contact_id) && within(a.day, filters.from, filters.to) && biTime(a.at) < cutoff,
  )
  const outgoing = activities.filter((a) => a.direction === 'outbound' && ownerMatch(a.author_id))
  const incoming = activities.filter((a) => a.direction === 'inbound' && ownerMatch(a.author_id))
  const contactsFor = (ids: string[]) =>
    uniq(ids.map((id) => byId.get(id)).filter((c): c is BiContact => Boolean(c)))
  const outreachContacts = contactsFor(outgoing.map((a) => a.contact_id))
  const firstOutreach = new Map<string, BiActivity>()
  for (const a of snapshot.activities
    .filter(
      (a) =>
        a.direction === 'outbound' &&
        byId.has(a.contact_id) &&
        biTime(a.at) >= biTime(byId.get(a.contact_id)!.entry_at) &&
        biTime(a.at) < cutoff,
    )
    .sort((a, b) => biTime(a.at) - biTime(b.at)))
    if (!firstOutreach.has(a.contact_id)) firstOutreach.set(a.contact_id, a)
  const firstContactSamples = base.flatMap((c) => {
    const a = firstOutreach.get(c.id)
    return a &&
      within(a.day, filters.from, filters.to) &&
      ownerMatch(a.author_id) &&
      biTime(a.at) >= biTime(c.entry_at)
      ? [{ contact: c, activity: a, hours: (biTime(a.at) - biTime(c.entry_at)) / 3600000 }]
      : []
  })
  const reminders = crmReminders(active, now)
  const late = reminders.filter((r) => (r.kind === 'cadence' || r.kind === 'manual') && r.due < now)
  const idle = reminders.filter((r) => r.kind === 'idle'),
    noResponse = reminders.filter((r) => r.kind === 'response')
  const closed = events
    .filter((e) => e.type === 'loss_closed' && within(e.day, filters.from, filters.to))
    .filter((e) => {
      const c = byId.get(e.contact_id)!,
        p = e.data
      return (
        attributes(
          {
            curso: p.course as string | null,
            campus: p.campus as string | null,
            forma_ingresso: p.admission as string | null,
          },
          c,
        ) && ownerMatch(p.owner_id as string | null)
      )
    })
  const losses = [...new Map(closed.map((e) => [String(e.data.id || e.id), e])).values()]
  const reopenEvents = events.filter(
    (e) =>
      e.type === 'loss_reopened' &&
      within(e.day, filters.from, filters.to) &&
      baseIds.has(e.contact_id) &&
      ownerMatch(
        (e.data.owner_id as string | null) || ownerAt(byId.get(e.contact_id)!, biTime(e.at), e.id),
      ),
  )
  const movements = events.filter(
    (e) =>
      e.type === 'stage' &&
      within(e.day, filters.from, filters.to) &&
      baseIds.has(e.contact_id) &&
      ownerMatch(ownerAt(byId.get(e.contact_id)!, biTime(e.at), e.id)),
  )
  const reasons = snapshot.reasons
    .map((reason) => {
      const rows = losses.filter((e) => e.data.reason_id === reason.id)
      return {
        ...reason,
        total: rows.length,
        reported: rows.filter((e) => e.data.evidence === 'candidate_reported').length,
        inferred: rows.filter((e) => e.data.evidence === 'staff_inferred').length,
        rows,
      }
    })
    .filter((r) => r.total)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
  const unknownLosses = losses.filter(
    (e) => !snapshot.reasons.some((r) => r.id === e.data.reason_id),
  )
  if (unknownLosses.length)
    reasons.push({
      id: 'unknown',
      name: 'Motivo fora do catálogo',
      active: false,
      total: unknownLosses.length,
      reported: unknownLosses.filter((e) => e.data.evidence === 'candidate_reported').length,
      inferred: unknownLosses.filter((e) => e.data.evidence === 'staff_inferred').length,
      rows: unknownLosses,
    })
  const funnel = crmStages.map((stage) => {
    const rows = active.filter((c) => c.stage === stage.id)
    return {
      ...stage,
      short:
        stage.id === 'abordagem'
          ? 'Abordagem'
          : stage.id === 'vestibular'
            ? 'Prova online'
            : stage.label,
      count: rows.length,
      rows,
      medianHours: biMedian(
        rows.map((c) => (now - biTime(c.stage_entered_at)) / 3600000).filter((n) => n >= 0),
      ),
      late: late.filter((r) => r.contact.stage === stage.id).length,
      movements: movements.filter((e) => e.data.to === stage.id).length,
    }
  })
  const teamIds = new Set(
    snapshot.members
      .filter((m) => ['captacao', 'funcionario', 'captacao_gerente'].includes(m.role))
      .map((m) => m.id),
  )
  for (const c of base) if (c.owner_id) teamIds.add(c.owner_id)
  for (const c of [...inscriptionFlow, ...enrollmentFlow]) {
    const inscriptionOwner = ownerAt(
      c,
      biTime(c.first_inscription_at),
      c.first_inscription_event_id ?? Infinity,
    )
    const enrollmentOwner = ownerAt(
      c,
      biTime(c.first_enrollment_at),
      c.first_enrollment_event_id ?? Infinity,
    )
    if (c.first_inscription_at && inscriptionOwner) teamIds.add(inscriptionOwner)
    if (c.first_enrollment_at && enrollmentOwner) teamIds.add(enrollmentOwner)
  }
  for (const e of losses) if (e.data.owner_id) teamIds.add(String(e.data.owner_id))
  for (const a of activities)
    if (a.direction !== 'note' && a.direction !== 'unknown') teamIds.add(a.author_id)
  const team = [...teamIds, 'unassigned']
    .filter((id) => ownerMatch(id === 'unassigned' ? null : id))
    .map((id) => {
      const owner = id === 'unassigned' ? null : id,
        portfolio = base.filter((c) => c.owner_id === owner && !c.archived && !c.loss_data)
      const sent = activities.filter((a) => a.author_id === id && a.direction === 'outbound'),
        received = activities.filter((a) => a.author_id === id && a.direction === 'inbound')
      const lateRows = crmReminders(portfolio, now).filter(
        (r) => (r.kind === 'cadence' || r.kind === 'manual') && r.due < now,
      )
      const enrollmentRows = base.filter(
        (c) =>
          within(c.first_enrollment_day, filters.from, filters.to) &&
          ownerAt(c, biTime(c.first_enrollment_at), c.first_enrollment_event_id ?? Infinity) ===
            owner,
      )
      const inscriptionRows = base.filter(
        (c) =>
          within(c.first_inscription_day, filters.from, filters.to) &&
          ownerAt(c, biTime(c.first_inscription_at), c.first_inscription_event_id ?? Infinity) ===
            owner,
      )
      return {
        id,
        name:
          snapshot.members.find((m) => m.id === id)?.nome ??
          (id === 'unassigned' ? 'Sem responsável' : 'Colaborador anterior'),
        portfolio,
        sent,
        received,
        contacted: contactsFor(sent.map((a) => a.contact_id)),
        late: lateRows,
        inscriptions: inscriptionRows,
        enrollments: enrollmentRows,
        losses: losses.filter((e) => (e.data.owner_id || null) === owner),
      }
    })
    .sort((a, b) => b.late.length - a.late.length || a.name.localeCompare(b.name, 'pt-BR'))
  const tracking = snapshot.tracking_started_at
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(snapshot.tracking_started_at))
    : null
  const buckets = new Map<
    string,
    { day: string; entries: number | null; enrollments: number | null; closures: number | null }
  >()
  const bucket = (day: string) => {
    const n = dayNumber(day)
    return filters.bucket === 'week'
      ? isoDay(n - ((new Date(n * 86400000).getUTCDay() + 6) % 7))
      : day
  }
  for (let n = dayNumber(filters.from); n <= dayNumber(filters.to); n++) {
    const day = isoDay(n),
      k = bucket(day)
    if (!buckets.has(k))
      buckets.set(k, {
        day: k,
        entries: tracking && day < tracking ? null : 0,
        enrollments: tracking && day < tracking ? null : 0,
        closures: tracking && day < tracking ? null : 0,
      })
    else if (!tracking || day >= tracking) {
      const b = buckets.get(k)!
      b.entries ??= 0
      b.enrollments ??= 0
      b.closures ??= 0
    }
  }
  for (const c of entries) {
    const b = buckets.get(bucket(c.entry_day))
    if (b) b.entries = (b.entries ?? 0) + 1
  }
  for (const c of enrollmentFlow) {
    const b = buckets.get(bucket(c.first_enrollment_day!))
    if (b) b.enrollments = (b.enrollments ?? 0) + 1
  }
  for (const e of losses) {
    const b = buckets.get(bucket(e.day))
    if (b) b.closures = (b.closures ?? 0) + 1
  }
  const memberName = (id: string | null) =>
    snapshot.members.find((m) => m.id === id)?.nome ??
    (id ? 'Colaborador anterior' : 'Sem responsável')
  const row = (c: BiContact, detail = '', at?: string | null, owner = c.owner_id): BiListRow => ({
    id: c.id,
    contactId: c.id,
    name: c.current_data.nome || 'Nome não informado',
    course: c.current_data.curso || 'Não informado',
    campus: c.current_data.campus || 'Não informado',
    owner: memberName(owner),
    detail,
    at,
  })
  const lossRow = (e: BiEvent): BiListRow => {
    const c = byId.get(e.contact_id)!
    return {
      ...row(c, '', e.at, (e.data.owner_id as string | null) || null),
      id: String(e.data.id || e.id),
      course: String(e.data.course || 'Não informado'),
      campus: String(e.data.campus || 'Não informado'),
      detail:
        String(e.data.reason_label || 'Motivo não informado') +
        ' · ' +
        (e.data.evidence === 'candidate_reported'
          ? 'Informado pelo candidato'
          : 'Percepção do atendente'),
    }
  }
  return {
    stock,
    ownerAt,
    firstOwner,
    entries,
    cohortGroups,
    baselineEnrolled,
    cohortUnknown: entries.filter((c) => !c.history_complete),
    inscriptionFlow,
    enrollmentFlow,
    outgoing,
    incoming,
    outreachContacts,
    firstContactSamples,
    firstContactMedian: biMedian(firstContactSamples.map((s) => s.hours)),
    reminders,
    late,
    idle,
    noResponse,
    losses,
    reopenEvents,
    reasons,
    funnel,
    team,
    trend: [...buckets.values()],
    row,
    lossRow,
    contactsFor,
    contactById: byId,
    quality: {
      fallback: base.filter((c) => c.entry_basis === 'fallback'),
      legacyActivities: activities.filter((a) => a.direction === 'unknown'),
      tests: snapshot.include_tests,
      sync: snapshot.sync,
      tracking,
    },
    options: {
      courses: biOptions([
        ...contacts.map((c) => c.current_data.curso),
        ...events.filter((e) => e.type === 'loss_closed').map((e) => e.data.course as string),
      ]),
      campuses: biOptions([
        ...contacts.map((c) => c.current_data.campus),
        ...events.filter((e) => e.type === 'loss_closed').map((e) => e.data.campus as string),
      ]),
      admissions: biOptions([
        ...contacts.map((c) => c.current_data.forma_ingresso),
        ...events.filter((e) => e.type === 'loss_closed').map((e) => e.data.admission as string),
      ]),
      origins: biOptions(contacts.map((c) => c.origin)),
    },
  }
}
export type CrmManagementModel = ReturnType<typeof buildCrmManagement>
