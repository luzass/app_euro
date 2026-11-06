import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PainelExecutivo } from '../src/pages/PainelExecutivo'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <main style={{ padding: 24, background: '#f8fafc' }}><PainelExecutivo /></main>
  </BrowserRouter>,
)
