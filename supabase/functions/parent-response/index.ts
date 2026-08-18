// Supabase Edge Function: parent-response
//
// Backs the public /parent/<token> page (src/ParentResponse.jsx): the parent
// fetches their student's name plus any answers already on file, and submits or
// corrects them. It GATES NOTHING -- no student is blocked by a parent who
// never opens this.
//
// This is a CAPABILITY URL, exactly like calendar-feed: there is no JWT and no
// sign-in. The unguessable member_applications.parent_token is the only secret,
// so this function MUST be deployed with JWT verification OFF:
//
//   supabase functions deploy parent-response --no-verify-jwt
//
// (or toggle "Verify JWT" off in the Dashboard editor). Self-contained / single
// file so it deploys via the Dashboard editor.
//
// The token is emailed to the parent by send-parent-request and is unreadable
// by every client, including the student who owns the application row -- that
// is the whole reason for the column-grant rebuild in
// supabase/parent_responses.sql. This function reads it with the service role,
// which bypasses both RLS and that grant.
//
// parent_responses has NO insert/update/delete policy for anyone. This function
// is its only writer.
//
// Requests are POST JSON:
//   { token, action: 'fetch'  }
//     -> 200 { student_name, response: {...} | null }
//   { token, action: 'submit', weekend_supervision, meal_support,
//     travel_driving, employer_name, employer_contact_consent, donation_offer }
//     -> 200 { ok: true, updated: boolean }
// A token that matches nothing returns a GENERIC 404 in both cases. It never
// distinguishes "wrong token" from "expired" / "revoked" / "already answered":
// the caller is unauthenticated, so every failure has to look the same.
//
// Uses only auto-injected env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

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

// The one shape every failed lookup returns.
const notFound = () => json({ error: 'not_found' }, 404)

const WEEKEND = ['saturdays', 'sundays', 'either', 'neither']
const YES_NO_MAYBE = ['yes', 'no', 'maybe']

// A uuid-shaped token is the only thing worth a database round trip.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Enumerated answers are validated HERE, against the same vocabulary as the
// CHECK constraints. The client <select> is a convenience, not a control: this
// endpoint takes unauthenticated input from the open internet.
// Returns the normalized value, null for "not answered", or undefined for
// "invalid", which the caller turns into a 400.
function pickEnum(raw: unknown, allowed: string[]): string | null | undefined {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  if (!v) return null
  return allowed.includes(v) ? v : undefined
}

// Free text: trimmed, length-capped, empty becomes null.
function pickText(raw: unknown, max: number): string | null | undefined {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return undefined
  const v = raw.trim()
  if (!v) return null
  return v.length > max ? undefined : v
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const action = body.action === 'submit' ? 'submit' : 'fetch'
    if (!UUID_RE.test(token)) return notFound()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Authenticate by capability token. Nothing else from the application row
    // is ever returned: the parent gets their student's name so they know the
    // link is theirs, and nothing about pathway, phone numbers, or answers the
    // student gave.
    const { data: app, error: appErr } = await admin
      .from('member_applications')
      .select('id, legal_first_name, legal_last_name')
      .eq('parent_token', token)
      .maybeSingle()
    if (appErr) {
      console.error('[parent-response] application lookup failed', appErr)
      return json({ error: 'server_error' }, 500)
    }
    if (!app) return notFound()

    const studentName = `${app.legal_first_name ?? ''} ${app.legal_last_name ?? ''}`.trim()

    const { data: existing, error: exErr } = await admin
      .from('parent_responses')
      .select('id, weekend_supervision, meal_support, travel_driving, employer_name, employer_contact_consent, donation_offer, submitted_at, updated_at')
      .eq('application_id', app.id)
      .maybeSingle()
    if (exErr) {
      console.error('[parent-response] response lookup failed', exErr)
      return json({ error: 'server_error' }, 500)
    }

    if (action === 'fetch') {
      return json({ student_name: studentName, response: existing ?? null })
    }

    // ── submit ────────────────────────────────────────────────────────────────
    const weekend = pickEnum(body.weekend_supervision, WEEKEND)
    const meal = pickEnum(body.meal_support, YES_NO_MAYBE)
    const travel = pickEnum(body.travel_driving, YES_NO_MAYBE)
    const employer = pickText(body.employer_name, 200)
    const donation = pickText(body.donation_offer, 2000)
    if (weekend === undefined) return json({ error: 'invalid_weekend_supervision' }, 400)
    if (meal === undefined) return json({ error: 'invalid_meal_support' }, 400)
    if (travel === undefined) return json({ error: 'invalid_travel_driving' }, 400)
    if (employer === undefined) return json({ error: 'invalid_employer_name' }, 400)
    if (donation === undefined) return json({ error: 'invalid_donation_offer' }, 400)

    // Consent is an explicit opt-in and is NEVER inferred from the presence of
    // an employer name. Only a literal true counts; anything else is false.
    const consent = body.employer_contact_consent === true

    const payload = {
      weekend_supervision: weekend,
      meal_support: meal,
      travel_driving: travel,
      employer_name: employer,
      employer_contact_consent: consent,
      donation_offer: donation,
    }

    // The token stays valid after a submit, so a parent can come back and
    // correct an answer. An overwrite stamps updated_at; the original
    // submitted_at is left alone.
    if (existing) {
      const { error: upErr } = await admin
        .from('parent_responses')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (upErr) {
        console.error('[parent-response] update failed', upErr)
        return json({ error: 'server_error' }, 500)
      }
      return json({ ok: true, updated: true })
    }

    const { error: insErr } = await admin
      .from('parent_responses')
      .insert({ application_id: app.id, ...payload })
    if (insErr) {
      // 23505 = the one-row-per-application unique index: a second tab beat us
      // to it. Same outcome from the parent's side, so treat it as a success.
      if (insErr.code === '23505') return json({ ok: true, updated: true })
      console.error('[parent-response] insert failed', insErr)
      return json({ error: 'server_error' }, 500)
    }
    return json({ ok: true, updated: false })
  } catch (err) {
    console.error('[parent-response] error', err)
    return json({ error: 'server_error' }, 500)
  }
})
