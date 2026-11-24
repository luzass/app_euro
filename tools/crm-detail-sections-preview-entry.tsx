import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CrmContactDrawer } from '../src/components/CRM/CrmContactDrawer'
import type { CrmContact } from '../src/lib/crmKanban'
import '../src/index.css'
const now = new Date().toISOString()
const initial: CrmContact = {
  id: 'contact-1', cpf: '00000000001', owner_id: 'seller-1', stage: 'inscrito', position: 1,
  current_data: { nome: 'Candidate 1', curso: 'Direito' }, has_inscription: true,
  official_enrollment: false, test_only: false, archived: false, checklist: {},
  next_action_at: null, stage_entered_at: now, version: 1, created_at: now, updated_at: now,
}
function Preview() {
  const [contact, setContact] = useState(initial)
  useEffect(() => {
    const change = (event: Event) => setContact((event as CustomEvent<CrmContact>).detail)
    window.addEventListener('crm-detail-test-contact', change)
    return () => window.removeEventListener('crm-detail-test-contact', change)
  }, [])
  const updated = useCallback((next: CrmContact) => setContact(current =>
    next.id === current.id && next.version >= current.version ? next : current), [])
  return <CrmContactDrawer key={contact.id} contact={contact} now={Date.now()}
    profile={{ id: 'seller-1', nome: 'Test', email: 'test@example.test', role: 'captacao', created_at: now }}
    members={[]} lossReasons={[]} lossReady={false} onContactUpdated={updated} busy={false}
    onClose={() => {}} onPatch={async c => c} notify={() => {}} />
}
createRoot(document.getElementById('root')!).render(<Preview />)
