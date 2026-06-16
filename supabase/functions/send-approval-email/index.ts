// Supabase Edge Function: send-approval-email
//
// Sends a courtesy "you're approved" email to a requester after staff approve
// their access request. The whitelist (approved_emails) is the source of truth
// — this email is best-effort and MUST NOT block approval.
//
// Delivery is via Gmail SMTP, authenticating AS a real mailbox, so the message
// is genuinely from that address and passes SPF/DKIM (no domain to verify).
//
// Invoked by the staff review page after approve_access_request() succeeds:
//   supabase.functions.invoke('send-approval-email', { body: { email, full_name } })
//
// SECRETS (set in the Supabase project before email will send):
//   GMAIL_USER          – the sending mailbox, e.g. apina@boscotech.edu
//   GMAIL_APP_PASSWORD  – a Google App Password (NOT the account password).
//                         Requires 2-Step Verification on the account.
//   EMAIL_FROM          – optional display form, e.g. "Techmen 5669 <apina@boscotech.edu>".
//                         The address part MUST be the same mailbox as GMAIL_USER.
//   APP_URL             – optional sign-in link. Defaults to the live app URL.
// If GMAIL_USER / GMAIL_APP_PASSWORD are unset, the send is logged and skipped
// (HTTP 200) so approval still completes.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, full_name } = await req.json().catch(() => ({}))
    const to = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!to) return json({ error: 'email required' }, 400)

    // Safety: only ever email an address that is actually whitelisted, so this
    // function can't be used to send arbitrary mail.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: row } = await admin
      .from('approved_emails')
      .select('email')
      .eq('email', to)
      .maybeSingle()
    if (!row) return json({ error: 'email is not approved' }, 403)

    const GMAIL_USER = Deno.env.get('GMAIL_USER')
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      // Not configured yet — approval already succeeded; just skip the courtesy.
      console.log(`[send-approval-email] Gmail SMTP not configured; skipping send to ${to}`)
      return json({ skipped: true, reason: 'GMAIL_USER/GMAIL_APP_PASSWORD not set' })
    }

    const from = Deno.env.get('EMAIL_FROM') ?? `Techmen 5669 <${GMAIL_USER}>`
    const appUrl = Deno.env.get('APP_URL') ?? 'https://frc-app-liard.vercel.app'
    const name = (typeof full_name === 'string' && full_name.trim()) || 'there'

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#14161A;line-height:1.5">
        <h2 style="color:#9a7b1f;margin:0 0 12px">You're approved · Techmen 5669</h2>
        <p>Hi ${name},</p>
        <p>Your access to the Techmen team platform has been approved. You can now sign in and use the app.</p>
        <p>If you're already signed in and still see the request screen, <strong>reload the page or sign out and sign back in</strong> — your session won't update on its own.</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#D4AF37;color:#0A0B0D;
              text-decoration:none;font-weight:700;padding:10px 18px;border-radius:4px">Open the app</a></p>
        <p style="color:#5A6068;font-size:13px">Techmen · FRC Team 5669</p>
      </div>`

    const text =
      `You're approved — Techmen 5669\n\n` +
      `Hi ${name},\n\nYour access to the Techmen team platform has been approved. ` +
      `You can now sign in and use the app.\n\n` +
      `If you're already signed in and still see the request screen, reload the page ` +
      `or sign out and back in — your session won't update on its own.\n\n${appUrl}\n`

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    })

    try {
      await client.send({
        from,
        to,
        subject: "You're approved — Techmen 5669",
        content: text,
        html,
      })
      await client.close()
    } catch (sendErr) {
      try { await client.close() } catch { /* ignore */ }
      // Still 200: approval already happened; surface without failing it.
      console.error('[send-approval-email] SMTP send failed', sendErr)
      return json({ sent: false, error: String(sendErr) })
    }

    return json({ sent: true })
  } catch (err) {
    console.error('[send-approval-email] error', err)
    return json({ error: String(err) }, 500)
  }
})
