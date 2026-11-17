import React from 'react'
import { createRoot } from 'react-dom/client'
import { DashboardFunil } from '../src/pages/DashboardFunil'
import { DashboardHistorico } from '../src/pages/DashboardHistorico'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 16, background: '#f8fafc' }}>
    {new URLSearchParams(location.search).has('historico') ? <DashboardHistorico /> : <DashboardFunil />}
  </main>,
)
