// Edge Function: send-push
// Immediate sender. Called server-to-server (the task_claims trigger via pg_net)
// with a shared secret. Body: { targets: [{ member_id, category, kind, ref_id,
// title, body, url }] }. Deploy with --no-verify-jwt (it authenticates via the
// x-push-secret header, not a user JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { configureVapid, sendToMember } from '../_shared/push.ts'

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  try {
    const { targets } = await req.json().catch(() => ({ targets: [] }))
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    configureVapid()

    const results = []
    for (const t of targets ?? []) results.push(await sendToMember(admin, t))
    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-push] error', String(err))
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
