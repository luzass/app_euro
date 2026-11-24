export function detailPageFixture(detail, parameters) {
  const section = parameters.p_section
  const all = Array.isArray(detail[section]) ? [...detail[section]] : []
  if (section === 'events') all.sort((a, b) => b.id - a.id)
  if (section === 'activities') all.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.id.localeCompare(a.id))
  if (section === 'sources') all.sort((a, b) => b.source_date.localeCompare(a.source_date) || a.source.localeCompare(b.source) || a.source_key.localeCompare(b.source_key))
  const cursor = parameters.p_cursor
  const start = cursor ? all.findIndex(item => section === 'sources' ? item.source === cursor.source && item.source_key === cursor.key : item.id === cursor.id) + 1 : 0
  const size = section === 'sources' ? 10 : 50
  const items = all.slice(start, start + size), last = items.at(-1)
  const next = start + items.length < all.length && last ? section === 'sources' ? { date: last.source_date, source: last.source, key: last.source_key } : section === 'activities' ? { at: last.occurred_at, id: last.id } : { id: last.id } : null
  const { source_data: _source, manual_data: _manual, ...contact } = detail.contact
  return { contact, section, items, next_cursor: next, visited_stages: section === 'events' ? detail.visited_stages ?? [] : [] }
}
