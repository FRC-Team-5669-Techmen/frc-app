// Supabase Edge Function: send-approval-email
//
// Sends a courtesy "you're approved" email to a requester after staff approve
// their access request. The whitelist (approved_emails) is the source of truth
// — this email is best-effort and MUST NOT block approval.
//
// Invoked by the staff review page after approve_access_request() succeeds:
//   supabase.functions.invoke('send-approval-email', { body: { email, full_name } })
//
// SECRETS (set these in the Supabase project before the email will send):
//   RESEND_API_KEY   – Resend API key. If unset, the function logs and skips
//                      the send, returning { skipped: true } with HTTP 200.
//   EMAIL_FROM       – optional. Sender, e.g. "Techmen 5669 <noreply@your-domain>".
//                      Defaults to Resend's shared "onboarding@resend.dev".
//   APP_URL          – optional. Sign-in link shown in the email. Defaults to
//                      the live app URL.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      // Not configured yet — approval already succeeded; just skip the courtesy.
      console.log(`[send-approval-email] RESEND_API_KEY unset; skipping send to ${to}`)
      return json({ skipped: true, reason: 'RESEND_API_KEY not set' })
    }

    const from = Deno.env.get('EMAIL_FROM') ?? 'Techmen 5669 <onboarding@resend.dev>'
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "You're approved — Techmen 5669",
        html,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error(`[send-approval-email] provider error ${res.status}: ${detail}`)
      // Still 200: approval already happened; surface the issue without failing.
      return json({ sent: false, providerStatus: res.status })
    }

    return json({ sent: true })
  } catch (err) {
    console.error('[send-approval-email] error', err)
    return json({ error: String(err) }, 500)
  }
})
