export type FilterSelection = string[] | null

export function matchesFilter(selection: FilterSelection, value: string) {
  return selection === null || selection.includes(value)
}

export function toggleFilterOption(selection: FilterSelection, value: string, options: string[]): FilterSelection {
  const selected = selection ?? options
  const next = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]
  return options.length > 0 && options.every((option) => next.includes(option)) ? null : next
}
