import { useState } from 'react'
import { Save } from 'lucide-react'
import type { CrmData, CrmMember } from '../../lib/crmKanban'

export const crmInput =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-500'
export const crmButton =
  'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const fields = [
  ['nome', 'Nome completo', 'text'],
  ['telefone', 'Telefone', 'tel'],
  ['curso', 'Curso', 'text'],
  ['campus', 'Campus', 'text'],
  ['turno', 'Turno', 'text'],
  ['forma_ingresso', 'Forma de ingresso', 'text'],
  ['email', 'E-mail', 'email'],
  ['data_de_nascimento', 'Data de nascimento', 'text'],
  ['bairro', 'Bairro', 'text'],
  ['cidade', 'Cidade', 'text'],
  ['estado', 'Estado', 'text'],
] as const

export function CrmContactForm({
  initial = {},
  cpf,
  members,
  manager,
  owner,
  busy,
  onSave,
  onCancel,
}: {
  initial?: CrmData
  cpf?: string
  members: CrmMember[]
  manager: boolean
  owner?: string | null
  busy: boolean
  onSave: (data: CrmData, cpf: string, owner: string | null) => Promise<void>
  onCancel: () => void
}) {
  const [data, setData] = useState<CrmData>(() =>
    Object.fromEntries([
      ...fields.map(([key]) => [key, initial[key] ?? '']),
      ['observacao', initial.observacao ?? ''],
    ]),
  )
  const [document, setDocument] = useState(cpf ?? '')
  const [selectedOwner, setOwner] = useState(owner ?? '')
  const [error, setError] = useState('')
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        const digits = document.replace(/\D/g, '')
        if (!/^[\d.\-\s]+$/.test(document) || !/^\d{11}$/.test(digits) || /^0+$/.test(digits)) {
          setError('Informe um CPF válido com 11 dígitos.')
          return
        }
        const changes = cpf
          ? Object.fromEntries(
              Object.entries(data).filter(([key, value]) => (value ?? '') !== (initial[key] ?? '')),
            )
          : data
        try {
          await onSave(changes, digits, selectedOwner || null)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
        }
      }}
    >
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        <span>CPF</span>
        <input
          required
          aria-label="CPF"
          className={crmInput}
          value={document}
          inputMode="numeric"
          disabled={Boolean(cpf) || busy}
          onChange={(event) => setDocument(event.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <label key={key} className="block space-y-1 text-xs font-medium text-slate-600">
            <span>{label}</span>
            <input
              className={crmInput}
              aria-label={label}
              type={type}
              required={key === 'nome'}
              maxLength={key === 'nome' ? 200 : 500}
              value={data[key] ?? ''}
              disabled={busy}
              onChange={(event) =>
                setData((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
      {manager && (
        <label className="block space-y-1 text-xs font-medium text-slate-600">
          <span>Responsável</span>
          <select
            className={crmInput}
            aria-label="Responsável no cadastro"
            value={selectedOwner}
            disabled={busy}
            onChange={(event) => setOwner(event.target.value)}
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
        </label>
      )}
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        <span>Observação</span>
        <textarea
          className={crmInput}
          rows={3}
          maxLength={10000}
          value={data.observacao ?? ''}
          disabled={busy}
          onChange={(event) =>
            setData((current) => ({ ...current, observacao: event.target.value }))
          }
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button className={crmButton} type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          className={crmButton + ' !border-slate-950 !bg-slate-950 !text-white'}
          disabled={busy}
          type="submit"
        >
          <Save size={16} />
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
