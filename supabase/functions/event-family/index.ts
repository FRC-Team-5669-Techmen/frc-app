// Supabase Edge Function: event-family
//
// Backs the public family page of the event family hub (/e/<token>,
// src/EventFamilyPage.jsx) and sends the hub's email. Migration
// supabase/migrations/0005_event_family_hub.sql holds EVERY rule; this
// function only resolves who is calling and forwards:
//
//   * a FAMILY (no account; the emailed token is the credential) -> one call
//     to public.hub_family_call(token, action, args), as the service role.
//     That SQL function resolves the token's SHA-256 to an invite and applies
//     the rules: seat capacity, the one-minor rule, consent-gated visibility,
//     edit windows, phase completeness. Nothing about them is decided here.
//   * "lost your link" (no token) -> public.hub_resend_request(email). The
//     answer is the same whether or not the address matched anything.
//   * pg_cron, hourly (x-cron-secret header) -> public.hub_cron_enqueue()
//     queues reminders and "lock-in is open", then the outbox is drained.
//   * a signed-in STAFF member pressing Send on the mentor page -> drains the
//     outbox now instead of at the next tick (their JWT, is_staff() checked).
//
// After every family action the outbox is drained for that event, so
// "your student's car left" goes out when the driver taps Leaving now.
//
// This is a CAPABILITY URL, like parent-response and calendar-feed, so it
// MUST be deployed with JWT verification OFF ("Enforce JWT" off in the
// Dashboard editor; supabase/config.toml pins verify_jwt = false). Single
// file, so it deploys from the Dashboard editor.
//
// SECRETS
//   GMAIL_USER, GMAIL_APP_PASSWORD   the existing Gmail SMTP pair. Unset: mail
//                                    stays queued ("pending") and nothing is
//                                    lost; it goes out once they are set.
//   EMAIL_FROM                       optional display form (address = GMAIL_USER)
//   APP_URL                          optional; where /e/<token> lives
//   EVENT_HUB_CRON_SECRET            the shared secret pg_cron sends; equal to
//                                    private.event_hub_config.hook_secret
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY  injected
//
// No secret and no token is ever logged or returned.
//
// Plain JavaScript in a .ts file (no type annotations), like discord-announce,
// so tests/event-family-function.test.js loads THIS file under Node with its
// two remote imports swapped for fakes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// The one shape every unknown, revoked or malformed token gets.
const notFound = () => json({ error: 'not_found' }, 404)

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/
const FAMILY_ACTIONS = new Set([
  'fetch', 'save', 'claim_seat', 'unclaim_seat', 'mark', 'pickup_accept',
  'food_claim', 'food_edit', 'food_drop', 'confirm_day',
])

// sha256 of each side, then a constant-time compare: length-independent.
async function sameSecret(given, expected) {
  if (!given || !expected) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

// A rule's refusal arrives as message 'hub:<code>' with the sentence a family
// reads in `details`. Anything else is a server error and is not echoed.
function refusal(err) {
  const m = /^hub:([a-z_]+)$/.exec(err?.message ?? '')
  if (!m) return null
  return { code: m[1], message: err?.details ?? '' }
}

// Send what the rules queued. Each email that carries a link gets a FRESH one,
// minted by hub_outbox_mint_link at this moment; the raw token exists only in
// memory here and in the email itself.
async function drain(admin, limit, eventId) {
  const user = Deno.env.get('GMAIL_USER')
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')
  if (!user || !pass) return { sent: 0, failed: 0, skipped: 'gmail_not_configured' }

  const { data: rows, error } = await admin.rpc('hub_outbox_take', { p_limit: limit, p_event: eventId })
  if (error) {
    console.error('[event-family] outbox take failed', error.code)
    return { sent: 0, failed: 0, error: 'outbox_unavailable' }
  }
  if (!rows || rows.length === 0) return { sent: 0, failed: 0 }

  const from = Deno.env.get('EMAIL_FROM') ?? `Techmen 5669 <${user}>`
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://frc-app-liard.vercel.app').replace(/\/+$/, '')
  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
  })
  let sent = 0
  let failed = 0
  try {
    for (const row of rows) {
      try {
        let body = row.body
        if (row.link_invite_id) {
          const { data: token, error: mintErr } = await admin.rpc('hub_outbox_mint_link', { p_outbox: row.id })
          if (mintErr || typeof token !== 'string') throw new Error('could not mint a link')
          body = body.split('{{link}}').join(`${appUrl}/e/${token}`)
        }
        await client.send({ from, to: row.to_emails, subject: row.subject, content: body })
        await admin.rpc('hub_outbox_done', { p_outbox: row.id, p_ok: true, p_error: null })
        sent++
      } catch (e) {
        failed++
        // The error text can name an address; it is stored for staff, never returned.
        await admin.rpc('hub_outbox_done', { p_outbox: row.id, p_ok: false, p_error: String(e).slice(0, 300) })
      }
    }
  } finally {
    try { await client.close() } catch { /* ignore */ }
  }
  return { sent, failed }
}

// Run after the response when the runtime allows it, so a family never waits
// on SMTP; otherwise inline.
function later(p) {
  const rt = globalThis.EdgeRuntime
  if (rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(p.catch((e) => console.error('[event-family] background drain failed', String(e))))
    return null
  }
  return p
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  try {
    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : 'fetch'

    // ── pg_cron ──────────────────────────────────────────────────────────────
    if (action === 'cron') {
      const ok = await sameSecret(req.headers.get('x-cron-secret') ?? '', Deno.env.get('EVENT_HUB_CRON_SECRET') ?? '')
      if (!ok) return json({ error: 'unauthorized' }, 401)
      const { data: queued, error } = await admin.rpc('hub_cron_enqueue')
      if (error) console.error('[event-family] cron enqueue failed', error.code)
      const mail = await drain(admin, 100, null)
      return json({ ok: true, queued: queued ?? 0, ...mail })
    }

    // ── lost your link ───────────────────────────────────────────────────────
    if (action === 'resend_link') {
      const email = typeof body.email === 'string' ? body.email.slice(0, 200) : ''
      const { error } = await admin.rpc('hub_resend_request', { p_email: email })
      if (error) console.error('[event-family] resend failed', error.code)
      const p = later(drain(admin, 10, null))
      if (p) await p
      // The same answer whether or not the address matched, and whether or
      // not the throttle held it back.
      return json({ ok: true })
    }

    // ── staff: send what is queued now ───────────────────────────────────────
    if (action === 'drain') {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'not_signed_in' }, 401)
      const { data: isStaff } = await userClient.rpc('is_staff')
      if (isStaff !== true) return json({ error: 'staff_only' }, 403)
      const eventId = typeof body.event_id === 'string' ? body.event_id : null
      const mail = await drain(admin, 100, eventId)
      return json({ ok: true, ...mail })
    }

    // ── a family, by token ───────────────────────────────────────────────────
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!TOKEN_RE.test(token)) return notFound()
    if (!FAMILY_ACTIONS.has(action)) return json({ error: 'unknown_action', message: 'That action is not part of this page.' }, 400)
    const args = body.args && typeof body.args === 'object' ? body.args : {}

    const { data, error } = await admin.rpc('hub_family_call', { p_token: token, p_action: action, p_args: args })
    if (error) {
      if (error.code === 'P0002') return notFound()
      const r = refusal(error)
      if (r) return json({ error: r.code, message: r.message }, 409)
      console.error('[event-family] call failed', action, error.code)
      return json({ error: 'server_error' }, 500)
    }

    if (action !== 'fetch') {
      const eventId = data?.event?.id ?? null
      const p = later(drain(admin, 25, eventId))
      if (p) await p
    }
    return json(data)
  } catch (err) {
    console.error('[event-family] error', String(err))
    return json({ error: 'server_error' }, 500)
  }
})
