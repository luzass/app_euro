import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

export function ProfileProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = async () => {
    if (!user?.id) {
      setProfile(null)
      setError(null)
      setLoading(false)
      return
    }

    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, nome, email, role, created_at')
      .eq('id', user.id)
      .single()

    if (profileError) {
      setProfile(null)
      setError(
        'Não foi possível carregar o perfil do usuário. Verifique a tabela profiles no Supabase.',
      )
      setLoading(false)
      return
    }

    setProfile(data as Profile)
    setLoading(false)
  }

  useEffect(() => {
    void loadProfile()
  }, [user?.id])

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      loading,
      error,
      refreshProfile: loadProfile,
    }),
    [error, loading, profile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)

  if (!context) {
    throw new Error('useProfile deve ser usado dentro de ProfileProvider.')
  }

  return context
}
