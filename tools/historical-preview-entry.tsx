import React from 'react'
import { createRoot } from 'react-dom/client'
import { DashboardHistorico } from '../src/pages/DashboardHistorico'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(<main style={{ padding: 24, background: '#f8fafc' }}><DashboardHistorico /></main>)
