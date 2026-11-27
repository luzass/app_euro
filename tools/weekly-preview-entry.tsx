import React from 'react'
import {createRoot} from 'react-dom/client'
import {InteligenciaSemanalView} from '../src/pages/InteligenciaSemanal'
import '../src/index.css'
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-[1500px] bg-slate-50 p-4 sm:p-6"><InteligenciaSemanalView/></main>)
