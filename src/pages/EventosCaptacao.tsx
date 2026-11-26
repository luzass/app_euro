import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, LoaderCircle, RefreshCw, Upload, X } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { Loading } from '../components/UI/Loading'
import { EmptyState } from '../components/UI/EmptyState'
import { crmButton, crmInput } from '../components/CRM/CrmContactForm'
import { periodTables } from '../lib/dashboardHelpers'
import { canAccessEvents, eventColumns, eventFileKey, eventMatchLabels, eventTextKey, parseEventRows, type EventLeadPage, type EventSummary, type EventsDashboard } from '../lib/eventos'
import { importEventRows, loadEventLeads, loadEventsDashboard } from '../lib/eventosApi'

const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('pt-BR').format(value)
const stamp = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
const periods = periodTables.filter(period => period.period <= '2027.1')
const boolLabel = (value: boolean | null) => value === null ? 'Base indisponível' : value ? 'Sim' : 'Não localizado'

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (imported: number, ignored: number) => void }) {
  const [file, setFile] = useState<File | null>(null), [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [matrix, setMatrix] = useState<unknown[][]>([]), [fallback, setFallback] = useState('')
  const [error, setError] = useState(''), [reading, setReading] = useState(false), [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const dialog = useRef<HTMLElement>(null)
  const busyRef = useRef(false), readContext = useRef({ live: true })
  useEffect(() => { busyRef.current = busy }, [busy])
  const prepared = useMemo(() => {
    if (!matrix.length) return null
    try { return { data: parseEventRows(matrix, fallback), error: '' } }
    catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Arquivo inválido.' } }
  }, [matrix, fallback])
  useEffect(() => {
    const context = { live: true }
    readContext.current = context
    const previous = document.activeElement as HTMLElement | null, old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onClose()
      if (event.key !== 'Tab') return
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ?? [])].filter(element => element.offsetParent !== null)
      if (!focusable.length) { event.preventDefault(); dialog.current?.focus(); return }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { context.live=false; document.body.style.overflow = old; window.removeEventListener('keydown', key); previous?.focus() }
  }, [onClose])
  const read = async (selected: File | null) => {
    const context = readContext.current
    setError(''); setFile(null); setMatrix([]); setBytes(null); setProgress(0)
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.xlsx')) { setError('Selecione um arquivo Excel no formato .xlsx.'); return }
    if (selected.size > 5 * 1024 * 1024) { setError('O arquivo deve ter no máximo 5 MB.'); return }
    setReading(true)
    try {
      const buffer = await selected.arrayBuffer()
      const { readSheet } = await import('read-excel-file/browser')
      const values = await readSheet(buffer, 1)
      if (!context.live) return
      setFile(selected); setBytes(buffer); setMatrix(values)
    } catch { if (context.live) setError('Não foi possível ler o arquivo Excel. Confira se ele está íntegro.') }
    finally { if (context.live) setReading(false) }
  }
  const save = async () => {
    if (!file || !bytes || !prepared?.data?.rows.length || busy) return
    setBusy(true); setError(''); setProgress(0)
    try {
      const data = prepared.data, key = await eventFileKey(bytes, data.effectiveFallback)
      const result = await importEventRows(key, file.name, data.effectiveFallback, data.rows, setProgress)
      onImported(result.imported, result.ignored)
    } catch (e) { setError((e instanceof Error ? e.message : 'Falha na importação.') + ' As linhas já gravadas foram preservadas.') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="event-import-title" className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
      <header className="mb-5 flex items-center justify-between gap-3"><h2 id="event-import-title" className="text-lg font-semibold">Importar leads de eventos</h2><button className={crmButton} title="Fechar importação" aria-label="Fechar importação" disabled={busy} onClick={onClose}><X size={17} /></button></header>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 space-y-1 text-xs text-slate-600"><span>Planilha (.xlsx)</span><input aria-label="Planilha de leads de eventos" className={crmInput} type="file" accept=".xlsx" disabled={busy || reading} onChange={event => void read(event.target.files?.[0] ?? null)} /></label>
        <label className="space-y-1 text-xs text-slate-600"><span>Evento padrão (opcional)</span><input aria-label="Evento padrão" className={crmInput} maxLength={2000} value={fallback} disabled={busy} onChange={event => setFallback(event.target.value)} /></label>
      </div>
      {reading && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle size={16} className="animate-spin" />Lendo a planilha…</p>}
      {(error || prepared?.error) && <p role="alert" className="mt-4 break-words border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error || prepared?.error}</p>}
      {prepared?.data && <>
        <div role="status" className="my-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600"><span>{prepared.data.rows.length} leads</span><span>{prepared.data.blanks} linhas vazias ignoradas</span><span>{prepared.data.withoutIdentity} sem telefone/e-mail válido para cruzamento</span></div>
        <div className="overflow-x-auto border-y border-slate-200"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">Linha</th>{eventColumns.map(([field,label]) => <th key={field} className="p-2">{label}</th>)}</tr></thead><tbody>{prepared.data.rows.slice(0,10).map(row => <tr key={row.linha} className="border-t border-slate-100"><td className="p-2">{row.linha}</td>{eventColumns.map(([field]) => <td key={field} className="max-w-48 break-words p-2">{row[field] || '—'}</td>)}</tr>)}</tbody></table></div>
      </>}
      {busy && <p role="status" className="mt-4 text-sm text-slate-600">Importando {progress} de {prepared?.data?.rows.length} linhas…</p>}
      <footer className="mt-5 flex justify-end gap-2"><button className={crmButton} disabled={busy} onClick={onClose}>Cancelar</button><button className={crmButton + ' !border-sky-700 !bg-sky-700 !text-white'} disabled={busy || reading || !prepared?.data?.rows.length} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}Confirmar importação</button></footer>
    </section>
  </div>
}

function EventDetails({ event, period, onClose }: { event: EventSummary; period: string; onClose: () => void }) {
  const [status, setStatus] = useState(''), [page, setPage] = useState(0), [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ loading: boolean; error: string; data: EventLeadPage | null }>({ loading: true, error: '', data: null })
  useEffect(() => {
    let live = true
    void loadEventLeads(period,event.chave,status,page).then(data => { if (live) setState({ loading: false, error: '', data }) }).catch(e => { if (live) setState({ loading: false, error: e.message, data: null }) })
    return () => { live = false }
  }, [period,event.chave,status,page,attempt])
  const reload = () => { setState(current => ({ ...current,loading:true,error:'' })); setAttempt(current => current+1) }
  return <section aria-label="Leads do evento" className="min-w-0 space-y-4 border-t border-slate-200 pt-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-words text-lg font-semibold">{event.nome}</h2><button className={crmButton} title="Fechar detalhes do evento" aria-label="Fechar detalhes do evento" onClick={onClose}><X size={16} /></button></header>
    <label className="block max-w-sm space-y-1 text-xs text-slate-600"><span>Situação do cruzamento</span><select aria-label="Situação do cruzamento" className={crmInput} value={status} onChange={e => { setStatus(e.target.value); setPage(0); setState(current => ({...current,loading:true})) }}><option value="">Todos os leads</option><option value="inscrito">Inscritos encontrados</option><option value="matriculado">Matriculados encontrados</option>{Object.entries(eventMatchLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {state.loading ? <Loading message="Carregando leads do evento…" /> : state.error ? <p role="alert" className="text-sm text-red-700">{state.error} <button className={crmButton} onClick={reload}>Tentar novamente</button></p> : <>
      <div className="overflow-x-auto border-y border-slate-200"><table className="w-full min-w-[1350px] text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{['Nome','Telefone','E-mail','Curso','Escolaridade','Responsável','Telefone do responsável','Cruzamento','Inscrito','Matriculado','Cursos encontrados'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{state.data?.linhas.map(lead => <tr key={lead.id} className="border-t border-slate-100 align-top"><td className="max-w-48 break-words p-3 font-medium">{lead.nome || 'Não informado'}<span className="mt-1 block text-[11px] font-normal text-slate-500">{lead.arquivo_nome} · linha {lead.linha_origem}</span></td>{[lead.telefone,lead.email,lead.curso,lead.escolaridade,lead.nome_responsavel,lead.telefone_responsavel].map((value,index) => <td key={index} className="max-w-48 break-words p-3">{value || '—'}</td>)}<td className={'max-w-52 p-3 ' + (['ambiguo','conflito'].includes(lead.situacao) ? 'text-amber-800' : 'text-slate-600')}>{eventMatchLabels[lead.situacao]}{lead.criterio && <span className="mt-1 block text-slate-500">{lead.criterio === 'email_telefone' ? 'E-mail e telefone' : lead.criterio === 'email' ? 'E-mail' : 'Telefone'}</span>}</td><td className="p-3">{boolLabel(lead.inscrito)}</td><td className="p-3">{boolLabel(lead.matriculado)}</td><td className="max-w-64 break-words p-3">{[...new Set([...(lead.cursos_inscricao || []),...(lead.cursos_matricula || [])])].join(', ') || '—'}</td></tr>)}</tbody></table></div>
      {!state.data?.total && <p className="py-5 text-sm text-slate-500">Nenhum lead neste recorte.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600"><span>{state.data?.total ?? 0} leads</span><div className="flex items-center gap-3"><button className={crmButton} title="Página anterior" aria-label="Página anterior de leads" disabled={page===0} onClick={() => { setPage(page-1); setState(current => ({...current,loading:true})) }}><ChevronLeft size={16} /></button><span>Página {page+1} de {Math.max(1,Math.ceil((state.data?.total ?? 0)/50))}</span><button className={crmButton} title="Próxima página" aria-label="Próxima página de leads" disabled={(page+1)*50 >= (state.data?.total ?? 0)} onClick={() => { setPage(page+1); setState(current => ({...current,loading:true})) }}><ChevronRight size={16} /></button></div></div>
    </>}
  </section>
}

export function EventosCaptacaoView() {
  const [period, setPeriod] = useState('2027.1'), [search, setSearch] = useState('')
  const [data, setData] = useState<EventsDashboard | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [importing, setImporting] = useState(false), [selected, setSelected] = useState<string | null>(null), [notice, setNotice] = useState('')
  const request = useRef(0)
  const load = useCallback(async (force = false) => {
    const current = ++request.current
    setLoading(true); setError('')
    try { const value = await loadEventsDashboard(period,force); if (current===request.current) setData(value) }
    catch (e) { if (current===request.current) setError(e instanceof Error ? e.message : 'Não foi possível carregar os eventos.') }
    finally { if (current===request.current) setLoading(false) }
  }, [period])
  useEffect(() => {
    let live = true
    const current = ++request.current
    void loadEventsDashboard(period).then(value => {
      if (live && current===request.current) { setData(value); setError(''); setLoading(false) }
    }).catch(e => {
      if (live && current===request.current) { setError(e.message); setLoading(false) }
    })
    return () => { live = false }
  }, [period])
  const closeImport = useCallback(() => setImporting(false), [])
  const closeDetails = useCallback(() => setSelected(null), [])
  const events = data?.eventos.filter(event => eventTextKey(event.nome).includes(eventTextKey(search))) ?? []
  const selectedEvent = data?.eventos.find(event => event.chave===selected)
  return <div className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-950">Eventos de captação</h1>{data && <p className="mt-1 text-xs text-slate-500">{data.eventos.length} eventos · {number(data.eventos.reduce((total,event) => total+event.leads,0))} leads · cruzamento em {stamp(data.atualizado_em)}</p>}</div><div className="flex flex-wrap gap-2"><a className={crmButton} href="/templates/modelo-leads-eventos.xlsx" download><Download size={16} />Modelo Excel</a><button className={crmButton} onClick={() => setImporting(true)}><Upload size={16} />Importar leads</button><button className={crmButton} title="Atualizar cruzamentos" aria-label="Atualizar cruzamentos" disabled={loading} onClick={() => { setSelected(null); setLoading(true); setError(''); void load(true) }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div></header>
    <div className="flex flex-wrap gap-3"><label className="w-44 space-y-1 text-xs text-slate-600"><span>Processo seletivo</span><select aria-label="Processo seletivo dos eventos" className={crmInput} value={period} disabled={loading} onChange={e => { setPeriod(e.target.value); setSelected(null); setData(null); setLoading(true); setError('') }}>{periods.map(item => <option key={item.period} value={item.period}>{item.label}</option>)}</select></label><label className="min-w-48 flex-1 space-y-1 text-xs text-slate-600 sm:max-w-md"><span>Evento</span><input aria-label="Buscar evento" className={crmInput} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
    {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="break-words border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <Loading message="Carregando eventos e cruzamentos…" /> : !error && <>
      {!!data?.fontes_ausentes.length && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Bases indisponíveis: {data.fontes_ausentes.join(', ')} em {period}. Os indicadores correspondentes estão sem resultado.</p>}
      <div aria-label="Resultados por evento" className="space-y-3">{events.map(event => <button key={event.chave} className={'grid w-full grid-cols-3 gap-3 rounded-md border bg-white p-4 text-left hover:border-sky-400 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] ' + (selected===event.chave ? 'border-sky-600' : 'border-slate-200')} aria-label={`Conferir leads de ${event.nome}`} onClick={() => setSelected(event.chave)}><div className="col-span-3 min-w-0 sm:col-span-1"><h2 className="break-words text-sm font-semibold text-slate-950">{event.nome}</h2><p className="mt-2 text-xs text-slate-500">{event.sem_identificador} sem identificador · {event.revisar} para revisar</p>{event.repeticoes_identificadas>0 && <p className="mt-1 text-xs text-slate-500">{event.repeticoes_identificadas} capturas com pessoa repetida</p>}</div>{[['Leads',event.leads],['Inscritos',event.inscritos],['Matriculados',event.matriculados]].map(([label,value]) => <div key={String(label)} className="min-w-0"><span className="block break-words text-xs text-slate-500">{label}</span><strong className="mt-1 block text-xl font-semibold text-slate-950">{number(value as number | null)}</strong></div>)}</button>)}</div>
      {!events.length && <p className="py-10 text-center text-sm text-slate-500">Nenhum evento encontrado.</p>}
      <p className="text-xs leading-5 text-slate-500">Leads são linhas captadas. Inscritos e matriculados contam CPF único por evento; matrículas consideram calouros com contrato ativo. As correspondências não comprovam atribuição ao evento.</p>
      {selectedEvent && <EventDetails key={`${period}:${selectedEvent.chave}:${data?.atualizado_em}`} event={selectedEvent} period={period} onClose={closeDetails} />}
    </>}
    {importing && <ImportDialog onClose={closeImport} onImported={(imported,ignored) => { setNotice(`${imported} leads importados. ${ignored} linhas já presentes ou vazias ignoradas.`); setImporting(false); setSelected(null); setLoading(true); setError(''); void load() }} />}
  </div>
}

export function EventosCaptacao() {
  const { profile, loading } = useProfile()
  if (loading) return <Loading message="Validando acesso…" />
  if (!canAccessEvents(profile)) return <EmptyState title="Acesso restrito" description="Esta área está disponível somente para Lucas Britto e Diego." />
  return <EventosCaptacaoView />
}
