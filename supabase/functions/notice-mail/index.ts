// Supabase Edge Function: notice-mail
//
// Sends the mail that 0015_member_standing.sql queues in public.notice_outbox:
// probation opened or closed, discipline, safety violations, voided hours,
// removal, appeals and incidents. The rules that decide WHAT is sent live in
// SQL; this only delivers through ../_shared/mail.js.
//
// Invoked every 10 minutes by pg_cron (public.invoke_notice_mail) with the
// x-cron-secret header, checked against the NOTICE_MAIL_SECRET function
// secret. Deploy with JWT verification OFF (supabase/config.toml pins it):
//   npx supabase functions deploy notice-mail --no-verify-jwt
//
// NOTICE_MAIL_SECRET matches private.notice_mail_config.hook_secret.
// Shared mail settings and multi-file deployment: docs/subsystems/mail.md.
// EMAIL_FROM controls Workspace From, Reply-To and delegated user. Legacy
// SMTP continues until Workspace setup is complete. No mail setup: rows stay queued.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { createMailer } from '../_shared/mail.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const u = new Uint8Array(x), v = new Uint8Array(y)
  let d = 0
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i]
  return d === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTICE_MAIL_SECRET') ?? ''
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!secret || !(await sameSecret(secret, given))) return json({ error: 'unauthorized' }, 401)

  const client = createMailer({ SMTPClient })
  if (!client) return json({ skipped: true, reason: 'mail_not_configured' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rows, error } = await admin.from('notice_outbox')
    .select('id, to_email, subject, body').is('sent_at', null).is('error', null)
    .order('created_at', { ascending: true }).limit(50)
  if (error) return json({ error: error.message }, 500)
  if (!rows?.length) return json({ sent: 0 })

  const appUrl = Deno.env.get('APP_URL') ?? 'https://frc-app-liard.vercel.app'
  let sent = 0
  try {
    for (const r of rows) {
      try {
        await client.send({
          to: r.to_email, subject: r.subject,
          content: `${r.body}\n\nSee it in the app: ${appUrl}/standing\n\nTechmen, FRC Team 5669`,
        })
        await admin.from('notice_outbox').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
        sent += 1
      } catch (e) {
        await admin.from('notice_outbox').update({ error: String(e).slice(0, 500) }).eq('id', r.id)
      }
    }
  } finally {
    try { await client.close() } catch { /* closed */ }
  }
  return json({ sent, of: rows.length })
})
