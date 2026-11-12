import { academicPeriod } from './enrollmentRenewal.ts'
import { medianAge, normalizedText, profileField } from './studentProfile.ts'
import { activePeople, cpfKey, dateDay, isMedicine, matriculasForPeriod, matriculaDateFields, personEvents, registrationsForPeriod, shiftedDay, type CampaignData, type ForecastConfig, type ForecastScenario } from './campaignData.ts'

const median = (values: number[]) => values.length ? medianAge(values)! : null
const countBefore = (events: ReturnType<typeof personEvents>, limit: number) => [...events.people.values()].filter((day) => day !== null && day <= limit).length
const idsBefore = (events: ReturnType<typeof personEvents>, limit: number) => new Set([...events.people].filter(([, day]) => day !== null && day <= limit).map(([cpf]) => cpf))
const blocked = (observed: number, reason: string): ForecastScenario => ({ observed, reason, reference: null, low: null, high: null })
const summarize = (observed: number, values: number[], method: ForecastScenario['method'], note: string, floor: number): ForecastScenario => ({
  observed, reason: '', reference: Math.max(floor, Math.round(median(values)!)), low: Math.max(floor, Math.floor(Math.min(...values))), high: Math.max(floor, Math.ceil(Math.max(...values))), method, note, complete: true,
})

function snapshot(data: CampaignData[], period: string, config: ForecastConfig) {
  const source = data.find((item) => item.period === period), delta = Number(period.slice(0, 4)) - Number(config.currentPeriod.slice(0, 4))
  const start = shiftedDay(dateDay(config.start)!, delta), end = shiftedDay(dateDay(config.end)!, delta), cut = shiftedDay(dateDay(config.asOf)!, delta)
  const registrations = registrationsForPeriod(data, period), raw = matriculasForPeriod(data, period), people = activePeople(raw)
  const calouros = [...people.values()].filter((person) => person.type === 'calouro')
  const registrationMedicine = new Set(registrations.filter(isMedicine).map(cpfKey))
  const reg = personEvents(registrations, ['data_inscricao'])
  const regNormal = personEvents(registrations.filter((row) => !registrationMedicine.has(cpfKey(row))), ['data_inscricao'])
  const regMedicine = personEvents(registrations.filter((row) => registrationMedicine.has(cpfKey(row))), ['data_inscricao'])
  const normalPeople = calouros.filter((person) => !person.rows.some(isMedicine)), medicinePeople = calouros.filter((person) => person.rows.some(isMedicine))
  const cal = personEvents(calouros.flatMap((person) => person.rows), matriculaDateFields(config))
  const calNormal = personEvents(normalPeople.flatMap((person) => person.rows), matriculaDateFields(config))
  const calMedicine = personEvents(medicinePeople.flatMap((person) => person.rows), matriculaDateFields(config))
  const regReason = !source || source.inscritosError ? 'Base de inscritos indisponível' : reg.invalidCpf ? 'CPF inválido na inscrição' : reg.missingDates ? `${reg.missingDates} inscrições sem data válida` : ''
  const calReason = !source || source.matriculadosError ? 'Base de matrículas indisponível'
    : [...people.values()].some((person) => person.type === null) ? 'Tipo de aluno conflitante'
      : raw.some((row) => ['ATIVO', 'CONTRATO ATIVO'].includes(normalizedText(profileField(row, 'contrato'))) && !cpfKey(row)) || source.matriculados.some((row) => !academicPeriod(profileField(row, 'periodo_letivo'))) ? 'CPF ou período letivo inválido'
        : cal.missingDates ? `${cal.missingDates} ${cal.missingDates === 1 ? 'CPF' : 'CPFs'} sem ${config.matriculaDate === 'payment' ? 'baixa do pagamento' : 'data de matrícula'} válida` : ''
  const cohort = (registrants: typeof reg, enrollments: typeof cal) => {
    const registered = idsBefore(registrants, end), enrolled = idsBefore(enrollments, end)
    const matched = [...enrolled].filter((cpf) => registered.has(cpf)).length
    return { registered: registered.size, matched, unmatched: enrolled.size - matched, rate: registered.size ? matched / registered.size : null }
  }
  return { period, start, end, cut, reg, regNormal, regMedicine, cal, calNormal, calMedicine, regReason, calReason,
    normalCohort: cohort(regNormal, calNormal), medicineCohort: cohort(regMedicine, calMedicine),
    hasMedicine: registrations.some(isMedicine) || raw.some(isMedicine),
    full: { inscritos: reg.people.size, calouros: calouros.length, veteranos: [...people.values()].filter((person) => person.type === 'veterano').length, medicina: medicinePeople.length },
  }
}

type Retrospective = { period: string; predicted: number; actual: number }
function captureCore(data: CampaignData[], config: ForecastConfig) {
  const start = dateDay(config.start), end = dateDay(config.end), cut = dateDay(config.asOf)
  const validCalendar = start !== null && end !== null && cut !== null && end > start && cut >= start && cut <= end && end - start <= 730
  const safeConfig = validCalendar ? config : { ...config, start: '2000-01-01', end: '2000-01-02', asOf: '2000-01-01' }
  const current = snapshot(data, config.currentPeriod, safeConfig)
  const history = [...new Set(config.references)].filter((period) => period < config.currentPeriod && period.endsWith(config.currentPeriod.slice(-2))).sort().map((period) => snapshot(data, period, safeConfig))
  const calendarReason = validCalendar ? '' : 'Confira o calendário da campanha.'
  const known = countBefore(current.reg, current.cut), normalKnown = countBefore(current.regNormal, current.cut), medicineKnown = countBefore(current.regMedicine, current.cut)
  const calKnown = countBefore(current.cal, current.cut), normalCalKnown = countBefore(current.calNormal, current.cut), medicineCalKnown = countBefore(current.calMedicine, current.cut)
  const elapsed = current.cut - current.start + 1, remaining = current.end - current.cut
  const window = (events: typeof current.reg) => ({
    atCut: [...events.people.values()].filter((day) => day !== null && day >= current.start && day <= current.cut).length,
    beforeStart: [...events.people.values()].filter((day) => day !== null && day < current.start).length,
    afterCut: [...events.people.values()].filter((day) => day !== null && day > current.cut).length,
  })
  const regWindow = window(current.reg), calWindow = window(current.cal), normalWindow = window(current.calNormal)
  const regHistory = history.filter((item) => !item.regReason && countBefore(item.reg, item.end) > 0)
  const conversionHistory = regHistory.filter((item) => !item.calReason && item.normalCohort.rate !== null)
  const future = (events: typeof current.reg, item: typeof current) => countBefore(events, item.end) - countBefore(events, item.cut)
  const projectedNormal = regHistory.length >= 2 ? normalKnown + median(regHistory.map((item) => future(item.regNormal, item)))! : normalKnown + window(current.regNormal).atCut / elapsed * remaining
  const projectedMedicine = regHistory.length >= 2 ? medicineKnown + median(regHistory.map((item) => future(item.regMedicine, item)))! : medicineKnown + window(current.regMedicine).atCut / elapsed * remaining
  const regValues = regHistory.map((item) => known + future(item.reg, item))
  const regReason = calendarReason || current.regReason || (!current.reg.people.size ? 'Sem demanda atual no recorte.' : '')
  let inscritos: ForecastScenario = regReason ? blocked(current.reg.people.size, regReason) : regHistory.length >= 2
    ? summarize(current.reg.people.size, [...regValues, projectedNormal + projectedMedicine], 'historical', 'CPFs já inscritos até o corte + saldo de inscrições observado após o mesmo corte nos PS anteriores, sem multiplicar o avanço inicial.', known)
    : { observed: current.reg.people.size, reason: '', reference: Math.round(known + regWindow.atCut / elapsed * remaining), low: null, high: null, method: 'linear', complete: true, note: 'Cenário linear de demanda; histórico de inscrições insuficiente para estimar o saldo restante.' }
  if (inscritos.reference !== null && regHistory.length >= 2) inscritos = { ...inscritos, reference: Math.round(projectedNormal + projectedMedicine) }
  const registeredNow = idsBefore(current.regNormal, current.cut), normalEnrolledNow = idsBefore(current.calNormal, current.cut)
  const unmatchedNow = [...normalEnrolledNow].filter((cpf) => !registeredNow.has(cpf)).length
  const registeredMedicineNow = idsBefore(current.regMedicine, current.cut)
  const unmatchedMedicineNow = [...idsBefore(current.calMedicine, current.cut)].filter((cpf) => !registeredMedicineNow.has(cpf)).length
  const medicineInScope = current.hasMedicine || history.some((item) => item.hasMedicine)
  const capacity = Number.isInteger(config.medicineCapacity) && config.medicineCapacity! >= 0 ? config.medicineCapacity! : null
  const medicineRates = regHistory.filter((item) => !item.calReason && item.medicineCohort.rate !== null).map((item) => item.medicineCohort.rate!)
  const medicineComplete = !medicineInScope || capacity !== null && capacity >= medicineCalKnown && medicineRates.length >= 2 && !regReason
  const medicineForecast = medicineComplete && capacity !== null ? Math.max(medicineCalKnown, Math.min(capacity, Math.round(projectedMedicine * median(medicineRates)!))) : medicineCalKnown
  const medicineNote = medicineInScope && !medicineComplete ? `Medicina: apenas ${medicineCalKnown} matrículas já confirmadas; sem projeção de novas vagas enquanto a capacidade não estiver confirmada.` : ''
  const conversion = median(conversionHistory.map((item) => item.normalCohort.rate!))
  const historicalUnmatched = conversionHistory.reduce((sum, item) => sum + item.normalCohort.unmatched, 0)
  const reconciliationNote = historicalUnmatched ? `${historicalUnmatched} vínculos históricos não foram encontrados na coorte de inscritos; o cenário não presume novas entradas sem esse cruzamento.` : ''
  const hasDemand = current.reg.people.size > 0 || current.cal.people.size > 0
  const calReason = calendarReason || current.calReason || (!hasDemand ? 'Sem demanda atual no recorte.' : '')
  const linearCal = normalCalKnown + normalWindow.atCut / elapsed * remaining + medicineCalKnown
  const supportsConversion = !regReason && conversionHistory.length >= 2 && conversion !== null
  const cohortReference = supportsConversion ? Math.max(normalCalKnown, unmatchedNow + Math.round(projectedNormal * conversion)) + medicineForecast : null
  const calValues = supportsConversion ? conversionHistory.map((item) => Math.max(normalCalKnown, unmatchedNow + Math.round((normalKnown + future(item.regNormal, item)) * item.normalCohort.rate!)) + medicineForecast) : []
  let calouros: ForecastScenario = calReason ? blocked(current.cal.people.size, calReason) : cohortReference !== null
    ? { ...summarize(current.cal.people.size, [...calValues, cohortReference], 'cohort', `Demais cursos: demanda prevista de ${Math.round(projectedNormal)} inscritos × conversão histórica de ${Math.round(conversion! * 1000) / 10}% por CPF. ${unmatchedNow} calouros atuais fora dessa coorte são preservados. ${medicineNote} ${reconciliationNote}${unmatchedMedicineNow ? ` ${unmatchedMedicineNow} matrículas de Medicina fora da coorte de inscritos precisam de conferência.` : ''}`, calKnown), reference: cohortReference, complete: medicineComplete && !historicalUnmatched && !unmatchedNow && !unmatchedMedicineNow }
    : { observed: current.cal.people.size, reference: Math.round(linearCal), low: null, high: null, reason: '', method: 'linear', complete: medicineComplete && !unmatchedNow && !unmatchedMedicineNow, note: `Cenário linear somente dos demais cursos; ${conversionHistory.length} PS com conversão utilizável. ${medicineNote}` }
  if (calReason) calouros = { ...calouros, complete: false }
  const auditFor = (metric: 'inscritos' | 'calouros') => history.map((item) => {
    const events = metric === 'inscritos' ? item.reg : item.cal
    const total = countBefore(events, item.end), atCut = countBefore(events, item.cut)
    return { period: item.period, total, atCut, fraction: total ? atCut / total : null, cutoff: item.cut, missingDates: events.missingDates,
      reason: metric === 'inscritos' ? item.regReason : item.calReason || item.regReason || (item.normalCohort.rate === null ? 'Sem inscritos para calcular conversão' : ''),
      conversion: metric === 'calouros' ? item.normalCohort.rate : null, matched: item.normalCohort.matched, unmatched: item.normalCohort.unmatched }
  })
  return {
    inscritos: { scenario: inscritos, audit: auditFor('inscritos'), window: regWindow, missingDates: current.reg.missingDates, backtest: null as Retrospective | null, linearReference: regReason ? null : Math.round(known + regWindow.atCut / elapsed * remaining), linearRate: regWindow.atCut / elapsed },
    calouros: { scenario: calouros, audit: auditFor('calouros'), window: calWindow, missingDates: current.cal.missingDates, backtest: null as Retrospective | null, linearReference: calReason ? null : Math.round(linearCal), linearRate: normalWindow.atCut / elapsed },
    medicine: { inScope: medicineInScope, observed: medicineCalKnown, capacity, reference: medicineForecast, complete: medicineComplete },
    conversion, projectedNormalRegistrations: projectedNormal, unmatchedCurrent: unmatchedNow,
    historicalTotals: history.map((item) => ({ period: item.period, ...item.full, reason: item.calReason || item.regReason })),
  }
}

export function buildCaptureForecast(data: CampaignData[], config: ForecastConfig, withBacktest = true) {
  const output = captureCore(data, config)
  const periods = [...new Set(config.references)].filter((period) => period < config.currentPeriod && period.endsWith(config.currentPeriod.slice(-2))).sort()
  const start = dateDay(config.start), end = dateDay(config.end), cut = dateDay(config.asOf)
  if (withBacktest && periods.length >= 3 && start !== null && end !== null && cut !== null && cut >= start && cut <= end) {
    const period = periods.at(-1)!, delta = Number(period.slice(0, 4)) - Number(config.currentPeriod.slice(0, 4))
    const label = (day: number) => new Date(shiftedDay(day, delta) * 86400000).toISOString().slice(0, 10)
    const shifted = { ...config, currentPeriod: period, references: periods.slice(0, -1), start: label(start), end: label(end), asOf: label(cut), medicineCapacity: undefined }
    const earlier = captureCore(data, shifted), actual = snapshot(data, period, config)
    if (earlier.inscritos.scenario.method === 'historical' && earlier.inscritos.scenario.reference !== null) output.inscritos.backtest = { period, predicted: earlier.inscritos.scenario.reference, actual: countBefore(actual.reg, actual.end) }
    if (earlier.calouros.scenario.method === 'cohort' && earlier.calouros.scenario.complete && earlier.calouros.scenario.reference !== null) output.calouros.backtest = { period, predicted: earlier.calouros.scenario.reference, actual: countBefore(actual.cal, actual.end) }
  }
  return output
}
