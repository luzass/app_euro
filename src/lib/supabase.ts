import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export interface SupabaseDiagnosticResult {
  ok: boolean
  target: string
  summary: string
  status?: number
  detail?: string
}

export function getSupabaseProjectHost() {
  if (!supabaseUrl) {
    return '--'
  }

  try {
    return new URL(supabaseUrl).host
  } catch {
    return supabaseUrl
  }
}

export function normalizeSupabaseError(error: unknown) {
  const fallbackMessage = 'Nao foi possivel falar com o Supabase agora.'

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('failed to fetch')) {
      return [
        'Falha de rede ao falar com o Supabase.',
        'Se a URL e a anon key ja estao corretas, isso costuma apontar para projeto pausado, bloqueio do navegador, VPN, proxy ou firewall.',
      ].join(' ')
    }

    return error.message || fallbackMessage
  }

  return fallbackMessage
}

export async function runSupabaseDiagnostics(): Promise<SupabaseDiagnosticResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      target: 'config',
      summary: 'O .env ainda nao esta configurado por completo.',
    }
  }

  const target = new URL('/auth/v1/settings', supabaseUrl).toString()

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
      },
    })

    const responseText = await response.text()

    if (!response.ok) {
      return {
        ok: false,
        target,
        status: response.status,
        summary: `O Supabase respondeu com status ${response.status}.`,
        detail: responseText.slice(0, 300),
      }
    }

    return {
      ok: true,
      target,
      status: response.status,
      summary: 'Conexao com o endpoint publico de autenticacao funcionando.',
      detail: responseText.slice(0, 300),
    }
  } catch (error) {
    return {
      ok: false,
      target,
      summary: normalizeSupabaseError(error),
      detail: error instanceof Error ? error.stack : undefined,
    }
  }
}
