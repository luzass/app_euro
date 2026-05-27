import { ArrowLeft, House } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function NotFound() {
  const location = useLocation()
  const isAppRoute = location.pathname.startsWith('/app')

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-white">
          <House className="h-8 w-8" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
          Erro 404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Página não encontrada
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-500">
          O endereço que você tentou abrir não existe ou ainda não foi configurado.
        </p>

        <Link
          to={isAppRoute ? '/app' : '/login'}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>
    </div>
  )
}
