import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useProfile } from '../hooks/useProfile'
import type { Profile } from '../lib/types'
import { isCrmManager } from '../lib/crmKanban'
import {
  biDefaultFrom,
  biDuration,
  biKey,
  biPercent,
  buildCrmManagement,
  originLabels,
  shiftBiDay,
  type BiFilters,
  type BiListRow,
  type BiSnapshot,
} from '../lib/crmManagement'
import { loadCrmManagement } from '../lib/crmManagementApi'
import type { CrmManagementCacheEntry } from '../lib/crmManagementCache'
import { crmButton, crmInput } from '../components/CRM/CrmContactForm'
import './GestaoCrm.css'

const tabs = ['Resumo', 'Funil', 'Equipe', 'Desistências'] as const
const number = (n: number) => new Intl.NumberFormat('pt-BR').format(n)
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
const dayLabel = (value: string) => value.slice(8, 10) + '/' + value.slice(5, 7)
function brazilToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="crm-bi-section">
      <h2>{title}</h2>
      {note && <p className="crm-bi-note">{note}</p>}
      {children}
    </section>
  )
}
function Metric({
  label,
  value,
  note,
  onClick,
  alert,
}: {
  label: string
  value: string | number
  note?: string
  onClick: () => void
  alert?: boolean
}) {
  return (
    <button
      type="button"
      className={'crm-bi-metric' + (alert ? ' crm-bi-alert' : '')}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{typeof value === 'number' ? number(value) : value}</strong>
      {note && <small>{note}</small>}
      <ArrowRight size={14} aria-hidden="true" />
    </button>
  )
}
function ContactList({
  title,
  rows,
  close,
}: {
  title: string
  rows: BiListRow[]
  close: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(0)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  const filtered = rows.filter((r) =>
    biKey([r.name, r.course, r.campus, r.owner, r.detail].join(' ')).includes(biKey(search)),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, pages - 1)
  return (
    <dialog
      ref={dialog}
      className="crm-bi-dialog"
      aria-labelledby="crm-bi-list-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <header>
        <div>
          <h2 id="crm-bi-list-title">{title}</h2>
          <p>{number(filtered.length)} registros</p>
        </div>
        <button
          className={crmButton}
          aria-label="Fechar lista"
          title="Fechar lista"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <label className="crm-bi-search">
        <Search size={16} />
        <input
          className={crmInput}
          autoFocus
          placeholder="Buscar candidato, curso ou responsável"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
      </label>
      <div className="crm-bi-list">
        {filtered.slice(current * 20, current * 20 + 20).map((r) => (
          <article key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <p>
                {r.course} · {r.campus}
              </p>
              <p>
                {r.owner}
                {r.at ? ' · ' + date(r.at) : ''}
              </p>
              {r.detail && <p>{r.detail}</p>}
            </div>
            <Link className={crmButton} to={'/app/crm?contato=' + encodeURIComponent(r.contactId)}>
              Abrir ficha <ArrowRight size={15} />
            </Link>
          </article>
        ))}
        {!filtered.length && (
          <p className="p-4 text-sm text-slate-500">Nenhum candidato neste recorte.</p>
        )}
      </div>
      <footer>
        <span>
          Página {current + 1} de {pages}
        </span>
        <button
          className={crmButton}
          title="Página anterior"
          aria-label="Página anterior"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className={crmButton}
          title="Próxima página"
          aria-label="Próxima página"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </footer>
    </dialog>
  )
}

export function CrmManagementView({ profile }: { profile: Profile }) {
  const [params, setParams] = useSearchParams()
  const today = brazilToday()
  const filters: BiFilters = {
    from: params.get('de') || biDefaultFrom(today),
    to: params.get('ate') || today,
    owner: params.get('responsavel') || '',
    course: params.get('curso') || '',
    campus: params.get('campus') || '',
    origin: params.get('origem') || '',
    admission: params.get('ingresso') || '',
    includeTests: params.get('testes') === '1',
    bucket: params.get('intervalo') === 'week' ? 'week' : 'day',
    tab: tabs.find((t) => t === params.get('aba')) || 'Resumo',
  }
  const { from, to, includeTests } = filters
  const [snapshot, setSnapshot] = useState<(CrmManagementCacheEntry & { scope: string }) | null>(
      null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0)
  const forceRefresh = useRef(false)
  const [list, setList] = useState<{ title: string; rows: BiListRow[] } | null>(null)
  const allowed = isCrmManager(profile)
  const scope = `${profile.id}:${profile.role}`
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to &&
    to <= today &&
    Number.isFinite(Date.parse(from)) &&
    Number.isFinite(Date.parse(to))
  useEffect(() => {
    if (!allowed || !valid) return
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setBusy(true)
        setError('')
        const force = forceRefresh.current
        forceRefresh.current = false
        return loadCrmManagement(scope, from, to, includeTests, force)
      })
      .then((data) => {
        if (!cancelled && data) setSnapshot({ ...data, scope })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Não foi possível carregar a gestão do CRM.')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [allowed, valid, scope, from, to, includeTests, refresh])
  const currentSnapshot = snapshot?.scope === scope ? snapshot : null
  const expiresAt =
    currentSnapshot &&
    currentSnapshot.data.from === from &&
    currentSnapshot.data.to === to &&
    currentSnapshot.data.include_tests === includeTests
      ? currentSnapshot.expiresAt
      : null
  useEffect(() => {
    if (!allowed || !valid) return
    const update = () => {
      if (document.visibilityState === 'visible' && expiresAt !== null && Date.now() >= expiresAt) {
        setRefresh((n) => n + 1)
      }
    }
    const timer =
      expiresAt === null
        ? undefined
        : window.setTimeout(update, Math.max(0, expiresAt - Date.now()))
    window.addEventListener('focus', update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
    }
  }, [allowed, valid, expiresAt])
  const data = currentSnapshot?.data
  const usable =
    data &&
    data.from === from &&
    data.to === to &&
    data.include_tests === includeTests &&
    valid &&
    !error
      ? data
      : null
  const model = usable ? buildCrmManagement(usable, filters) : null
  const change = (values: Record<string, string>) => {
    setList(null)
    setParams(
      (old) => {
        const next = new URLSearchParams(old)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }
  const open = (title: string, rows: BiListRow[]) => setList({ title, rows })
  const openContacts = (title: string, rows: BiSnapshot['contacts'], owner?: string | null) => {
    if (model)
      open(
        title,
        rows.map((c) => model.row(c, '', undefined, owner === undefined ? c.owner_id : owner)),
      )
  }
  if (!allowed) return <p role="alert">Visão restrita à supervisão e reitoria.</p>
  return (
    <div className="crm-bi">
      <header className="crm-bi-heading">
        <div>
          <h1>Gestão do CRM</h1>
          <p>Atendimento, evolução comercial e motivos de desistência</p>
        </div>
        <div>
          <Link to="/app/crm" className={crmButton}>
            Kanban <ArrowRight size={16} />
          </Link>
          <button
            className={crmButton}
            title="Atualizar indicadores"
            aria-label="Atualizar indicadores"
            disabled={busy}
            onClick={() => {
              forceRefresh.current = true
              setRefresh((n) => n + 1)
            }}
          >
            <RefreshCw size={17} className={busy ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>
      <div className="crm-bi-dates">
        <label>
          De
          <input
            type="date"
            className={crmInput}
            value={from}
            max={to}
            onChange={(e) => change({ de: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            className={crmInput}
            value={to}
            min={from}
            max={today}
            onChange={(e) => change({ ate: e.target.value })}
          />
        </label>
        <select
          aria-label="Período rápido"
          className={crmInput}
          value=""
          onChange={(e) => {
            if (e.target.value)
              change({
                de:
                  e.target.value === 'inicio'
                    ? '2026-11-13'
                    : shiftBiDay(today, -Number(e.target.value) + 1),
                ate: today,
              })
          }}
        >
          <option value="">Selecionar período</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="inicio">Desde 13/11/2026</option>
        </select>
        <label className="crm-bi-tests">
          <input
            type="checkbox"
            checked={includeTests}
            onChange={(e) => change({ testes: e.target.checked ? '1' : '' })}
          />
          Incluir contatos de teste
        </label>
      </div>
      {!valid && (
        <p role="alert" className="crm-bi-warning">
          Selecione um intervalo válido, sem datas futuras.
        </p>
      )}
      {error && (
        <p role="alert" className="crm-bi-warning">
          {error}
        </p>
      )}
      {busy && !usable && (
        <p role="status" className="py-6 text-sm">
          Carregando indicadores do CRM...
        </p>
      )}
      {model && usable && (
        <>
          <div className="crm-bi-filters">
            <label>
              Responsável
              <select
                aria-label="Responsável"
                className={crmInput}
                value={filters.owner}
                onChange={(e) => change({ responsavel: e.target.value })}
              >
                <option value="">Todos</option>
                {usable.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
                <option value="unassigned">Sem responsável</option>
              </select>
            </label>
            {[
              {
                label: 'Curso',
                key: 'curso',
                value: filters.course,
                options: model.options.courses,
              },
              {
                label: 'Campus',
                key: 'campus',
                value: filters.campus,
                options: model.options.campuses,
              },
              {
                label: 'Forma de ingresso',
                key: 'ingresso',
                value: filters.admission,
                options: model.options.admissions,
              },
            ].map((f) => (
              <label key={f.key}>
                {f.label}
                <select
                  aria-label={f.label}
                  className={crmInput}
                  value={f.value}
                  onChange={(e) => change({ [f.key]: e.target.value })}
                >
                  <option value="">Todos</option>
                  {f.options.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Origem de entrada
              <select
                aria-label="Origem de entrada"
                className={crmInput}
                value={filters.origin}
                onChange={(e) => change({ origem: e.target.value })}
              >
                <option value="">Todas</option>
                {model.options.origins.map((v) => (
                  <option key={v} value={v}>
                    {originLabels[v] || v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="crm-bi-status">
            <span>Estoque atual · {date(usable.generated_at)}</span>
            <span>
              Próxima atualização automática ·{' '}
              {date(expiresAt ? new Date(expiresAt).toISOString() : null)}
            </span>
            <span>Última sincronização de origem · {date(usable.sync?.at)}</span>
            {includeTests && <strong>Inclui testes</strong>}
          </div>
          {model.cohortUnknown.length > 0 ||
          model.quality.fallback.length > 0 ||
          usable.sync?.result?.conflicts ||
          usable.sync?.result?.missing_sources?.length ? (
            <p className="crm-bi-warning">
              Conferência: {number(model.quality.fallback.length)} contatos sem evento de entrada;{' '}
              {number(model.cohortUnknown.length)} entradas sem histórico acadêmico completo.{' '}
              {usable.sync?.result?.conflicts
                ? `${usable.sync.result.conflicts} conflitos na sincronização. `
                : ''}
              {usable.sync?.result?.missing_sources?.length
                ? 'Há fontes indisponíveis na última sincronização.'
                : ''}{' '}
              Casos sem histórico completo não compõem as taxas.
            </p>
          ) : null}
          <nav aria-label="Visões de gestão" className="crm-bi-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                aria-current={filters.tab === tab ? 'page' : undefined}
                onClick={() => change({ aba: tab })}
              >
                {tab}
              </button>
            ))}
          </nav>
          {filters.tab === 'Resumo' && (
            <>
              <Section
                title="Carteira atual"
                note="Pessoas únicas na carteira não arquivada. As datas selecionadas não reconstroem o estoque passado."
              >
                <div className="crm-bi-metrics">
                  <Metric
                    label="Leads"
                    value={model.stock.leads.length}
                    onClick={() => openContacts('Leads na carteira atual', model.stock.leads)}
                  />
                  <Metric
                    label="Inscritos"
                    value={model.stock.inscriptions.length}
                    onClick={() =>
                      openContacts('Inscritos na carteira atual', model.stock.inscriptions)
                    }
                  />
                  <Metric
                    label="Matrículas confirmadas"
                    value={model.stock.enrolled.length}
                    onClick={() =>
                      openContacts('Matrículas confirmadas na carteira atual', model.stock.enrolled)
                    }
                  />
                  <Metric
                    label="Sem responsável"
                    value={model.stock.active.filter((c) => !c.owner_id).length}
                    onClick={() =>
                      openContacts(
                        'Carteira sem responsável',
                        model.stock.active.filter((c) => !c.owner_id),
                      )
                    }
                  />
                </div>
              </Section>
              <Section title="Atenção hoje">
                <div className="crm-bi-metrics">
                  <Metric
                    label="Retornos e cadências vencidos"
                    value={new Set(model.late.map((r) => r.contact.id)).size}
                    alert
                    onClick={() =>
                      open(
                        'Pendências vencidas',
                        model.late.map((r) => ({
                          ...model.row(r.contact, r.label, new Date(r.due).toISOString()),
                          id: r.id,
                        })),
                      )
                    }
                  />
                  <Metric
                    label="Sem interação há 3 dias ou mais"
                    value={model.idle.length}
                    alert
                    onClick={() =>
                      open(
                        'Sem interação',
                        model.idle.map((r) => ({ ...model.row(r.contact, r.label), id: r.id })),
                      )
                    }
                  />
                  <Metric
                    label="Sem resposta há 3 dias ou mais"
                    value={model.noResponse.length}
                    note="Não significa desistência"
                    onClick={() =>
                      open(
                        'Aguardando resposta',
                        model.noResponse.map((r) => ({
                          ...model.row(r.contact, r.label),
                          id: r.id,
                        })),
                      )
                    }
                  />
                  <Metric
                    label="Aguardando matrícula"
                    value={
                      model.stock.active.filter((c) => c.stage === 'aguardando_matricula').length
                    }
                    onClick={() =>
                      openContacts(
                        'Aguardando matrícula',
                        model.stock.active.filter((c) => c.stage === 'aguardando_matricula'),
                      )
                    }
                  />
                </div>
              </Section>
              <Section
                title="Movimentação no período"
                note="Eventos observados no CRM, não as datas originais das planilhas. Matrículas são confirmações na base oficial, não resultado atribuído a um vendedor."
              >
                <div className="crm-bi-metrics">
                  <Metric
                    label="Entradas reais"
                    value={model.entries.length}
                    onClick={() =>
                      open(
                        'Entradas reais no período',
                        model.entries.map((c) =>
                          model.row(
                            c,
                            originLabels[c.origin] || c.origin,
                            c.entry_at,
                            model.firstOwner(c),
                          ),
                        ),
                      )
                    }
                  />
                  <Metric
                    label="Candidatos contatados"
                    value={model.outreachContacts.length}
                    note={`${number(model.outgoing.length)} contatos da equipe registrados`}
                    onClick={() =>
                      openContacts('Candidatos contatados no período', model.outreachContacts)
                    }
                  />
                  <Metric
                    label="Primeiro contato · mediana"
                    value={biDuration(model.firstContactMedian)}
                    note={`${model.firstContactSamples.length} primeiros contatos observados`}
                    onClick={() =>
                      open(
                        'Tempo até o primeiro contato',
                        model.firstContactSamples.map((s) =>
                          model.row(
                            s.contact,
                            biDuration(s.hours),
                            s.activity.at,
                            s.activity.author_id,
                          ),
                        ),
                      )
                    }
                  />
                  <Metric
                    label="Confirmações de matrícula"
                    value={model.enrollmentFlow.length}
                    onClick={() =>
                      open(
                        'Primeira confirmação observada no período',
                        model.enrollmentFlow.map((c) =>
                          model.row(
                            c,
                            'Confirmação observada, sujeita a cancelamentos posteriores',
                            c.first_enrollment_at,
                            model.ownerAt(
                              c,
                              Date.parse(c.first_enrollment_at!),
                              c.first_enrollment_event_id ?? Infinity,
                            ),
                          ),
                        ),
                      )
                    }
                  />
                </div>
                <div className="crm-bi-chart-heading">
                  <h3>Movimento observado</h3>
                  <select
                    className={crmInput}
                    aria-label="Intervalo do gráfico"
                    value={filters.bucket}
                    onChange={(e) => change({ intervalo: e.target.value })}
                  >
                    <option value="day">Dia</option>
                    <option value="week">Semana</option>
                  </select>
                </div>
                <div
                  className="crm-bi-chart"
                  role="img"
                  aria-label="Entradas, confirmações de matrícula e encerramentos por intervalo"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={model.trend}
                      margin={{ top: 10, right: 15, bottom: 5, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={dayLabel}
                        minTickGap={32}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis allowDecimals={false} width={35} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(v) => dayLabel(String(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="linear"
                        dataKey="entries"
                        name="Entradas reais"
                        stroke="#0284c7"
                        strokeWidth={2}
                        isAnimationActive={false}
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="linear"
                        dataKey="enrollments"
                        name="Confirmações observadas"
                        stroke="#059669"
                        strokeWidth={2}
                        isAnimationActive={false}
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="linear"
                        dataKey="closures"
                        name="Encerramentos"
                        stroke="#d97706"
                        strokeWidth={2}
                        isAnimationActive={false}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="crm-bi-note">
                  Atendimentos precisam ser registrados no CRM. Períodos anteriores ao início do
                  acompanhamento não têm cobertura completa.
                </p>
              </Section>
            </>
          )}
          {filters.tab === 'Funil' && (
            <>
              <Section
                title="Distribuição atual por etapa"
                note="Estoque, não taxa de conversão. A permanência considera os candidatos que ainda estão na etapa."
              >
                <div className="crm-bi-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th>Na carteira</th>
                        <th>Permanência mediana</th>
                        <th>Pendências vencidas</th>
                        <th>Movimentos para a etapa no período</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.funnel.map((stage) => (
                        <tr key={stage.id}>
                          <th>
                            <button
                              className="crm-bi-link"
                              onClick={() => openContacts(stage.label, stage.rows)}
                            >
                              {stage.label}
                            </button>
                            <div className="crm-bi-track">
                              <span
                                style={{
                                  width: `${(stage.count / Math.max(1, ...model.funnel.map((s) => s.count))) * 100}%`,
                                  background: stage.color,
                                }}
                              />
                            </div>
                          </th>
                          <td>{number(stage.count)}</td>
                          <td>{biDuration(stage.medianHours)}</td>
                          <td>{number(stage.late)}</td>
                          <td>{number(stage.movements)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section
                title="Conversão por entrada real"
                note="Entradas no período, acompanhadas até o corte selecionado. Inscrições diretas ficam separadas dos leads; matrículas já existentes na entrada não geram conversão."
              >
                <div className="crm-bi-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Grupo de entrada</th>
                        <th>Pessoas</th>
                        <th>Lead → inscrito</th>
                        <th>Matrícula ativa até o corte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.cohortGroups.map((group) => (
                        <tr key={group.id}>
                          <th>
                            <button
                              className="crm-bi-link"
                              onClick={() => openContacts(group.label, group.base)}
                            >
                              {group.label}
                            </button>
                          </th>
                          <td>{number(group.base.length)}</td>
                          <td>
                            {group.id === 'lead' ? (
                              <button
                                className="crm-bi-link"
                                onClick={() =>
                                  openContacts('Leads que se inscreveram', group.registered)
                                }
                              >
                                {group.registered.length} ·{' '}
                                {biPercent(group.registered.length, group.base.length)}
                              </button>
                            ) : (
                              'Já inscritos na entrada'
                            )}
                          </td>
                          <td>
                            <button
                              className="crm-bi-link"
                              onClick={() =>
                                openContacts('Conversões confirmadas até o corte', group.converted)
                              }
                            >
                              {group.converted.length} ·{' '}
                              {biPercent(group.converted.length, group.base.length)}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="crm-bi-note">
                  {model.baselineEnrolled.length} já matriculados na entrada e{' '}
                  {model.cohortUnknown.length} com histórico incompleto ficam fora das taxas. Filtro
                  de responsável: primeiro responsável registrado até o corte, preservado após
                  transferências.
                </p>
              </Section>
            </>
          )}
          {filters.tab === 'Equipe' && (
            <Section
              title="Atendimento por responsável"
              note="Carteira e pendências são atuais. Contatos e respostas usam o autor do registro; confirmações usam o responsável no momento observado. Não representam causalidade nem ranking de vendas."
            >
              <div className="crm-bi-table">
                <table>
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th>Carteira atual</th>
                      <th>Candidatos contatados</th>
                      <th>Contatos / respostas</th>
                      <th>Vencidos</th>
                      <th>Inscrições observadas</th>
                      <th>Matrículas observadas</th>
                      <th>Encerramentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.team.map((member) => (
                      <tr key={member.id}>
                        <th>{member.name}</th>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              openContacts('Carteira · ' + member.name, member.portfolio)
                            }
                          >
                            {member.portfolio.length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              openContacts('Contatados · ' + member.name, member.contacted)
                            }
                          >
                            {member.contacted.length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              open(
                                'Interações · ' + member.name,
                                [...member.sent, ...member.received].map((a) => ({
                                  ...model.row(
                                    model.contactById.get(a.contact_id)!,
                                    a.direction === 'outbound'
                                      ? 'Contato da equipe'
                                      : 'Resposta do candidato',
                                    a.at,
                                    a.author_id,
                                  ),
                                  id: a.id,
                                })),
                              )
                            }
                          >
                            {member.sent.length} / {member.received.length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              open(
                                'Vencidos · ' + member.name,
                                member.late.map((r) => ({
                                  ...model.row(r.contact, r.label),
                                  id: r.id,
                                })),
                              )
                            }
                          >
                            {member.late.length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              openContacts(
                                'Inscrições observadas · ' + member.name,
                                member.inscriptions,
                                member.id === 'unassigned' ? null : member.id,
                              )
                            }
                          >
                            {member.inscriptions.length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              openContacts(
                                'Matrículas observadas · ' + member.name,
                                member.enrollments,
                                member.id === 'unassigned' ? null : member.id,
                              )
                            }
                          >
                            {member.enrollments.length}
                          </button>
                        </td>
                        <td>
                          <button
                            className="crm-bi-link"
                            onClick={() =>
                              open(
                                'Encerramentos · ' + member.name,
                                member.losses.map(model.lossRow),
                              )
                            }
                          >
                            {member.losses.length}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="crm-bi-note">
                {model.quality.legacyActivities.length} registros antigos sem direção identificada
                não entram em contatos ou respostas. Anotações internas também não contam como
                atendimento.
              </p>
            </Section>
          )}
          {filters.tab === 'Desistências' && (
            <>
              <Section
                title="Encerramentos no período"
                note="Contamos episódios de encerramento. Uma pessoa pode encerrar e reabrir mais de uma vez. Sem resposta não é motivo de desistência."
              >
                <div className="crm-bi-metrics">
                  <Metric
                    label="Encerramentos"
                    value={model.losses.length}
                    onClick={() =>
                      open('Encerramentos no período', model.losses.map(model.lossRow))
                    }
                  />
                  <Metric
                    label="Pessoas distintas"
                    value={new Set(model.losses.map((e) => e.contact_id)).size}
                    onClick={() =>
                      open('Pessoas com encerramento', [
                        ...new Map(
                          model.losses.map((e) => [e.contact_id, model.lossRow(e)]),
                        ).values(),
                      ])
                    }
                  />
                  <Metric
                    label="Informado pelo candidato"
                    value={
                      model.losses.filter((e) => e.data.evidence === 'candidate_reported').length
                    }
                    onClick={() =>
                      open(
                        'Motivos informados pelo candidato',
                        model.losses
                          .filter((e) => e.data.evidence === 'candidate_reported')
                          .map(model.lossRow),
                      )
                    }
                  />
                  <Metric
                    label="Percepção do atendente"
                    value={model.losses.filter((e) => e.data.evidence === 'staff_inferred').length}
                    onClick={() =>
                      open(
                        'Percepções dos atendentes',
                        model.losses
                          .filter((e) => e.data.evidence === 'staff_inferred')
                          .map(model.lossRow),
                      )
                    }
                  />
                </div>
              </Section>
              <Section
                title="Motivos de desistência"
                note="Curso, campus, ingresso e responsável são os registrados no encerramento, mesmo que a ficha tenha mudado depois."
              >
                <div className="crm-bi-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Motivo</th>
                        <th>Total</th>
                        <th>Informado pelo candidato</th>
                        <th>Percepção do atendente</th>
                        <th>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.reasons.map((reason) => (
                        <tr key={reason.id}>
                          <th>
                            <button
                              className="crm-bi-link"
                              onClick={() => open(reason.name, reason.rows.map(model.lossRow))}
                            >
                              {reason.name}
                              {!reason.active ? ' · inativo' : ''}
                            </button>
                          </th>
                          <td>{reason.total}</td>
                          <td>{reason.reported}</td>
                          <td>{reason.inferred}</td>
                          <td>{biPercent(reason.total, model.losses.length)}</td>
                        </tr>
                      ))}
                      {!model.reasons.length && (
                        <tr>
                          <td colSpan={5}>Nenhum encerramento registrado neste recorte.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="crm-bi-note">
                  {model.reopenEvents.length} reaberturas observadas no período. A reabertura não
                  apaga o encerramento histórico.
                </p>
              </Section>
            </>
          )}
          <details className="crm-bi-method">
            <summary>Critérios e atribuição dos indicadores</summary>
            <p>
              As datas filtram eventos e grupos de entrada, não a carteira atual. A origem é a
              primeira entrada real no CRM, preservando testes que depois viraram contatos reais. Os
              filtros de curso, campus e ingresso usam a ficha atual, exceto desistências, que usam
              o retrato do encerramento.
            </p>
            <p>
              Entradas são atribuídas ao primeiro responsável até o corte; eventos acadêmicos ao
              responsável na hora do evento; interações ao autor do registro; carteira e alertas ao
              responsável atual. Uma matrícula importada junto com a entrada não é conversão
              comercial. Conversão exige confirmação posterior e matrícula ativa na base oficial até
              o corte. Datas sem histórico suficiente não geram uma taxa estimada.
            </p>
            <p>
              O gráfico mostra confirmações observadas, inclusive as já existentes na primeira
              carga. Não é uma curva histórica de matrículas acadêmicas. Pessoas fora do CRM não
              entram nestes indicadores.
            </p>
          </details>
        </>
      )}
      {list && (
        <ContactList
          key={list.title}
          title={list.title}
          rows={list.rows}
          close={() => setList(null)}
        />
      )}
    </div>
  )
}

export function GestaoCrm() {
  const { profile, loading } = useProfile()
  if (loading) return <p role="status">Validando acesso...</p>
  if (!profile) return <p role="alert">Perfil indisponível.</p>
  return <CrmManagementView profile={profile} />
}
