import { crmSearchKey, crmStages, type CrmContact, type CrmStage } from './crmKanban.ts'
import { dateDay } from './campaignForecast.ts'

const dayMs = 86400000
const key = (value: unknown) => crmSearchKey(value).replace(/[^a-z0-9]/g, '')
export const activityDirections = {
  outbound: 'Contato da equipe',
  inbound: 'Resposta do candidato',
  note: 'Anotação interna',
  unknown: 'Atendimento anterior',
} as const
export function crmAcademicProgress(contact: CrmContact, now: number) {
  if (contact.official_enrollment) return { category: 'Matriculado', label: 'Matrícula confirmada' }
  if (!contact.has_inscription) return { category: 'Lead', label: 'Ainda sem inscrição na base' }
  const d = contact.current_data
  const paid = Boolean(d.matricula_data_baixa) || key(d.boleto_matricula) === 'baixado'
  const issued = Boolean(d.matricula_idlan || d.matricula_codcontrato)
  const approved = key(d.etapa_atual).startsWith('aprovad')
  const examDay = dateDay(d.data_prova ?? '')
  const enem = key(d.forma_ingresso).includes('enem')
  return {
    category: 'Inscrito',
    label: paid
      ? 'Pagamento registrado · conferir matrícula'
      : issued && key(d.boleto_matricula) === 'emaberto'
        ? 'Boleto emitido · aguardando pagamento'
        : approved
          ? 'Apto · aguardando matrícula'
          : enem
            ? 'ENEM · conferir análise documental'
            : examDay !== null && examDay <= Math.floor(now / dayMs)
              ? 'Prova registrada · conferir resultado'
              : 'Inscrito · prova ou análise pendente',
  }
}
type PhaseContact = Pick<CrmContact, 'stage' | 'stage_entered_at' | 'checklist'>
export function crmCadenceKey(contact: PhaseContact, code: string) {
  return `cadence:${contact.stage}:${Date.parse(contact.stage_entered_at)}:${code}`
}
export const crmPauseKey = (contact: PhaseContact) =>
  `cadence-paused:${contact.stage}:${Date.parse(contact.stage_entered_at)}`
export function crmScriptCode(stage: CrmStage, index: number) {
  return (
    {
      primeiro_contato: 'C',
      abordagem: 'A',
      negociacao: 'N',
      fechamento: 'F',
      inscrito: 'I',
      vestibular: 'P',
      aguardando_matricula: 'V',
      matriculado: 'M',
    }[stage] +
    (index + 1)
  )
}
export function crmCadence(contact: PhaseContact) {
  const stage = crmStages.find((item) => item.id === contact.stage)!
  const anchor = Date.parse(contact.stage_entered_at)
  return stage.scripts.map((script, index) => {
    const code = crmScriptCode(stage.id, index)
    return {
      ...script,
      code,
      due: anchor + script.day * dayMs,
      done: Boolean(contact.checklist[crmCadenceKey(contact, code)]),
      paused: Boolean(contact.checklist[crmPauseKey(contact)]),
    }
  })
}
export type CrmReminderBase = Pick<
  CrmContact,
  | 'id'
  | 'stage'
  | 'stage_entered_at'
  | 'archived'
  | 'official_enrollment'
  | 'checklist'
  | 'next_action_at'
  | 'last_interaction_at'
  | 'last_outreach_at'
  | 'last_response_at'
  | 'created_at'
  | 'current_data'
> & { loss_data?: unknown }
export interface CrmReminder<T = CrmContact> {
  id: string
  contact: T
  kind: 'cadence' | 'manual' | 'idle' | 'response'
  due: number
  label: string
  code?: string
}
export function crmReminders<T extends CrmReminderBase>(
  contacts: T[],
  now: number,
): CrmReminder<T>[] {
  return contacts
    .flatMap((contact): CrmReminder<T>[] => {
      if (
        contact.archived ||
        contact.loss_data ||
        contact.stage === 'matriculado' ||
        contact.official_enrollment
      )
        return []
      const result: CrmReminder<T>[] = []
      const manual = contact.next_action_at ? Date.parse(contact.next_action_at) : NaN
      if (Number.isFinite(manual))
        result.push({
          id: contact.id + ':manual',
          contact,
          kind: 'manual',
          due: manual,
          label: 'Retorno agendado',
        })
      else {
        const next = crmCadence(contact).find((task) => !task.done && !task.paused)
        if (next)
          result.push({
            id: contact.id + ':' + next.code,
            contact,
            kind: 'cadence',
            due: next.due,
            label: `${next.code} · D+${next.day}`,
            code: next.code,
          })
      }
      const interaction = Date.parse(contact.last_interaction_at || contact.created_at)
      const idleDays = Math.floor((now - interaction) / dayMs)
      if (idleDays >= 3 && !(manual > now))
        result.push({
          id: contact.id + ':idle',
          contact,
          kind: 'idle',
          due: interaction + 3 * dayMs,
          label: contact.last_interaction_at
            ? `${idleDays} dias sem interação`
            : `${idleDays} dias sem primeiro atendimento`,
        })
      const outreach = Date.parse(contact.last_outreach_at || '')
      const response = Date.parse(contact.last_response_at || '')
      const responseDays = Math.floor((now - outreach) / dayMs)
      if (
        responseDays >= 3 &&
        (!Number.isFinite(response) || response < outreach) &&
        !(manual > now)
      )
        result.push({
          id: contact.id + ':response',
          contact,
          kind: 'response',
          due: outreach + 3 * dayMs,
          label: `${responseDays} dias sem resposta`,
        })
      return result
    })
    .sort((a, b) => a.due - b.due || a.contact.id.localeCompare(b.contact.id))
}
export function crmNegotiationScripts(contact: CrmContact) {
  const d = contact.current_data
  const scripts = [{ code: 'N4', text: 'É a sua primeira graduação?' }]
  if (d.primeira_graduacao === 'Sim') {
    scripts.push({ code: 'N5', text: 'Você pretende ingressar pelo ENEM ou pelo vestibular?' })
    if (d.via_ingresso_opcao === 'ENEM')
      scripts.push({
        code: 'N6',
        text: 'Me envie, por gentileza, seu boletim do ENEM para conferirmos os critérios vigentes.',
      })
    if (d.via_ingresso_opcao === 'Vestibular')
      scripts.push({
        code: 'N7',
        text: 'Vamos conferir seus dados para inscrição e encaminhar o link oficial e as orientações da prova online.',
      })
  }
  if (d.primeira_graduacao === 'Não') {
    scripts.push({
      code: 'F3',
      text: 'Você está cursando uma graduação ou já concluiu e busca uma segunda graduação?',
    })
    if (d.situacao_graduacao === 'Cursando')
      scripts.push({
        code: 'F4',
        text: 'Para análise de transferência externa, precisamos conferir a declaração de vínculo, o histórico acadêmico e as ementas da instituição de origem.',
      })
    if (d.situacao_graduacao === 'Concluída')
      scripts.push({
        code: 'F5',
        text: 'Para análise de segunda graduação, precisamos conferir seu diploma, histórico acadêmico e ementas da instituição de origem.',
      })
  }
  return scripts
}
