import { useEffect, useRef, useState } from 'react'
import type { CrmContact, CrmDetailCursor, CrmDetailPage, CrmDetailSection } from '../lib/crmKanban'
import { loadCrmDetailSection } from '../lib/crmKanbanApi'

export function useCrmDetailSection<K extends Exclude<CrmDetailSection, 'contact'>>(
  contact: CrmContact,
  section: K,
  enabled: boolean,
  onContactUpdated: (contact: CrmContact) => void,
) {
  const [request, setRequest] = useState({
    serial: 0, version: contact.version, cursor: null as CrmDetailCursor | null,
  })
  const [state, setState] = useState<{
    page: CrmDetailPage<K> | null
    version: number
    serial: number
    error: string
  }>({ page: null, version: 0, serial: -1, error: '' })
  const pending = useRef(new Map<string, Promise<CrmDetailPage<K>>>())
  const version = contact.version
  const id = contact.id
  const completedVersion = state.version
  useEffect(() => {
    if (!enabled || (completedVersion === version && state.serial === request.serial)) return
    let live = true
    const cursor = request.version === version ? request.cursor : null
    const key = JSON.stringify([id, version, cursor])
    let promise = pending.current.get(key)
    if (!promise) {
      promise = loadCrmDetailSection(id, section, cursor)
      const requests = pending.current
      requests.set(key, promise)
      void promise.finally(() => requests.delete(key)).catch(() => {})
    }
    void promise.then(page => {
      if (!live) return
      if (page.contact.version < version) throw new Error('A ficha mudou. Atualize esta aba.')
      // A cursor from an older revision cannot extend the new revision's list.
      if (cursor && page.contact.version !== version) {
        setState({ page: null, version: page.contact.version, serial: -1, error: '' })
        onContactUpdated(page.contact)
        return
      }
      setState(current => ({
        page: {
          ...page,
          items:
            cursor && current.page?.contact.version === page.contact.version
              ? [...new Map([...current.page.items, ...page.items].map(item => [
                  'source' in item ? JSON.stringify([item.source, item.source_key]) : item.id,
                  item,
                ])).values()]
              : page.items,
        },
        version: page.contact.version, serial: request.serial, error: '',
      }))
      onContactUpdated(page.contact)
    }).catch(error => {
      if (live) setState(current => ({
        ...current, version, serial: request.serial, error: error.message,
      }))
    })
    return () => { live = false }
  }, [id, version, section, enabled, request, completedVersion, state.serial, onContactUpdated])

  const page = state.page?.contact.version === version ? state.page : null
  const loading = enabled && (completedVersion !== version || state.serial !== request.serial)
  return {
    page,
    loading,
    error: completedVersion === version && state.serial === request.serial ? state.error : '',
    retry: () => setRequest(current => ({ ...current, serial: current.serial + 1 })),
    more: () => {
      if (!loading && page?.next_cursor) setRequest(current => ({
        serial: current.serial + 1, version, cursor: page.next_cursor,
      }))
    },
  }
}
