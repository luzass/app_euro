export interface CampaignRow {
  id: number | string
  client_id: string | null
  valor_usado: number | string | null
  impressoes: number | string | null
  alcance: number | string | null
  frequencia: number | string | null
  cpm: number | string | null
  cliques_no_link: number | string | null
  cpc: number | string | null
  ctr: number | string | null
  lp_views: number | string | null
  cplpv: number | string | null
  connect_rate: number | string | null
  mensagens: number | string | null
  custo_por_mensagem: number | string | null
  contatos: number | string | null
  custo_por_contato: number | string | null
  lead: number | string | null
  matriculado?: number | string | null
  custo_por_lead: number | string | null
  seguidores: number | string | null
  custo_por_seguidor: number | string | null
  data_inicio: string | null
  data_fim: string | null
}

export interface CampaignKpis {
  valor_usado: number
  impressoes: number
  alcance: number
  frequencia: number
  cpm: number
  cliques_no_link: number
  cpc: number
  ctr: number
  lp_views: number
  cplpv: number
  connect_rate: number
  mensagens: number
  custo_por_mensagem: number
  lead: number
  matriculado: number
  custo_por_lead: number
}

export interface ExtendedCampaignKpis extends CampaignKpis {
  matriculados: number
  custo_por_matricula: number
}

export interface GroupedCampaignPoint extends CampaignKpis {
  date: string
}

type NumericField = Exclude<
  keyof CampaignRow,
  'id' | 'client_id' | 'data_inicio' | 'data_fim'
>

const totalFields: NumericField[] = [
  'valor_usado',
  'impressoes',
  'alcance',
  'cliques_no_link',
  'lp_views',
  'mensagens',
  'lead',
  'matriculado',
]

function isBlankValue(value: unknown) {
  return value === null || value === undefined || value === ''
}

function normalizeDateKey(value?: string | null) {
  if (!value) {
    return 'Sem data'
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/')
    return `${year}-${month}-${day}`
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  const month = `${parsedDate.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsedDate.getDate()}`.padStart(2, '0')

  return `${parsedDate.getFullYear()}-${month}-${day}`
}

function getFrequencyAverage(rows: CampaignRow[]) {
  const validValues = rows
    .map((row) => row.frequencia)
    .filter((value) => !isBlankValue(value))
    .map((value) => toNumber(value))

  if (validValues.length === 0) {
    return 0
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length
}

function calculateDerivedMetrics(data: {
  valor_usado: number
  impressoes: number
  alcance: number
  frequencia: number
  cliques_no_link: number
  lp_views: number
  mensagens: number
  lead: number
  matriculado: number
}): CampaignKpis {
  return {
    ...data,
    cpm: safeDivide(data.valor_usado, data.impressoes, 1000),
    cpc: safeDivide(data.valor_usado, data.cliques_no_link),
    ctr: safeDivide(data.cliques_no_link, data.impressoes, 100),
    cplpv: safeDivide(data.valor_usado, data.lp_views),
    connect_rate: safeDivide(data.lp_views, data.cliques_no_link, 100),
    custo_por_mensagem: safeDivide(data.valor_usado, data.mensagens),
    custo_por_lead: safeDivide(data.valor_usado, data.lead),
  }
}

export function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value !== 'string') {
    return 0
  }

  const sanitizedValue = value.trim()

  if (!sanitizedValue) {
    return 0
  }

  const withoutSymbols = sanitizedValue.replace(/[R$\s%]/g, '')
  const hasComma = withoutSymbols.includes(',')
  const hasDot = withoutSymbols.includes('.')

  let normalizedValue = withoutSymbols

  if (hasComma && hasDot) {
    normalizedValue =
      withoutSymbols.lastIndexOf(',') > withoutSymbols.lastIndexOf('.')
        ? withoutSymbols.replace(/\./g, '').replace(',', '.')
        : withoutSymbols.replace(/,/g, '')
  } else if (hasComma) {
    normalizedValue = withoutSymbols.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(withoutSymbols)) {
    normalizedValue = withoutSymbols.replace(/\./g, '')
  }

  const parsedValue = Number(normalizedValue)

  return Number.isFinite(parsedValue) ? parsedValue : 0
}

export function safeDivide(
  numerator: number,
  denominator: number,
  multiplier = 1,
) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0
  }

  return (numerator / denominator) * multiplier
}

export function sumField(rows: CampaignRow[], field: NumericField) {
  return rows.reduce((total, row) => total + toNumber(row[field]), 0)
}

export function calcularKPIsCampanha(rows: CampaignRow[]) {
  const totals = totalFields.reduce(
    (accumulator, field) => ({
      ...accumulator,
      [field]: sumField(rows, field),
    }),
    {} as Record<(typeof totalFields)[number], number>,
  )

  return calculateDerivedMetrics({
    valor_usado: totals.valor_usado,
    impressoes: totals.impressoes,
    alcance: totals.alcance,
    cliques_no_link: totals.cliques_no_link,
    lp_views: totals.lp_views,
    mensagens: totals.mensagens,
    lead: totals.lead,
    matriculado: totals.matriculado,
    frequencia: getFrequencyAverage(rows),
  })
}

export function expandCampaignKpis(
  baseKpis: CampaignKpis,
  matriculados: number,
): ExtendedCampaignKpis {
  const resolvedMatriculados = baseKpis.matriculado > 0 ? baseKpis.matriculado : matriculados

  return {
    ...baseKpis,
    matriculados: resolvedMatriculados,
    custo_por_matricula:
      resolvedMatriculados > 0
        ? safeDivide(baseKpis.valor_usado, resolvedMatriculados)
        : baseKpis.valor_usado,
  }
}

export function agruparPorData(rows: CampaignRow[]) {
  const groupedRows = rows.reduce<Map<string, CampaignRow[]>>((groups, row) => {
    const key = normalizeDateKey(row.data_inicio)
    const currentGroup = groups.get(key) ?? []
    currentGroup.push(row)
    groups.set(key, currentGroup)
    return groups
  }, new Map())

  return Array.from(groupedRows.entries())
    .map(([date, groupRows]) => {
      const kpis = calcularKPIsCampanha(groupRows)

      return {
        date,
        ...kpis,
      } satisfies GroupedCampaignPoint
    })
    .sort((currentItem, nextItem) => currentItem.date.localeCompare(nextItem.date))
}
