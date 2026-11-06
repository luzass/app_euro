import { createContext } from 'react'
import type { GenericRow } from './dashboardHelpers'
import type { ProfileSource } from './studentProfile'

export const ExecutiveDataContext = createContext<{
  loading: boolean
  matriculadosError: string
  sources: ProfileSource[]
  cacheRows: GenericRow[]
  cacheWarning: string
  reload: () => void
} | null>(null)
