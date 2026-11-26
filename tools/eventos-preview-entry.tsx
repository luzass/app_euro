import React from 'react'
import { createRoot } from 'react-dom/client'
import { EventosCaptacaoView } from '../src/pages/EventosCaptacao'
import '../src/index.css'
createRoot(document.getElementById('root')!).render(<main style={{ padding: 20, maxWidth: 1440, background: '#f8fafc' }}><EventosCaptacaoView /></main>)
