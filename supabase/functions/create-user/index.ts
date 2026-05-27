import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const allowedRoles = new Set(['admin', 'reitoria', 'spike', 'captacao', 'funcionario'])

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Metodo nao permitido.' }, 405)
  }

  const authorization = request.headers.get('Authorization')

  if (!authorization) {
    return jsonResponse({ error: 'Sessao ausente.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Secrets do Supabase nao configurados na function.' }, 500)
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  })

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser()

    if (authError || !user) {
      return jsonResponse({ error: 'Nao foi possivel validar o usuario autenticado.' }, 401)
    }

    const { data: currentProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return jsonResponse({ error: 'Nao foi possivel validar o perfil do usuario atual.' }, 500)
    }

    if (!currentProfile || currentProfile.role !== 'admin') {
      return jsonResponse({ error: 'Apenas administradores podem criar usuarios.' }, 403)
    }

    const body = await request.json()

    const nome = String(body?.nome ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const senha = String(body?.senha ?? '')
    const role = String(body?.role ?? '').trim().toLowerCase()

    if (!nome || !email || !senha || !role) {
      return jsonResponse({ error: 'Preencha nome, e-mail, senha e role.' }, 400)
    }

    if (!allowedRoles.has(role)) {
      return jsonResponse({ error: 'Role invalida para este projeto.' }, 400)
    }

    if (senha.length < 8) {
      return jsonResponse({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
    }

    const { data: createdAuthUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      })

    if (createUserError || !createdAuthUser.user) {
      return jsonResponse(
        { error: createUserError?.message ?? 'Nao foi possivel criar o usuario no Auth.' },
        400,
      )
    }

    const createdUserId = createdAuthUser.user.id

    const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert({
      id: createdUserId,
      nome,
      email,
      role,
    })

    if (insertProfileError) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId)

      return jsonResponse(
        {
          error:
            insertProfileError.message ??
            'Usuario criado no Auth, mas houve falha ao salvar o perfil.',
        },
        400,
      )
    }

    return jsonResponse({
      success: true,
      user: {
        id: createdUserId,
        nome,
        email,
        role,
      },
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Erro interno na criacao do usuario.',
      },
      500,
    )
  }
})
