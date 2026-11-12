import type { GenericRow } from './dashboardHelpers'
import { academicPeriod, compareRenewal, indexRenewalRows } from './enrollmentRenewal.ts'
import { medianAge, normalizedText, profileField } from './studentProfile.ts'

export interface CampaignData {
  period: string
  inscritos: GenericRow[]
  matriculados: GenericRow[]
  inscritosError?: string
  matriculadosError?: string
}
export interface ForecastConfig {
  currentPeriod: string
  start: string
  end: string
  asOf: string
  references: string[]
  matriculaDate?: 'payment' | 'enrollment'
}
export interface ForecastScenario {
  observed: number
  low: number | null
  reference: number | null
  high: number | null
  reason: string
  method?: 'historical' | 'linear' | 'mixed'
  note?: string
}
interface ActivePerson {
  cpf: string
  type: 'calouro' | 'veterano' | null
  rows: GenericRow[]
}
const DAY = 86400000

export function matriculaDateFields(config: Pick<ForecastConfig, 'matriculaDate'>) {
  return config.matriculaDate === 'payment' ? ['data_baixa_do_pagamento']
    : config.matriculaDate === 'enrollment' ? ['data_de_matricula'] : ['data_de_matricula', 'data_baixa_do_pagamento']
}

export function dateDay(value: unknown): number | null {
  const text = String(value ?? '').trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(text)
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(text)
  if (!iso && !br) return null
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(br![3]), Number(br![2]), Number(br![1])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() / DAY : null
}

export function cpfKey(row: GenericRow) {
  const digits = profileField(row, 'cpf').replace(/\D/g, '')
  return /^\d{1,11}$/.test(digits) && !/^0+$/.test(digits) ? digits.padStart(11, '0') : ''
}

export function activePeople(rows: GenericRow[]) {
  const groups = new Map<string, GenericRow[]>()
  for (const row of rows) {
    const cpf = cpfKey(row)
    const contract = normalizedText(profileField(row, 'contrato'))
    if (!cpf || !['ATIVO', 'CONTRATO ATIVO'].includes(contract)) continue
    groups.set(cpf, [...(groups.get(cpf) ?? []), row])
  }
  const people = new Map<string, ActivePerson>()
  for (const [cpf, entries] of groups) {
    const types = new Set(entries.map((row) => normalizedText(profileField(row, 'tipo_aluno'))))
    const type = types.size === 1 && types.has('CALOURO') ? 'calouro' : types.size === 1 && types.has('VETERANO') ? 'veterano' : null
    people.set(cpf, { cpf, rows: entries, type })
  }
  return people
}

export function matriculasForPeriod(data: CampaignData[], period: string) {
  return data.flatMap((item) => item.matriculados).filter((row) => academicPeriod(profileField(row, 'periodo_letivo', 'PERIODO LETIVO')) === period)
}

export function registrationsForPeriod(data: CampaignData[], period: string) {
  return data.flatMap((source) => source.inscritos.filter((row) => {
    const received = academicPeriod(profileField(row, 'ano_semestre', 'ANO/SEMESTRE'))
    return (received || source.period) === period
  }))
}

export function previousPeriod(period: string) {
  const [year, semester] = period.split('.')
  return semester === '1' ? `${Number(year) - 1}.2` : `${year}.1`
}

export function shiftedDay(day: number, years: number) {
  const date = new Date(day * DAY)
  const year = date.getUTCFullYear() + years
  const month = date.getUTCMonth()
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(year, month, Math.min(date.getUTCDate(), last)) / DAY
}

export function personEvents(rows: GenericRow[], fields: string[]) {
  const people = new Map<string, number | null>()
  let invalidCpf = 0
  for (const row of rows) {
    const cpf = cpfKey(row)
    if (!cpf) { invalidCpf += 1; continue }
    const day = fields.map((field) => dateDay(profileField(row, field))).find((value) => value !== null) ?? null
    const existing = people.get(cpf)
    if (!people.has(cpf) || (day !== null && (existing === null || existing === undefined || day < existing))) people.set(cpf, day)
  }
  return { people, invalidCpf, missingDates: [...people.values()].filter((day) => day === null).length }
}

function blocked(observed: number, reason: string): ForecastScenario {
  return { observed, low: null, reference: null, high: null, reason }
}

function fromScenarios(observed: number, values: number[]): ForecastScenario {
  return {
    observed,
    low: Math.max(observed, Math.floor(Math.min(...values))),
    reference: Math.max(observed, Math.round(medianAge(values)!)),
    high: Math.max(observed, Math.ceil(Math.max(...values))),
    reason: '',
  }
}

export function buildCampaignForecast(data: CampaignData[], config: ForecastConfig) {
  const start = dateDay(config.start)
  const end = dateDay(config.end)
  const asOf = dateDay(config.asOf)
  const validCalendar = start !== null && end !== null && asOf !== null && end > start && asOf >= start && asOf <= end
  const calendarReason = !validCalendar ? 'Confira o calendário: o corte precisa estar entre o início e a data-alvo.' : ''
  const current = data.find((item) => item.period === config.currentPeriod)
  const currentMatriculas = matriculasForPeriod(data, config.currentPeriod)
  const currentPeople = activePeople(currentMatriculas)
  const invalidMatriculaCpf = currentMatriculas.filter((row) => ['ATIVO', 'CONTRATO ATIVO'].includes(normalizedText(profileField(row, 'contrato'))) && !cpfKey(row)).length
  const missingCurrentPeriod = (current?.matriculados ?? []).filter((row) => !academicPeriod(profileField(row, 'periodo_letivo', 'PERIODO LETIVO'))).length
  const currentCalouros = [...currentPeople.values()].filter((person) => person.type === 'calouro')
  const currentVets = [...currentPeople.values()].filter((person) => person.type === 'veterano')
  const unknownTypes = [...currentPeople.values()].filter((person) => person.type === null).length
  const allMatriculasError = data.some((item) => item.matriculadosError)
  const invalidHistoricalMatriculas = data.some((item) => item.matriculados.some((row) => !academicPeriod(profileField(row, 'periodo_letivo', 'PERIODO LETIVO')) || !cpfKey(row) || !profileField(row, 'contrato')))
  const references = data.filter((item) => config.references.includes(item.period) && item.period < config.currentPeriod && item.period.endsWith(config.currentPeriod.slice(-2)))

  function paceForecast(kind: 'inscritos' | 'calouros') {
    const fields = kind === 'inscritos' ? ['data_inscricao'] : matriculaDateFields(config)
    const currentRows = kind === 'inscritos' ? registrationsForPeriod(data, config.currentPeriod) : currentCalouros.flatMap((person) => person.rows)
    const events = personEvents(currentRows, fields)
    const observed = events.people.size
    const datedAtCut = [...events.people.values()].filter((day) => day !== null && start !== null && asOf !== null && day >= start && day <= asOf).length
    const beforeStart = [...events.people.values()].filter((day) => day !== null && start !== null && day < start).length
    const afterCut = [...events.people.values()].filter((day) => day !== null && asOf !== null && day > asOf).length
    const audit: Array<{ period: string; total: number; atCut: number; fraction: number | null; cutoff: number | null; missingDates: number; reason: string }> = []
    const values: number[] = []
    for (const historical of references) {
      const people = activePeople(matriculasForPeriod(data, historical.period))
      const rows = kind === 'inscritos' ? registrationsForPeriod(data, historical.period) : [...people.values()].filter((person) => person.type === 'calouro').flatMap((person) => person.rows)
      const historicalEvents = personEvents(rows, fields)
      const delta = Number(historical.period.slice(0, 4)) - Number(config.currentPeriod.slice(0, 4))
      const historicalStart = start === null ? null : shiftedDay(start, delta)
      const historicalEnd = end === null ? null : shiftedDay(end, delta)
      const cutoff = validCalendar ? shiftedDay(asOf!, delta) : null
      const dates = [...historicalEvents.people.values()].filter((day): day is number => day !== null && historicalStart !== null && historicalEnd !== null && day >= historicalStart && day <= historicalEnd)
      const atCut = cutoff === null ? 0 : dates.filter((day) => day <= cutoff).length
      const fraction = dates.length && atCut > 0 ? atCut / dates.length : null
      const typeProblem = kind === 'calouros' && [...people.values()].some((person) => person.type === null)
      const historicalRows = matriculasForPeriod(data, historical.period)
      const invalidPeriodRows = kind === 'calouros' && (historicalRows.some((row) => !cpfKey(row) || !profileField(row, 'contrato')) || historical.matriculados.some((row) => !academicPeriod(profileField(row, 'periodo_letivo', 'PERIODO LETIVO'))))
      const reason = (kind === 'inscritos' ? historical.inscritosError : historical.matriculadosError) ? 'Base indisponível'
        : invalidPeriodRows ? 'Há matrículas sem CPF, contrato ou período letivo válido'
        : typeProblem ? 'Tipo de aluno não identificado'
          : historicalEvents.invalidCpf ? 'CPF ausente ou inválido'
            : historicalEvents.missingDates ? `${historicalEvents.missingDates} ${historicalEvents.missingDates === 1 ? 'CPF' : 'CPFs'} sem ${kind === 'inscritos' ? 'data de inscrição' : config.matriculaDate === 'payment' ? 'baixa do pagamento' : 'data de matrícula'} válida`
              : fraction === null ? 'Sem base na janela ou até o corte' : ''
      audit.push({ period: historical.period, total: dates.length, atCut, fraction, cutoff, missingDates: historicalEvents.missingDates, reason })
      if (!reason && fraction !== null) values.push(datedAtCut / fraction)
    }
    const reason = calendarReason || ((kind === 'inscritos' ? current?.inscritosError : current?.matriculadosError) ? 'Base atual indisponível.' : '')
      || (kind === 'calouros' && unknownTypes ? 'Há alunos sem classificação única entre calouro e veterano.' : '')
      || (kind === 'calouros' && (invalidMatriculaCpf || missingCurrentPeriod) ? 'Há matrículas atuais sem CPF ou período letivo válido.' : '')
      || (events.invalidCpf ? 'Há registros atuais sem CPF válido.' : '')
      || (events.missingDates ? `${events.missingDates} CPF sem data válida na base atual.` : '')
      || (!datedAtCut ? 'Ainda não há registros datados na janela atual.' : '')
    const usable = audit.filter((item) => !item.reason && item.fraction !== null).sort((a, b) => a.period.localeCompare(b.period))
    const last = usable.at(-1)
    const backtest = usable.length >= 3 && last && last.total > 0 ? {
      period: last.period,
      predicted: Math.round(medianAge(usable.slice(0, -1).map((item) => last.atCut / item.fraction!))!),
      actual: last.total,
    } : null
    const scenario: ForecastScenario = reason ? blocked(observed, reason) : values.length >= 2
      ? { ...fromScenarios(datedAtCut, values), observed, method: 'historical' }
      : { observed, low: null, high: null, reference: Math.round(datedAtCut + datedAtCut / (asOf! - start! + 1) * (end! - asOf!)), reason: '', method: 'linear',
        note: `Cenário linear pelo ritmo atual. ${values.length} de ${references.length} PS históricos utilizáveis; a comparação histórica exige 2. Confira os motivos na comparação abaixo.` }
    return { scenario, audit, missingDates: events.missingDates, backtest, window: { atCut: datedAtCut, beforeStart, afterCut } }
  }

  const inscritos = paceForecast('inscritos')
  const calouros = paceForecast('calouros')
  const previous = previousPeriod(config.currentPeriod)
  const previousPeople = activePeople(matriculasForPeriod(data, previous))
  const renewalIndex = indexRenewalRows(data.map((item) => ({ period: item.period, rows: item.matriculados })))
  const eligibleFor = (period: string) => new Set(compareRenewal(renewalIndex, period).records.filter((record) => record.status !== 'provavel_concluinte').map((record) => record.cpf))
  const eligible = eligibleFor(previous)
  const observedRenewals = currentVets.filter((person) => eligible.has(person.cpf)).length
  const observedOthers = currentVets.length - observedRenewals
  const vetAudit: Array<{ period: string; origin: string; eligible: number; renewals: number; others: number; rate: number | null; reason: string }> = []
  const vetValues: number[] = []
  for (const historical of references) {
    const priorPeriod = previousPeriod(historical.period)
    const prior = activePeople(matriculasForPeriod(data, priorPeriod))
    const priorEligible = eligibleFor(priorPeriod)
    const target = activePeople(matriculasForPeriod(data, historical.period))
    const vets = [...target.values()].filter((person) => person.type === 'veterano')
    const renewed = vets.filter((person) => priorEligible.has(person.cpf)).length
    const others = vets.length - renewed
    const rate = priorEligible.size ? renewed / priorEligible.size : null
    const reason = allMatriculasError ? 'Base indisponível' : !prior.size || !target.size ? 'Sem base para o par de períodos'
      : [...target.values()].some((person) => person.type === null) ? 'Tipo de aluno não identificado' : ''
    vetAudit.push({ period: historical.period, origin: priorPeriod, eligible: priorEligible.size, renewals: renewed, others, rate, reason })
    if (!reason && rate !== null) vetValues.push(Math.max(observedRenewals, eligible.size * rate) + Math.max(observedOthers, others))
  }
  const vetReason = calendarReason || (allMatriculasError ? 'Há bases de matrículas indisponíveis.' : '')
    || (invalidHistoricalMatriculas ? 'Há matrículas sem CPF, contrato ou período letivo válido no histórico.' : '')
    || (unknownTypes ? 'Há alunos sem classificação única entre calouro e veterano.' : '')
    || (invalidMatriculaCpf || missingCurrentPeriod ? 'Há matrículas atuais sem CPF ou período letivo válido.' : '')
    || (!previousPeople.size ? 'A base ativa do período anterior ainda não está disponível.' : '')
    || (vetValues.length < 2 ? 'São necessárias duas transições históricas comparáveis para veteranos.' : '')
  const veteranos = vetReason ? blocked(currentVets.length, vetReason) : fromScenarios(currentVets.length, vetValues)
  const total: ForecastScenario = {
    observed: currentPeople.size,
    low: calouros.scenario.low === null || veteranos.low === null ? null : calouros.scenario.low + veteranos.low,
    reference: calouros.scenario.reference === null || veteranos.reference === null ? null : calouros.scenario.reference + veteranos.reference,
    high: calouros.scenario.high === null || veteranos.high === null ? null : calouros.scenario.high + veteranos.high,
    reason: calouros.scenario.reason || veteranos.reason ? 'Aguardando projeções utilizáveis de calouros e veteranos.' : '',
    method: calouros.scenario.method === 'linear' && veteranos.reference !== null ? 'mixed' : 'historical',
    note: calouros.scenario.method === 'linear' && veteranos.reference !== null ? 'Combina o cenário linear de calouros com a projeção de veteranos por renovação histórica.' : undefined,
  }
  return { inscritos, calouros, veteranos, total, vetAudit, unknownTypes, activeCurrent: currentPeople.size, eligiblePrevious: eligible.size, observedRenewals, observedOthers }
}
