import { activeCalouroRows, activePeople, cpfKey, dateDay, personEvents, shiftedDay, type CampaignData } from '../../../src/lib/campaignData.ts'
import { courseOfferings20271, offeringCampus, offeringCourseKey, offeringCourseLabel } from '../../../src/lib/courseOfferings.ts'
import { normalizedText, profileField } from '../../../src/lib/studentProfile.ts'
import { crmReminders } from '../../../src/lib/crmWorkflow.ts'
import { crmStages } from '../../../src/lib/crmKanban.ts'
import type { CrmContact } from '../../../src/lib/crmKanban.ts'
import { calouroAdmissionSegment, initialEnrollmentGoals } from '../../../src/lib/enrollmentGoals.ts'

export { weeklyOwnerEmail } from './weeklyAccess.ts'
export interface WeeklyFact { key: string; label: string; value: number | null; unit: string; scope: string }
export interface WeeklyMember { id: string; nome: string; alias: string }
export interface WeeklyNote { reference: string; course: string; campus: string; channel: string; direction: string; text: string }
export interface WeeklySnapshot {
  version: 1; period: string; cutoff: string; captured_at: string; window_start: string
  facts: WeeklyFact[]; warnings: string[]; notes: WeeklyNote[]; notes_total: number; members: WeeklyMember[]
}
export interface WeeklySuggestion { title: string; hypothesis: string; audience: string; action: string; metric_key: string; evidence: string[]; priority: 'alta' | 'media' | 'baixa' }
export interface WeeklyDiagnosis { summary: string; findings: Array<{ title: string; detail: string; evidence: string[] }>; suggestions: WeeklySuggestion[]; limitations: string[] }
export interface WeeklyReport { id: string; cutoff: string; week_start: string; created_at: string; snapshot: WeeklySnapshot; analysis: WeeklyDiagnosis | null; model: string | null; generated_at: string | null; generation_started: string | null; last_error: string | null }
export interface WeeklyAction {
  id: string; report_id: string; suggestion_index: number | null; week_start: string; title: string; hypothesis: string; audience: string; plan: string
  owner_id: string | null; due_date: string; metric_key: string; baseline: number | null; target: number | null
  status: 'planejada' | 'andamento' | 'concluida' | 'nao_realizada' | 'cancelada'; execution: string; review: string; outcome: 'pendente' | 'melhorou' | 'igual' | 'piorou' | 'inconclusivo'; version: number; updated_at: string
}
export interface WeeklySource { campaigns: CampaignData[]; captured_at: string; contacts: CrmContact[]; activities: Array<{ contact_id: string; author_id: string; occurred_at: string; channel: string; direction: string; note: string }>; members: WeeklyMember[]; documents: { pending: number; completed: number; average_hours: number | null } | null; warnings: string[]; sync?: {at:string|null;missing_sources:string[]} | null }
const iso = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10)
const folded = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export function redactWeeklyText(value: string, names: string[] = []) {
  let text = folded(value).slice(0, 4000)
  for (const name of names.map(name=>folded(name).trim()).filter(name => name.length >= 2).sort((a,b) => b.length-a.length)) {
    text = text.replace(new RegExp('(?<![a-z0-9])'+name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+'(?![a-z0-9])', 'gi'), '[pessoa]')
  }
  return text.replace(/https?:\/\/\S+/gi, '[link]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b\d{2}[/.]\d{2}[/.]\d{4}\b/g, '[data pessoal]')
    .replace(/\+?\d[\d().\s-]{7,}\d/g, '[identificador]').trim().slice(0, 1200)
}
export function weeklyMonday(day: string) {
  const n = dateDay(day)
  if (n === null) throw new Error('Data inválida.')
  return iso(n - (new Date(n * 86400000).getUTCDay() + 6) % 7)
}
export function buildWeeklySnapshot(source: WeeklySource, cutoff: string): WeeklySnapshot {
  const cut = dateDay(cutoff)
  if (cut === null) throw new Error('Data de corte inválida.')
  const facts: WeeklyFact[] = [], warnings = [...source.warnings]
  const add = (key: string, label: string, value: number | null, scope: string, unit = 'pessoas') => facts.push({ key, label, value, scope, unit })
  const pairs = [...new Map(courseOfferings20271.map(offer => [`${offeringCourseKey(offer.curso)}|${offer.campus}`, offer])).values()]
  for (const period of ['2024.1', '2025.1', '2026.1', '2027.1']) {
    const campaign = source.campaigns.find(item => item.period === period)
    const limit = shiftedDay(cut, Number(period.slice(0, 4)) - 2027)
    const groups = [{ key: 'geral', label: 'Geral', matches: () => true }, ...pairs.map(offer => ({
      key: `${offeringCourseKey(offer.curso)}|${offer.campus}`, label: `${offeringCourseLabel(offer.curso)} / ${offer.campus}`,
      matches: (row: Record<string, unknown>) => offeringCourseKey(profileField(row, 'curso')) === offeringCourseKey(offer.curso) && offeringCampus(profileField(row, 'campus', 'filial')) === offer.campus,
    }))]
    for (const group of groups) for (const kind of ['inscritos', 'calouros'] as const) {
      const unavailable = !campaign || Boolean(kind === 'inscritos' ? campaign.inscritosError : campaign.matriculadosError)
      const base = kind === 'inscritos' ? campaign?.inscritos ?? [] : activeCalouroRows(campaign?.matriculados ?? [])
      const rows = base.filter(group.matches)
      const events = personEvents(rows, kind === 'inscritos' ? ['data_inscricao'] : ['data_de_matricula'])
      const dates = [...events.people.values()].filter((day): day is number => day !== null)
      const prefix = `academico/${period}/${group.key}/${kind}`
      add(`${prefix}/total`, `${kind === 'inscritos' ? 'Inscritos' : 'Calouros ativos'} até o corte`, unavailable ? null : dates.filter(day => day <= limit).length, `${period} · ${group.label}`)
      if (period === '2027.1' || group.key === 'geral') add(`${prefix}/7d`, `${kind === 'inscritos' ? 'Inscrições' : 'Matrículas de calouros'} em 7 dias`, unavailable ? null : dates.filter(day => day > limit - 7 && day <= limit).length, `${period} · ${group.label}`)
      if (period === '2027.1') {
        const last = dates.filter(day=>day<=limit).sort((a,b)=>a-b).at(-1)
        add(`${prefix}/dias_sem`, `Dias desde a última ${kind==='inscritos' ? 'inscrição' : 'matrícula'} datada`, unavailable || last===undefined ? null : limit-last, `${period} · ${group.label}`, 'dias corridos')
      }
      if (group.key === 'geral') {
        add(`${prefix}/7d_anterior`, `${kind === 'inscritos' ? 'Inscrições' : 'Matrículas'} nos 7 dias anteriores`, unavailable ? null : dates.filter(day => day > limit - 14 && day <= limit - 7).length, period)
        if (unavailable) warnings.push(`${period}: base de ${kind} indisponível.`)
        if (events.invalidCpf || events.missingDates) warnings.push(`${period} ${kind}: ${events.invalidCpf} linhas sem CPF válido e ${events.missingDates} CPFs sem data válida; contagens são parciais.`)
        if (period === '2027.1') {
          const medicine = rows.filter(row => offeringCourseKey(profileField(row, 'curso')) === 'MEDICINA')
          const medEvents = personEvents(medicine, kind === 'inscritos' ? ['data_inscricao'] : ['data_de_matricula'])
          add(`${prefix}/medicina`, `${kind === 'inscritos' ? 'Inscritos' : 'Calouros ativos'} de Medicina até o corte`, unavailable ? null : [...medEvents.people.values()].filter(day => day !== null && day <= limit).length, '2027.1 · Medicina')
        }
      }
    }
    if (campaign?.matriculados.some(row => !cpfKey(row) && /ATIVO/.test(normalizedText(profileField(row,'contrato'))))) warnings.push(`${period}: vínculos ativos sem CPF impedem uma leitura completa de matrículas.`)
    if (campaign && [...activePeople(campaign.matriculados).values()].some(person => person.type === null)) warnings.push(`${period}: classificação de calouro/veterano ausente ou conflitante; esses CPFs não entram como calouros.`)
    if (period === '2027.1') {
      const calouros = [...activePeople(campaign?.matriculados ?? []).values()].filter(person => person.type === 'calouro' && !person.rows.some(row => offeringCourseKey(profileField(row,'curso')) === 'MEDICINA'))
      for (const segment of ['regular','prouni'] as const) {
        const entries = calouros.filter(person => calouroAdmissionSegment(person.rows) === segment).flatMap(person => person.rows)
        const events = personEvents(entries,['data_de_matricula'])
        add(`academico/2027.1/${segment}/calouros_total`, 'Calouros ativos até o corte', !campaign || campaign.matriculadosError ? null : [...events.people.values()].filter(day=>day!==null && day<=cut).length, segment==='prouni' ? 'PROUNI · sem Medicina' : 'Não PROUNI · sem Medicina')
        add(`meta/2027.1/${segment}`, 'Meta inicial confirmada', initialEnrollmentGoals[segment], segment==='prouni' ? 'PROUNI · sem Medicina' : 'Não PROUNI · sem Medicina')
      }
      if (calouros.some(person=>calouroAdmissionSegment(person.rows)===null)) warnings.push('Há calouros com forma de ingresso ausente ou conflitante; não foram classificados entre PROUNI e não PROUNI.')
    }
  }
  const now = Date.parse(source.captured_at)
  const syncTime = Date.parse(source.sync?.at || '')
  add('carga/crm/horas_desde_sync','Tempo desde a última sincronização do CRM',Number.isFinite(syncTime) ? Math.max(0,(now-syncTime)/3600000) : null,'Cobertura da carga','horas')
  if (!Number.isFinite(syncTime) || now-syncTime>86400000) warnings.push('A sincronização do CRM está sem data informada ou tem mais de 24 horas. Confira a carga antes de atribuir uma queda ao desempenho comercial.')
  if (source.sync?.missing_sources?.length) warnings.push(`Sincronização com fontes ausentes: ${source.sync.missing_sources.join(', ')}.`)
  const contacts = source.contacts.filter(contact => !contact.test_only && contact.intake_visible !== false)
  const active = contacts.filter(contact => !contact.archived && !contact.loss_data && !contact.official_enrollment)
  const reminders = crmReminders(active, now)
  add('crm/contatos', 'Contatos visíveis no CRM', contacts.length, 'CRM · posição na captura')
  add('crm/inscritos_identificados', 'Contatos com inscrição identificada', contacts.filter(contact => contact.has_inscription).length, 'CRM · posição na captura')
  add('crm/matriculados_confirmados', 'Contatos com matrícula confirmada', contacts.filter(contact => contact.official_enrollment).length, 'CRM · posição na captura')
  add('crm/desistencias_ativas', 'Contatos com desistência registrada', contacts.filter(contact => contact.loss_data).length, 'CRM · posição na captura')
  add('crm/desistencias_relatadas', 'Motivos de desistência relatados pelo candidato', contacts.filter(contact => contact.loss_data?.evidence==='candidate_reported').length, 'CRM · posição na captura')
  add('crm/desistencias_percebidas', 'Motivos de desistência inferidos pelo atendente', contacts.filter(contact => contact.loss_data?.evidence==='staff_inferred').length, 'CRM · posição na captura')
  const losses = new Map<string,number>()
  for (const contact of contacts) if (contact.loss_data?.reason_label) {
    const label = redactWeeklyText(contact.loss_data.reason_label,contacts.map(item=>item.current_data.nome || '')).slice(0,150)
    losses.set(label,(losses.get(label)||0)+1)
  }
  for (const [label,count] of losses) add(`crm/desistencia/${normalizedText(label).replace(/[^A-Z0-9]+/g,'-')}`, 'Desistências registradas por motivo', count, label)
  add('crm/sem_responsavel', 'Contatos abertos sem responsável', active.filter(contact => !contact.owner_id).length, 'CRM · posição na captura')
  add('crm/sem_registro_3d', 'Contatos sem interação registrada há 3 dias', new Set(reminders.filter(item => item.kind === 'idle').map(item => item.contact.id)).size, 'CRM · posição na captura')
  add('crm/acoes_vencidas', 'Retornos e cadências vencidos', reminders.filter(item => ['manual','cadence'].includes(item.kind) && item.due < now).length, 'CRM · posição na captura', 'ações')
  for (const stage of [...new Set(contacts.map(contact => contact.stage))].sort()) add(`crm/fase/${stage}`, 'Contatos na fase sem encerramento por desistência', contacts.filter(contact => !contact.loss_data && !contact.archived && contact.stage === stage).length, `CRM · ${crmStages.find(item=>item.id===stage)?.label || stage}`)
  const ids = new Set(contacts.map(contact => contact.id))
  const activities = source.activities.filter(activity => ids.has(activity.contact_id) && Number.isFinite(Date.parse(activity.occurred_at)))
  const dayOf = (at: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(at))
  const lastWeek = activities.filter(activity => { const day = dateDay(dayOf(activity.occurred_at))!; return day > cut - 7 && day <= cut })
  add('crm/atendimentos_7d', 'Registros de interação em 7 dias', lastWeek.filter(activity => activity.direction !== 'note').length, 'CRM · semana de análise', 'registros')
  add('crm/whatsapp_7d', 'Interações registradas no WhatsApp', lastWeek.filter(activity => activity.channel === 'whatsapp' && activity.direction !== 'note').length, 'CRM · semana de análise', 'registros')
  add('crm/contatos_interacao_7d', 'Contatos com interação registrada em 7 dias', new Set(lastWeek.filter(activity => activity.direction !== 'note').map(activity => activity.contact_id)).size, 'CRM · semana de análise')
  add('crm/respostas_7d', 'Respostas de candidatos registradas', lastWeek.filter(activity => activity.direction === 'inbound').length, 'CRM · semana de análise', 'registros')
  add('crm/resumos_7d', 'Registros com resumo de pelo menos 40 caracteres', lastWeek.filter(activity => activity.note.trim().length >= 40).length, 'CRM · semana de análise', 'registros')
  for (const member of source.members) {
    const owned = active.filter(contact => contact.owner_id === member.id)
    add(`crm/equipe/${member.alias}/carteira`, 'Contatos abertos na carteira', owned.length, member.alias)
    add(`crm/equipe/${member.alias}/registros_7d`, 'Interações registradas em 7 dias', lastWeek.filter(activity => activity.author_id === member.id && activity.direction !== 'note').length, member.alias, 'registros')
  }
  add('documentos/pendentes', 'Documentações aguardando retorno', source.documents?.pending ?? null, 'CRM · posição na captura', 'envios')
  add('documentos/media_horas', 'Tempo médio dos retornos recebidos', source.documents?.average_hours ?? null, 'CRM · posição na captura', 'horas corridas')
  const names = [...contacts.map(contact => contact.current_data.nome || ''), ...source.members.map(member => member.nome)]
  const byId = new Map(contacts.map(contact => [contact.id, contact]))
  const candidates = lastWeek.filter(activity => activity.note.trim().length >= 10).sort((a,b) => b.occurred_at.localeCompare(a.occurred_at))
  const notes = candidates.slice(0, 80).map((activity, index) => {
    const data = byId.get(activity.contact_id)!.current_data
    const knownCourse = pairs.find(offer => offeringCourseKey(offer.curso) === offeringCourseKey(data.curso || ''))
    return { reference: `Resumo ${index+1}`, course: knownCourse ? offeringCourseLabel(knownCourse.curso) : 'Não classificado', campus: offeringCampus(data.campus || ''), channel: activity.channel, direction: activity.direction, text: redactWeeklyText(activity.note, names) }
  })
  warnings.push('Atendimentos são registros manuais do CRM, não a totalidade das conversas no WhatsApp. Ausência de registro não comprova ausência de atendimento.')
  warnings.push('A data do último evento acadêmico não comprova a atualização da carga; ausência recente pode ser queda real ou atraso de importação.')
  warnings.push('Fases, responsáveis e pendências do CRM refletem a captura atual; não reconstituem a posição em datas passadas. Atividades usam a data informada pelo vendedor.')
  warnings.push('Históricos acadêmicos refletem os contratos preservados na carga, não fotografias dos contratos na data histórica. Calouros usam data da matrícula e contrato ativo; Medicina está identificada separadamente, sem projeção de novas vagas.')
  warnings.push('Recortes de curso/campus seguem a oferta de 2027.1 nos quatro períodos. Contagens gerais são por CPF único; o mesmo CPF pode constar em mais de um grupo de curso/campus, que não devem ser somados como pessoas distintas.')
  if (candidates.length > 80) warnings.push(`Amostra dos 80 resumos mais recentes entre ${candidates.length}; os demais não foram incluídos nos textos.`)
  return { version: 1, period: '2027.1', cutoff, captured_at: source.captured_at, window_start: iso(cut-6), facts, warnings: [...new Set(warnings)], notes, notes_total: candidates.length, members: source.members }
}

export function weeklyAIInput(snapshot: WeeklySnapshot, actions: WeeklyAction[], includeNotes: boolean) {
  const input = {
    period: snapshot.period, cutoff: snapshot.cutoff, captured_at: snapshot.captured_at, window_start: snapshot.window_start,
    facts: snapshot.facts, warnings: snapshot.warnings,
    notes: includeNotes ? snapshot.notes.slice(0,40).map(note=>({...note,text:note.text.slice(0,600)})) : [], notes_total_available: snapshot.notes_total, notes_limit: 40,
    previous_actions: actions.slice(0, 30).map((action, index) => ({ reference: `Compromisso ${index+1}`, week: action.week_start, title: redactWeeklyText(action.title).slice(0,200), status: action.status, metric_key: action.metric_key, baseline: action.baseline, target: action.target,
      observed_now: snapshot.facts.find(fact => fact.key === action.metric_key)?.value ?? null,
      outcome: action.outcome, execution: includeNotes ? redactWeeklyText(action.execution).slice(0,600) : '', review: includeNotes ? redactWeeklyText(action.review).slice(0,600) : '' })),
  }
  if (JSON.stringify(input).length > 180000) throw new Error('Fotografia grande demais para uma única análise.')
  return input
}
const string = { type: 'string' }
const evidence = { type: 'array', items: string }
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const weeklyDiagnosisSchema = object({ summary: string, findings: { type: 'array', items: object({ title: string, detail: string, evidence }) },
  suggestions: { type: 'array', items: object({ title: string, hypothesis: string, audience: string, action: string, metric_key: string, evidence, priority: { type: 'string', enum: ['alta','media','baixa'] } }) }, limitations: { type: 'array', items: string } })
export function validateWeeklyDiagnosis(value: unknown, snapshot: WeeklySnapshot): WeeklyDiagnosis {
  if (!value || typeof value !== 'object') throw new Error('Diagnóstico inválido.')
  const report = value as WeeklyDiagnosis
  const keys = new Set(snapshot.facts.filter(fact => fact.value !== null).map(fact => fact.key))
  const validText = (value: unknown, limit: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
  const validEvidence = (values: unknown) => Array.isArray(values) && values.length > 0 && values.length <= 10 && values.every(key => typeof key === 'string' && keys.has(key))
  if (!validText(report.summary,4000) || !Array.isArray(report.findings) || report.findings.length > 8 || !Array.isArray(report.suggestions) || report.suggestions.length > 5 || !Array.isArray(report.limitations) || report.limitations.length > 12 || report.limitations.some(text => !validText(text,2000))) throw new Error('Estrutura do diagnóstico inválida.')
  for (const item of report.findings) if (!validText(item.title,200) || !validText(item.detail,3000) || !validEvidence(item.evidence)) throw new Error('Diagnóstico sem evidência verificável.')
  for (const item of report.suggestions) if (!validText(item.title,200) || !validText(item.hypothesis,2000) || !validText(item.audience,1000) || !validText(item.action,2000) || !keys.has(item.metric_key) || !validEvidence(item.evidence) || !['alta','media','baixa'].includes(item.priority)) throw new Error('Sugestão sem indicador ou evidência verificável.')
  return report
}
