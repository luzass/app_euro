import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleWeeklyRequest } from './handler.bundle.js'

Deno.serve(request => handleWeeklyRequest(request, {
  client: authorization => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global:{headers:{Authorization:authorization}}, auth:{persistSession:false} }),
  env: key => Deno.env.get(key),
  fetch,
}))
