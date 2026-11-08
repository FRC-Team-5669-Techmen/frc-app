// Supabase Edge Function: send-approval-email
//
// Sends a courtesy "you're approved" email to a requester after staff approve
// their access request. The whitelist (approved_emails) is the source of truth
// This email is best-effort and MUST NOT block approval.
//
// Invoked after approve_access_request() succeeds. Delivery uses the shared
// mail credential reader: Workspace Gmail API when complete, legacy SMTP
// during setup. EMAIL_FROM is the only Workspace sender setting and also
// supplies Reply-To and the delegated user. See docs/subsystems/mail.md.
// APP_URL optionally overrides the sign-in link. Supabase credentials are
// injected by the runtime. Missing mail setup skips without blocking approval.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { createMailer } from '../_shared/mail.js'

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

    // Authenticate the caller before using a privileged client or sending mail.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not signed in' }, 401)
    const { data: isStaff, error: roleError } = await userClient.rpc('is_staff')
    if (roleError || !isStaff) return json({ error: 'Staff role required' }, 403)

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

    const client = createMailer({ SMTPClient })
    if (!client) return json({ skipped: true, reason: 'mail_not_configured' })

    const appUrl = Deno.env.get('APP_URL') ?? 'https://frc-app-liard.vercel.app'
    const name = (typeof full_name === 'string' && full_name.trim()) || 'there'

    const htmlName = name.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#14161A;line-height:1.5">
        <h2 style="color:#9a7b1f;margin:0 0 12px">You're approved · Techmen 5669</h2>
        <p>Hi ${htmlName},</p>
        <p>Your access to the Techmen team platform has been approved. You can now sign in and use the app.</p>
        <p>If you're already signed in and still see the request screen, <strong>reload the page or sign out and sign back in</strong>. Your session won't update on its own.</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#D4AF37;color:#0A0B0D;
              text-decoration:none;font-weight:700;padding:10px 18px;border-radius:4px">Open the app</a></p>
        <p style="color:#5A6068;font-size:13px">Techmen · FRC Team 5669</p>
      </div>`

    const text =
      `You're approved · Techmen 5669\n\n` +
      `Hi ${name},\n\nYour access to the Techmen team platform has been approved. ` +
      `You can now sign in and use the app.\n\n` +
      `If you're already signed in and still see the request screen, reload the page ` +
      `or sign out and back in. Your session won't update on its own.\n\n${appUrl}\n`

    try {
      await client.send({
        to,
        subject: "You're approved · Techmen 5669",
        content: text,
        html,
      })
      await client.close()
    } catch (sendErr) {
      try { await client.close() } catch { /* ignore */ }
      // Still 200: approval already happened; surface without failing it.
      console.error('[send-approval-email] Mail send failed', sendErr)
      return json({ sent: false, error: String(sendErr) })
    }

    return json({ sent: true })
  } catch (err) {
    console.error('[send-approval-email] error', err)
    return json({ error: String(err) }, 500)
  }
})
