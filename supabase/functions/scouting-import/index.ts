import { createClient } from 'npm:@supabase/supabase-js@2.106.2'
import { importScouting } from './import.js'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Sign in first.' }, 401)
  try {
    const text = await request.text()
    if (text.length > 2000) return json({ error: 'Request is too large.' }, 413)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await importScouting({ userClient, body: JSON.parse(text), env: {
      TBA_AUTH_KEY: Deno.env.get('TBA_AUTH_KEY'), NEXUS_API_KEY: Deno.env.get('NEXUS_API_KEY'),
    } })
    const { http, ...body } = result
    return json(body, http)
  } catch {
    return json({ error: 'Import preview is unavailable. Existing scouting data is unchanged.' }, 503)
  }
})
