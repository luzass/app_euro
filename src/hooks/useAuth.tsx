import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  isSupabaseConfigured,
  normalizeSupabaseError,
  supabase,
} from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    let isMounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) {
          return
        }

        setSession(data.session)
        setUser(data.session?.user ?? null)
        setLoading(false)
      })
      .catch((error) => {
        console.error('Supabase getSession error:', error)

        if (!isMounted) {
          return
        }

        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      async signIn(email, password) {
        if (!supabase) {
          throw new Error(
            'Configure as variaveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
          )
        }

        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password })

          if (error) {
            throw error
          }
        } catch (error) {
          console.error('Supabase signIn error:', error)
          throw new Error(normalizeSupabaseError(error))
        }
      },
      async signOut() {
        if (!supabase) {
          return
        }

        const { error } = await supabase.auth.signOut()

        if (error) {
          throw error
        }
      },
    }),
    [loading, session, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  }

  return context
}
