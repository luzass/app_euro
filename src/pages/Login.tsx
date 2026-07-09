import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured, normalizeSupabaseError } from '../lib/supabase'

export function Login() {
  const navigate = useNavigate()
  const { user, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signIn(email, password)
      navigate('/app', { replace: true })
    } catch (signInError) {
      console.error('Login error:', signInError)
      setError(normalizeSupabaseError(signInError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#004181] [font-family:Inter,ui-rounded,system-ui,sans-serif]">
      <div className="grid min-h-screen grid-rows-[minmax(200px,30vh)_1fr] lg:grid-cols-[1.1fr_0.9fr] lg:grid-rows-1">
        <section className="relative overflow-hidden bg-[linear-gradient(160deg,#03294f_0%,#003a73_48%,#004181_100%)] text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.12),transparent_26%),radial-gradient(circle_at_82%_24%,rgba(255,255,255,0.07),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%)]" />
          <div className="absolute inset-y-0 right-0 hidden w-[6px] bg-[#BA9008] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] lg:block" />

          <div className="relative flex h-full items-center justify-center px-5 py-6 text-center sm:px-8 sm:py-8 lg:px-14 lg:py-14 xl:px-20">
            <div className="w-full max-w-2xl">
              <img
                src="/branding/logo.webp"
                alt="UniEuro"
                className="mx-auto h-auto w-full max-w-[170px] object-contain sm:max-w-[220px] lg:max-w-[380px] xl:max-w-[440px]"
              />

              <p className="mx-auto mt-8 hidden max-w-xl text-balance text-lg font-medium leading-8 text-white/90 sm:text-xl sm:leading-9 lg:block">
                Plataforma de acompanhamento do Tráfego Pago e do Processo Seletivo
              </p>
            </div>
          </div>
        </section>

        <section className="flex bg-[linear-gradient(180deg,#fbfdff_0%,#f3f7fb_100%)]">
          <div className="flex w-full items-center justify-center px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
            <div className="w-full max-w-md">
              <div className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:rounded-[32px] sm:px-8 sm:py-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#004181]/70">
                    Acesso seguro
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Entrar na plataforma
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-500 lg:hidden">
                    Plataforma de acompanhamento do Tráfego Pago e do Processo Seletivo
                  </p>
                </div>

                {!isSupabaseConfigured ? (
                  <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    Configure o arquivo <code>.env</code> com a URL e a chave anônima do Supabase.
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">E-mail</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#004181] focus:bg-white focus:ring-4 focus:ring-sky-100"
                      autoComplete="email"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Senha</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#004181] focus:bg-white focus:ring-4 focus:ring-sky-100"
                      autoComplete="current-password"
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={submitting || loading || !isSupabaseConfigured}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#004181] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(0,65,129,0.24)] transition hover:bg-[#00366b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
