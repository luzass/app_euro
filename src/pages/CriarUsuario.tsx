import { useState, type FormEvent } from 'react'
import { ShieldAlert, UserRoundPlus } from 'lucide-react'
import { normalizeSupabaseError, supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

type MessageTone = 'success' | 'error'

const initialFormState = {
  nome: '',
  email: '',
  senha: '',
  role: 'captacao' as Role,
}

export function CriarUsuario() {
  const [formData, setFormData] = useState(initialFormState)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<MessageTone>('success')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase) {
      setMessageTone('error')
      setMessage('O Supabase ainda nao esta configurado neste ambiente.')
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          nome: formData.nome.trim(),
          email: formData.email.trim(),
          senha: formData.senha,
          role: formData.role,
        },
      })

      if (error) {
        throw error
      }

      if (!data?.success) {
        throw new Error(data?.error ?? 'A Edge Function nao confirmou a criacao do usuario.')
      }

      setFormData(initialFormState)
      setMessageTone('success')
      setMessage(`Usuario criado com sucesso para ${data.user?.email ?? 'o novo acesso'}.`)
    } catch (error) {
      setMessageTone('error')
      setMessage(normalizeSupabaseError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              Administracao
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Criar novo usuario
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              O cadastro e feito por uma Edge Function protegida no Supabase. Assim,
              a tela continua simples para o admin e a criacao real fica segura no
              backend.
            </p>
          </div>

          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-white">
            <UserRoundPlus className="h-8 w-8" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          {message ? (
            <div
              className={[
                'mb-6 rounded-3xl px-4 py-4 text-sm',
                messageTone === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-rose-200 bg-rose-50 text-rose-800',
              ].join(' ')}
            >
              {message}
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Nome</span>
              <input
                type="text"
                value={formData.nome}
                onChange={(event) =>
                  setFormData((currentValue) => ({
                    ...currentValue,
                    nome: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Nome completo"
                required
                disabled={submitting}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">E-mail</span>
              <input
                type="email"
                value={formData.email}
                onChange={(event) =>
                  setFormData((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="usuario@empresa.com"
                required
                disabled={submitting}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Senha</span>
              <input
                type="password"
                value={formData.senha}
                onChange={(event) =>
                  setFormData((currentValue) => ({
                    ...currentValue,
                    senha: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Defina uma senha segura"
                required
                minLength={8}
                disabled={submitting}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Role</span>
              <select
                value={formData.role}
                onChange={(event) =>
                  setFormData((currentValue) => ({
                    ...currentValue,
                    role: event.target.value as Role,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                disabled={submitting}
              >
                <option value="admin">admin</option>
                <option value="reitoria">reitoria</option>
                <option value="spike">spike</option>
                <option value="captacao">captacao</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserRoundPlus className="h-4 w-4" />
              {submitting ? 'Criando usuario...' : 'Criar usuario'}
            </button>
          </form>
        </section>

        <aside className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-amber-950">Fluxo seguro</h3>
          <p className="mt-3 text-sm leading-7 text-amber-900/80">
            O frontend envia os dados do novo acesso, a Edge Function valida se o
            usuario atual e admin, cria o login no Auth e registra o perfil na
            tabela profiles.
          </p>
        </aside>
      </div>
    </div>
  )
}
