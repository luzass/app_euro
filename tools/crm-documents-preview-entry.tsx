import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CrmContactDrawer } from '../src/components/CRM/CrmContactDrawer'
import type { CrmContact } from '../src/lib/crmKanban'
import { crmRpc } from '../src/lib/crmKanbanApi'
import '../src/index.css'

const now = new Date().toISOString()
const fixture: CrmContact = {
  id: 'contact-1',
  cpf: '12345678901',
  owner_id: 'seller-1',
  stage: 'inscrito',
  position: 1024,
  source_data: {},
  manual_data: {},
  current_data: {
    nome: 'Candidato de demonstração',
    curso: 'Direito',
    campus: 'Asa Sul',
    turno: 'NOTURNO',
  },
  has_inscription: true,
  official_enrollment: false,
  test_only: false,
  archived: false,
  intake_visible: true,
  checklist: {},
  next_action_at: null,
  stage_entered_at: now,
  version: 1,
  created_at: now,
  updated_at: now,
}
export function Preview() {
  const [contact, setContact] = useState(fixture)
  const readonly = new URLSearchParams(location.search).has('readonly')
  return (
    <CrmContactDrawer
      contact={contact}
      now={Date.parse(now)}
      profile={{
        id: readonly ? 'seller-2' : 'seller-1',
        nome: 'Vendedor de demonstração',
        email: 'teste@example.test',
        role: 'captacao',
        created_at: now,
      }}
      members={[]}
      lossReasons={[]}
      lossReady={false}
      onContactUpdated={setContact}
      busy={false}
      onClose={() => {}}
      notify={() => {}}
      onPatch={async (c, patch) => {
        const updated = await crmRpc<CrmContact>('crm_kanban_save', {
          p_id: c.id,
          p_patch: patch,
          p_version: c.version,
        })
        setContact(updated)
        return updated
      }}
    />
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
