const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
})

const compactNumberFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCurrencyBR(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatNumberBR(
  value: number,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
    ...options,
  }).format(Number.isFinite(value) ? value : 0)
}

export function formatDecimalBR(value: number, fractionDigits = 2) {
  return formatNumberBR(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatPercentBR(value: number, fractionDigits = 2) {
  return `${formatDecimalBR(value, fractionDigits)}%`
}

export function formatCompactNumberBR(value: number) {
  return compactNumberFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatDateBR(value?: string | null) {
  if (!value) {
    return '--'
  }

  const normalizedValue = value.length <= 10 ? `${value}T00:00:00` : value
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('pt-BR')
}

export function formatDateShortBR(value?: string | null) {
  if (!value) {
    return '--'
  }

  const normalizedValue = value.length <= 10 ? `${value}T00:00:00` : value
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}
