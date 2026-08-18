// Supabase Edge Function: send-parent-request
//
// Emails a parent/guardian the capability link to the supplementary support
// questionnaire (src/ParentResponse.jsx, served by the parent-response
// function). It GATES NOTHING: the student's application is already complete
// and submitted by the time this runs, and a delivery failure changes nothing
// about their place on the team.
//
// JWT VERIFIED (the default). Deploy normally:
//   supabase functions deploy send-parent-request
//
// Two callers:
//   * the student, right after their application insert
//       supabase.functions.invoke('send-parent-request', { body: { application_id } })
//   * staff, resending from /applications for any application (is_staff()).
//
// AUTHORIZATION: the body's application_id is a POINTER, never a claim. The
// caller's identity comes from the user-scoped client (their JWT), the row is
// read with the service role, and ownership is decided by comparing the two
// here. A caller who owns neither the row nor a staff role gets 403.
//
// The parent_token is read with the SERVICE ROLE and never returned to the
// caller -- it goes into the emailed link and nowhere else. It is deliberately
// unreadable by every client, including the student who owns the row: a student
// who could read it would answer their own parent's questionnaire. See
// supabase/parent_responses.sql section 2.
//
// SECRETS (same Gmail SMTP path as send-approval-email):
//   GMAIL_USER          - the sending mailbox, e.g. apina@boscotech.edu
//   GMAIL_APP_PASSWORD  - a Google App Password (NOT the account password)
//   EMAIL_FROM          - optional display form; address part MUST be GMAIL_USER
//   APP_URL             - optional; where /parent/<token> lives
// If the Gmail secrets are unset the send is logged and skipped (HTTP 200) so
// the student's submit is never affected.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.

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
    const { application_id } = await req.json().catch(() => ({}))
    const appId = typeof application_id === 'string' ? application_id.trim() : ''
    if (!appId) return json({ error: 'application_id is required' }, 400)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // Who is actually calling. This is the only trusted identity in the request.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: app, error: appErr } = await admin
      .from('member_applications')
      .select('id, member_id, parent_name, parent_email, parent_token, legal_first_name, legal_last_name')
      .eq('id', appId)
      .maybeSingle()
    if (appErr) return json({ error: appErr.message }, 500)
    if (!app) return json({ error: 'Application not found' }, 404)

    // Own it, or be staff. Checked here against the JWT-derived user id, not
    // against anything the body asserted.
    if (app.member_id !== user.id) {
      const { data: isStaff } = await userClient.rpc('is_staff')
      if (!isStaff) return json({ error: 'Not your application' }, 403)
    }

    const to = (app.parent_email ?? '').trim().toLowerCase()
    if (!to || !to.includes('@')) {
      return json({ sent: false, error: 'The application has no usable parent email' }, 400)
    }

    const GMAIL_USER = Deno.env.get('GMAIL_USER')
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      // Not configured yet. The application is already saved; skip quietly.
      console.log(`[send-parent-request] Gmail SMTP not configured; skipping send to ${to}`)
      return json({ skipped: true, reason: 'GMAIL_USER/GMAIL_APP_PASSWORD not set' })
    }

    const from = Deno.env.get('EMAIL_FROM') ?? `Techmen 5669 <${GMAIL_USER}>`
    const appUrl = (Deno.env.get('APP_URL') ?? 'https://frc-app-liard.vercel.app').replace(/\/+$/, '')
    const link = `${appUrl}/parent/${app.parent_token}`
    const student = `${app.legal_first_name ?? ''} ${app.legal_last_name ?? ''}`.trim() || 'Your student'

    // Plain text, deliberately. This is a note from a teacher, not a campaign.
    const text =
      `${student} signed up for the Bosco Tech robotics team, FRC Team 5669, ` +
      `and listed you as their parent or guardian contact.\n\n` +
      `Five short questions about what support you can offer. None of it is ` +
      `required, and none of it affects your student's place on the team.\n\n` +
      `${link}\n\n` +
      `If you did not expect this email, reply and let me know.\n\n` +
      `- Mr. Pina\n`

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
        subject: 'Your student signed up for FRC Team 5669',
        content: text,
      })
      await client.close()
    } catch (sendErr) {
      try { await client.close() } catch { /* ignore */ }
      console.error('[send-parent-request] SMTP send failed', sendErr)
      return json({ sent: false, error: String(sendErr) }, 502)
    }

    return json({ sent: true, to })
  } catch (err) {
    console.error('[send-parent-request] error', err)
    return json({ error: String(err) }, 500)
  }
})
