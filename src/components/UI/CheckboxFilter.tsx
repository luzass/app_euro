import { useEffect, useId, useRef, useState } from 'react'
import { CheckCheck, ChevronDown, Eraser, Search } from 'lucide-react'
import { toggleFilterOption, type FilterSelection } from '../../lib/profileFilters'

interface CheckboxFilterProps {
  label: string
  options: Array<{ value: string; label: string }>
  selected: FilterSelection
  onChange: (selection: FilterSelection) => void
}

export function CheckboxFilter({ label, options, selected, onChange }: CheckboxFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [above, setAbove] = useState(false)
  const [listHeight, setListHeight] = useState(288)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const selectedOptions = options.filter((option) => selected === null || selected.includes(option.value))
  const summary = selected === null ? 'Todos'
    : selectedOptions.length === 0 ? 'Nenhum selecionado'
      : selectedOptions.length === 1 ? selectedOptions[0].label
        : `${selectedOptions.length} de ${options.length} selecionados`
  const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  const visible = options.filter((option) => normalized(option.label).includes(normalized(search)))

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div ref={container} className="relative min-w-0" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
    }}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-controls={id}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
        onClick={() => {
          if (!open) {
            setSearch('')
            const rect = trigger.current?.getBoundingClientRect()
            if (rect) {
              const below = window.innerHeight - rect.bottom - 12
              const aboveSpace = rect.top - 28
              const headerHeight = options.length > 6 ? 110 : 66
              const flip = below < Math.min(288, options.length * 36) + headerHeight && aboveSpace > below
              setAbove(flip)
              setListHeight(Math.max(80, Math.min(288, window.innerHeight * 0.45, (flip ? aboveSpace : below) - headerHeight)))
            }
          }
          setOpen((current) => !current)
        }}>
        <span className="truncate" title={summary}>{summary}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div id={id} role="group" aria-label={`Opções de ${label}`}
          className={`absolute left-0 z-40 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg ${above ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
          <div className="mb-2 flex flex-wrap gap-1 border-b border-slate-100 pb-2">
            <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"><CheckCheck aria-hidden="true" size={14} />Selecionar todos</button>
            <button type="button" onClick={() => onChange([])} className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"><Eraser aria-hidden="true" size={14} />Limpar seleção</button>
          </div>
          {options.length > 6 && <div className="mb-2 flex items-center gap-2 rounded border border-slate-200 px-2">
            <Search aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
            <input type="search" aria-label={`Buscar em ${label}`} value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
          </div>}
          <div style={{ maxHeight: listHeight }} className="overflow-y-auto overscroll-contain">
            {visible.map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-sm leading-5 text-slate-700 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600" checked={selected === null || selected.includes(option.value)}
                onChange={() => onChange(toggleFilterOption(selected, option.value, options.map((item) => item.value)))} />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>)}
            {!visible.length && <p className="p-2 text-sm text-slate-500">Nenhuma opção encontrada.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
