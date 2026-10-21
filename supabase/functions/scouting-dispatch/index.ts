import { createClient } from 'npm:@supabase/supabase-js@2.106.2'
import { dispatchScouting } from './dispatch.js'

// User JWT verification remains ON. This function is never a public webhook.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const noSession = { persistSession: false, autoRefreshToken: false }
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Sign in first.' }, 401)
  try {
    const text = await request.text()
    if (text.length > 2000) return json({ error: 'Request is too large.' }, 413)
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: noSession })
    const serviceClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: noSession })
    const result = await dispatchScouting({ userClient, serviceClient, body: JSON.parse(text), env: {
      DISCORD_BOT_TOKEN: Deno.env.get('DISCORD_BOT_TOKEN'), DISCORD_GUILD_ID: Deno.env.get('DISCORD_GUILD_ID'),
    } })
    const { http, ...body } = result
    return json(body, http)
  } catch {
    return json({ error: 'Delivery could not be checked. Your saved note is unchanged.' }, 503)
  }
})
