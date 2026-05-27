import { cn } from '../../lib/utils'

interface KpiCardProps {
  title: string
  value: string
  helperText: string
  emphasis?: 'primary' | 'neutral'
}

export function KpiCard({
  title,
  value,
  helperText,
  emphasis = 'neutral',
}: KpiCardProps) {
  return (
    <article
      className={cn(
        'rounded-3xl border bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5',
        emphasis === 'primary'
          ? 'border-sky-200 bg-gradient-to-br from-white via-white to-sky-50'
          : 'border-slate-200',
      )}
    >
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helperText}</p>
    </article>
  )
}
