import { LoaderCircle } from 'lucide-react'

interface LoadingProps {
  message?: string
  fullScreen?: boolean
}

export function Loading({
  message = 'Carregando dados...',
  fullScreen = false,
}: LoadingProps) {
  return (
    <div
      className={
        fullScreen
          ? 'flex min-h-screen items-center justify-center bg-slate-50 px-6'
          : 'flex min-h-[240px] items-center justify-center px-6'
      }
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
        <LoaderCircle className="h-8 w-8 animate-spin text-sky-600" />
        <div>
          <p className="text-sm font-semibold text-slate-900">{message}</p>
          <p className="text-sm text-slate-500">Isso costuma levar só alguns instantes.</p>
        </div>
      </div>
    </div>
  )
}
