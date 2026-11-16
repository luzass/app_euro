import React from 'react'
import { createRoot } from 'react-dom/client'
import { CrmKanbanView } from '../src/pages/CrmKanban'
import '../src/index.css'

const seller = new URLSearchParams(location.search).has('seller')
const profile = {
  id: seller ? 'seller-1' : 'manager-1',
  nome: seller ? 'William' : 'Gestor',
  email: 'teste@example.test',
  role: seller ? ('captacao' as const) : ('captacao_gerente' as const),
  created_at: '2026-11-13T12:00:00Z',
}
createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 20, maxWidth: 1150, background: '#f8fafc' }}>
    <CrmKanbanView profile={profile} />
  </main>,
)
