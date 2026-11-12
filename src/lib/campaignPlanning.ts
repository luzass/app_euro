import type { GenericRow } from './dashboardHelpers'
import { activePeople, cpfKey, dateDay, matriculasForPeriod, matriculaDateFields, registrationsForPeriod, shiftedDay, type CampaignData, type ForecastConfig } from './campaignForecast.ts'
import { normalizedText, profileField } from './studentProfile.ts'
import { campaignPolicy20271 } from './campaignPolicy20271.ts'
import { calouroAdmissionSegment } from './enrollmentGoals.ts'
import { buildCaptureForecast } from './campaignCapture.ts'

export type PlanningDimension = 'geral' | 'curso' | 'campus' | 'ingresso' | 'curso_campus'
export type PlanningMetric = 'inscritos' | 'matriculas'
export type PlanningGrain = 'day' | 'week' | 'month'
type GroupResolver = (row: GenericRow, enrollment: boolean, dimension: PlanningDimension) => string
type GroupEvents = { dates: Map<string, number | null>; missingCpf: number; missingDates: number }

function rowsFor(data: CampaignData[], period: string, metric: PlanningMetric) {
  if (metric === 'inscritos') return registrationsForPeriod(data, period)
  const rows = matriculasForPeriod(data, period)
  const known = [...activePeople(rows).values()].filter((person) => person.type === 'calouro').flatMap((person) => person.rows)
  return [...known, ...rows.filter((row) => !cpfKey(row) && ['ATIVO', 'CONTRATO ATIVO'].includes(normalizedText(profileField(row, 'contrato'))) && normalizedText(profileField(row, 'tipo_aluno')) === 'CALOURO')]
}

export function planningGroupLabel(row: GenericRow, enrollment: boolean, dimension: PlanningDimension) {
  const course = normalizedText(profileField(row, 'curso')).replace(/\s+/g, ' ') || 'NÃO INFORMADO'
  const originalCampus = normalizedText(profileField(row, ...(enrollment ? ['filial', 'campus'] : ['campus', 'filial'])))
  const campus = originalCampus.includes('AGUAS CLARAS') ? 'ÁGUAS CLARAS' : /ASA SUL|EUROAM/.test(originalCampus) ? 'ASA SUL' : originalCampus || 'NÃO INFORMADO'
  const ingresso = normalizedText(profileField(row, ...(enrollment ? ['tipo_de_ingresso'] : ['forma_de_ingresso', 'tipo_de_ingresso'])))
  const admission = ingresso.includes('PROUNI') ? 'PROUNI' : ingresso.includes('FIES') ? 'FIES' : /VESTIBULAR|DIGITAL|MEDICINA PRESENCIAL/.test(ingresso) ? 'VESTIBULAR'
    : ingresso.includes('ENEM') ? 'ENEM' : /GRADUADO|2[ªA]? GRADUACAO/.test(ingresso) ? 'GRADUADO' : /TRANS.*INTERNA/.test(ingresso) ? 'TRANSFERÊNCIA INTERNA'
      : /TRANS.*EXT/.test(ingresso) ? 'TRANSFERÊNCIA EXTERNA' : ingresso || 'NÃO INFORMADO'
  return dimension === 'geral' ? 'GERAL' : dimension === 'curso' ? course : dimension === 'campus' ? campus : dimension === 'ingresso' ? admission : `${course} / ${campus}`
}

function groupEvents(rows: GenericRow[], metric: PlanningMetric, dimension: PlanningDimension, config: ForecastConfig, resolver: GroupResolver) {
  const groups = new Map<string, GroupEvents>()
  for (const row of rows) {
    const label = dimension === 'geral' ? 'GERAL' : resolver(row, metric === 'matriculas', dimension)
    const group = groups.get(label) ?? { dates: new Map(), missingCpf: 0, missingDates: 0 }
    const cpf = cpfKey(row)
    if (!cpf) group.missingCpf++
    else {
      const fields = metric === 'inscritos' ? ['data_inscricao'] : matriculaDateFields(config)
      const day = fields.map((field) => dateDay(profileField(row, field))).find((value) => value !== null) ?? null
      const previous = group.dates.get(cpf)
      if (!group.dates.has(cpf) || day !== null && (previous === null || previous === undefined || day < previous)) group.dates.set(cpf, day)
    }
    groups.set(label, group)
  }
  for (const group of groups.values()) group.missingDates = [...group.dates.values()].filter((day) => day === null).length
  return groups
}

function observation(group: GroupEvents | undefined, start: number, end: number, cutoff: number, available: boolean) {
  const beforeStart = [...(group?.dates.values() ?? [])].filter((day) => day !== null && day < start).length
  const dates = [...(group?.dates.values() ?? [])].filter((day): day is number => day !== null && day >= start && day <= end).sort((a, b) => a - b)
  const observed = dates.filter((day) => day <= cutoff)
  const last = observed.at(-1) ?? null
  const invalid = (group?.missingDates ?? 0) + (group?.missingCpf ?? 0)
  return { dates, observed, beforeStart, count: available ? observed.length : null, last, daysSince: last === null ? null : cutoff - last,
    invalid, future: dates.length - observed.length, available,
    status: !available ? 'unavailable' : !observed.length && invalid ? 'unknown' : !observed.length ? 'none' : 'dated' }
}

export function planningBuckets(start: number, end: number, grain: PlanningGrain) {
  const result: Array<{ start: number; end: number; label: string }> = []
  const label = (day: number) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(new Date(day * 86400000))
  for (let day = start; day <= end;) {
    const date = new Date(day * 86400000)
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 86400000
    const last = Math.min(end, grain === 'day' ? day : grain === 'week' ? day + 6 : nextMonth - 1)
    result.push({ start: day, end: last, label: grain === 'month' ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short', year: '2-digit' }).format(date) : day === last ? label(day) : `${label(day)}–${label(last)}` })
    day = last + 1
  }
  return result
}

export function buildCampaignPlanning(data: CampaignData[], config: ForecastConfig, dimension: PlanningDimension, metric: PlanningMetric, resolver: GroupResolver = planningGroupLabel, withProjection = true) {
  const start = dateDay(config.start), end = dateDay(config.end), cut = dateDay(config.asOf)
  if (start === null || end === null || cut === null || end <= start || cut < start || end - start > 730) return null
  const cutoff = Math.min(cut, end), elapsed = cutoff - start + 1, remaining = end - cutoff
  const periods = [...new Set([config.currentPeriod, ...config.references.filter((period) => period < config.currentPeriod && period.endsWith(config.currentPeriod.slice(-2)))])]
  const snapshots = new Map(periods.map((period) => {
    const source = data.find((item) => item.period === period)
    return [period, { delta: Number(period.slice(0, 4)) - Number(config.currentPeriod.slice(0, 4)),
      inscritos: groupEvents(rowsFor(data, period, 'inscritos'), 'inscritos', dimension, config, resolver),
      matriculas: groupEvents(rowsFor(data, period, 'matriculas'), 'matriculas', dimension, config, resolver),
      inscritosAvailable: Boolean(source && !source.inscritosError), matriculasAvailable: Boolean(source && !source.matriculadosError) }]
  }))
  const labels = new Set<string>(dimension === 'geral' ? ['GERAL'] : [])
  for (const snapshot of snapshots.values()) for (const label of [...snapshot.inscritos.keys(), ...snapshot.matriculas.keys()]) labels.add(label)
  const current = snapshots.get(config.currentPeriod)!
  const groups = [...labels].map((label) => {
    const registrations = observation(current.inscritos.get(label), start, end, cutoff, current.inscritosAvailable)
    const enrollments = observation(current.matriculas.get(label), start, end, cutoff, current.matriculasAvailable)
    const selected = metric === 'inscritos' ? registrations : enrollments
    const references = periods.filter((period) => period !== config.currentPeriod).map((period) => {
      const snapshot = snapshots.get(period)!
      const record = observation(snapshot[metric].get(label), shiftedDay(start, snapshot.delta), shiftedDay(end, snapshot.delta), shiftedDay(cutoff, snapshot.delta), snapshot[`${metric}Available`])
      return { period, delta: snapshot.delta, ...record, total: record.dates.length + record.beforeStart }
    })
    const usable = references.filter((reference) => reference.available && !reference.invalid && reference.total > 0)
    const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    const historicalAtCut = mean(usable.map((reference) => reference.observed.length + reference.beforeStart))
    const historicalRemaining = mean(usable.map((reference) => reference.dates.length - reference.observed.length))
    const count = selected.count === null ? null : selected.count + selected.beforeStart, rate = selected.count === null ? null : selected.count / elapsed
    const index = historicalAtCut && count !== null ? count / historicalAtCut : null
    const scoped = dimension === 'geral' ? data : data.map((source) => ({ ...source, inscritos: source.inscritos.filter((row) => resolver(row, false, dimension) === label), matriculados: source.matriculados.filter((row) => resolver(row, true, dimension) === label) }))
    const capture = withProjection ? buildCaptureForecast(scoped, config, false) : null
    const projection = metric === 'inscritos' ? capture?.inscritos : capture?.calouros
    const reason = !selected.available ? 'Base atual indisponível' : selected.invalid ? 'Há CPFs ou datas pendentes neste grupo' : projection?.scenario.reason || ''
    const linear = projection?.linearReference ?? null
    const adjusted = !reason && projection?.scenario.method !== 'linear' ? projection?.scenario.reference ?? null : null
    return { label, registrations, enrollments, selected, references, usable, count, rate, index, historicalAtCut, historicalRemaining,
      linear, adjusted, reason, linearRate: projection?.linearRate ?? rate, forecastNote: projection?.scenario.note ?? '', forecastComplete: projection?.scenario.complete !== false, low: projection?.scenario.low ?? null, high: projection?.scenario.high ?? null }
  })
  return { start, end, cutoff, elapsed, remaining, metric, groups }
}

export function planningTimeline(model: NonNullable<ReturnType<typeof buildCampaignPlanning>>, group: NonNullable<ReturnType<typeof buildCampaignPlanning>>['groups'][number], grain: PlanningGrain) {
  const buckets = planningBuckets(model.start, model.end, grain).flatMap((bucket) => bucket.start <= model.cutoff && bucket.end > model.cutoff ? [
    { ...bucket, end: model.cutoff, label: bucket.label + ' · corte', partial: true },
    { ...bucket, start: model.cutoff + 1, label: bucket.label + ' · restante', partial: false },
  ] : [{ ...bucket, partial: false }])
  return buckets.map((bucket) => {
    const observedEnd = Math.min(bucket.end, model.cutoff)
    const actual = bucket.start > model.cutoff || group.count === null ? null : group.selected.beforeStart + group.selected.observed.filter((day) => day <= observedEnd).length
    const volume = bucket.start > model.cutoff || group.count === null ? null : group.selected.observed.filter((day) => day >= bucket.start && day <= observedEnd).length
    const expectedFuture = group.usable.length ? group.usable.reduce((sum, reference) => sum + reference.dates.filter((day) => day > shiftedDay(model.cutoff, reference.delta) && day <= shiftedDay(bucket.end, reference.delta)).length, 0) / group.usable.length : null
    return { label: bucket.label, start: bucket.start, end: bucket.end, actual, volume, partial: bucket.partial,
      ...Object.fromEntries(group.references.map((reference) => [`history_${reference.period.replace('.', '_')}`, reference.available && (reference.dates.length > 0 || !reference.invalid) ? reference.beforeStart + reference.dates.filter((day) => day <= shiftedDay(bucket.end, reference.delta)).length : null])),
      linear: bucket.end >= model.cutoff && group.linear !== null ? Math.round(group.count! + group.linearRate! * Math.max(0, bucket.end - model.cutoff)) : null,
      adjusted: bucket.end >= model.cutoff && group.adjusted !== null ? Math.round(group.count! + Math.max(0, group.adjusted - group.count!) * (group.historicalRemaining && expectedFuture !== null ? expectedFuture / group.historicalRemaining : model.remaining ? Math.max(0, bucket.end - model.cutoff) / model.remaining : 0)) : null,
      historical: group.usable.length ? group.usable.reduce((sum, reference) => sum + reference.beforeStart + reference.dates.filter((day) => day <= shiftedDay(bucket.end, reference.delta)).length, 0) / group.usable.length : null }
  })
}

export function monthlyPolicyProgress(data: CampaignData[], config: ForecastConfig, tier: number) {
  const cutoff = dateDay(config.asOf)
  const people = activePeople(matriculasForPeriod(data, config.currentPeriod))
  const events = new Map<string, number>()
  let invalidDates = 0
  for (const person of people.values()) {
    if (person.type !== 'calouro') continue
    const rows = person.rows.filter((row) => normalizedText(profileField(row, 'curso')) !== 'MEDICINA')
    if (calouroAdmissionSegment(rows) !== 'regular') continue
    const days = rows.map((row) => dateDay(profileField(row, 'data_baixa_do_pagamento'))).filter((day): day is number => day !== null)
    if (!days.length) { invalidDates++; continue }
    events.set(person.cpf, Math.min(...days))
  }
  const available = Boolean(data.find((source) => source.period === config.currentPeriod && !source.matriculadosError))
  return { invalidDates, rows: campaignPolicy20271.monthly.map((month) => {
    const start = dateDay(month.month + '-01')!
    const date = new Date(start * 86400000), end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 86400000 - 1
    const target = month.targets[Math.max(0, Math.min(3, tier))]
    const days = cutoff === null ? 0 : Math.max(0, Math.min(end, cutoff) - start + 1)
    const observed = !available || cutoff === null || cutoff < start ? null : [...events.values()].filter((day) => day >= start && day <= end && day <= cutoff).length
    return { ...month, target, observed, guide: target * days / (end - start + 1), gap: observed === null ? null : Math.max(0, target - observed), partial: cutoff !== null && cutoff >= start && cutoff < end }
  }) }
}
