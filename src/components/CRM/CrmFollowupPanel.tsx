import { CheckCheck, Copy } from 'lucide-react'
import type { CrmContact } from '../../lib/crmKanban'
import { crmCadence, crmNegotiationScripts, crmPauseKey } from '../../lib/crmWorkflow'
import { crmButton, crmInput } from './CrmContactForm'

export function CrmFollowupPanel({
  contact,
  now,
  editable,
  busy,
  onPatch,
  onRecord,
  onResume,
  notify,
}: {
  contact: CrmContact
  now: number
  editable: boolean
  busy: boolean
  onPatch: (changes: Record<string, unknown>) => Promise<void>
  onRecord: (code: string, text: string) => void
  onResume: () => void
  notify: (text: string, error?: boolean) => void
}) {
  const stamp = (time: number) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(time)
  const copy = (text: string) =>
    void navigator.clipboard
      .writeText(text)
      .then(() => notify('Mensagem copiada.'))
      .catch(() => notify('Não foi possível copiar.', true))
  const name = (contact.current_data.nome || '').split(' ')[0]
  return (
    <>
      {contact.stage === 'negociacao' && (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold">Qualificação · N4 a N7</h3>
          <label className="block space-y-1 text-xs text-slate-600">
            <span>Primeira graduação · N4</span>
            <select
              aria-label="Primeira graduação"
              className={crmInput}
              disabled={!editable || busy}
              value={contact.current_data.primeira_graduacao || ''}
              onChange={(e) =>
                void onPatch({
                  manual_data: {
                    primeira_graduacao: e.target.value,
                    via_ingresso_opcao: null,
                    situacao_graduacao: null,
                  },
                })
              }
            >
              <option value="">Não informado</option>
              <option>Sim</option>
              <option>Não</option>
            </select>
          </label>
          {contact.current_data.primeira_graduacao === 'Sim' && (
            <label className="block space-y-1 text-xs text-slate-600">
              <span>Via de ingresso · N5</span>
              <select
                aria-label="Via de ingresso na negociação"
                className={crmInput}
                disabled={!editable || busy}
                value={contact.current_data.via_ingresso_opcao || ''}
                onChange={(e) =>
                  void onPatch({ manual_data: { via_ingresso_opcao: e.target.value } })
                }
              >
                <option value="">Não informado</option>
                <option>ENEM</option>
                <option>Vestibular</option>
              </select>
            </label>
          )}
          {contact.current_data.primeira_graduacao === 'Não' && (
            <label className="block space-y-1 text-xs text-slate-600">
              <span>Situação da graduação · F3</span>
              <select
                aria-label="Situação da graduação"
                className={crmInput}
                disabled={!editable || busy}
                value={contact.current_data.situacao_graduacao || ''}
                onChange={(e) =>
                  void onPatch({ manual_data: { situacao_graduacao: e.target.value } })
                }
              >
                <option value="">Não informado</option>
                <option>Cursando</option>
                <option>Concluída</option>
              </select>
            </label>
          )}
          <div className="divide-y divide-slate-100">
            {crmNegotiationScripts(contact).map((script) => (
              <div key={script.code} className="flex items-start gap-3 py-3">
                <span className="pt-1 text-xs font-semibold">{script.code}</span>
                <p className="min-w-0 flex-1 text-sm leading-6 text-slate-600">{script.text}</p>
                <button
                  type="button"
                  className={crmButton + ' !p-2'}
                  title={'Copiar ' + script.code}
                  aria-label={'Copiar ' + script.code}
                  onClick={() => copy(script.text)}
                >
                  <Copy size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="border-t border-slate-200 pt-4">
        <h3 className="mb-3 text-sm font-semibold">Cadência de atendimento</h3>
        {contact.checklist[crmPauseKey(contact)] && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>Pausada após resposta do candidato</span>
            <button
              className={crmButton}
              type="button"
              disabled={!editable || busy}
              onClick={onResume}
            >
              Retomar cadência
            </button>
          </div>
        )}
        <div className="divide-y divide-slate-100">
          {crmCadence(contact).map((task) => {
            const text = task.text.replaceAll('{nome}', name)
            return (
              <div key={task.code} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">
                    {task.code} · D+{task.day}
                  </span>
                  <span
                    className={
                      task.done
                        ? 'text-emerald-700'
                        : task.paused
                          ? 'text-slate-500'
                          : task.due < now
                            ? 'font-semibold text-red-700'
                            : 'text-slate-500'
                    }
                  >
                    {task.done
                      ? 'Contato registrado'
                      : task.paused
                        ? 'Pausada após resposta'
                        : task.due < now
                          ? 'Atrasada'
                          : 'Agendada'}{' '}
                    · {stamp(task.due)}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-600">{text}</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={crmButton + ' !p-2'}
                    title={'Copiar mensagem ' + task.code}
                    aria-label={'Copiar mensagem ' + task.code}
                    onClick={() => copy(text)}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className={crmButton}
                    disabled={
                      !editable || busy || task.done || task.paused || contact.official_enrollment
                    }
                    onClick={() => onRecord(task.code, text)}
                  >
                    <CheckCheck size={15} />
                    Registrar contato {task.code}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {!crmCadence(contact).length && (
          <p className="text-sm text-slate-500">Sem cadência pendente nesta etapa.</p>
        )}
      </section>
    </>
  )
}
