import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useSearchParams } from 'react-router-dom'
import { CrmManagementView } from '../src/pages/GestaoCrm'
import { CrmKanbanView } from '../src/pages/CrmKanban'
import '../src/index.css'
const seller = new URLSearchParams(location.search).has('seller')
const profile = {
  id: seller ? 'seller-a' : 'manager',
  nome: 'Supervisão',
  email: 'teste@example.test',
  role: seller ? ('captacao' as const) : ('captacao_gerente' as const),
  created_at: '2026-11-13T12:00:00Z',
}
function CrmPreview() {
  const [params] = useSearchParams()
  return (
    <>
      <Link to="/app/gestao-crm">Gestão</Link>
      <CrmKanbanView profile={profile} initialContactId={params.get('contato')} />
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <main style={{ padding: 20, background: '#f8fafc' }}>
      <Routes>
        <Route path="/app/crm" element={<CrmPreview />} />
        <Route path="*" element={<CrmManagementView profile={profile} />} />
      </Routes>
    </main>
  </BrowserRouter>,
)
