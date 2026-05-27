import { Menu } from 'lucide-react'

interface HeaderProps {
  title: string
  onOpenSidebar: () => void
}

export function Header({ title, onOpenSidebar }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur">
      <div className="flex min-h-18 items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
            Painel interno
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">{title}</h1>
        </div>
      </div>
    </header>
  )
}
