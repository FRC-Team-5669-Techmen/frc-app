// Supabase Edge Function: invite-member
//
// Staff-initiated invite. Whitelists an email (approved_emails) with a role and
// sends Supabase's built-in one-tap invite link via the project's configured
// SMTP. The invitee clicks the link, lands signed in, and claim_profile() grants
// them the whitelisted role — no request form, no waiting.
//
// This is ADDITIVE: the self-serve access-request flow is unchanged.
//
// Invoked from the staff review page:
//   supabase.functions.invoke('invite-member', { body: { email, role } })
//
// Uses only auto-injected env (SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY). APP_URL is optional (where the invite link lands).

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

const ROLES = ['student', 'mentor', 'parent']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, role } = await req.json().catch(() => ({}))
    const to = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const grantRole = ROLES.includes(role) ? role : 'parent'
    if (!to || !to.includes('@')) return json({ error: 'A valid email is required' }, 400)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // Authorize: the caller must be staff. is_staff() keys off their JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)
    const { data: isStaff } = await userClient.rpc('is_staff')
    if (!isStaff) return json({ error: 'Staff role required' }, 403)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Whitelist first, so the invitee is approved with the right role regardless
    // of how they end up signing in.
    const { error: wlErr } = await admin
      .from('approved_emails')
      .upsert({ email: to, granted_role: grantRole, added_by: user.id }, { onConflict: 'email' })
    if (wlErr) return json({ error: wlErr.message }, 500)

    // Send the one-tap invite link (uses the project's SMTP).
    const appUrl = Deno.env.get('APP_URL') ?? 'https://frc-app-liard.vercel.app'
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(to, {
      redirectTo: appUrl,
    })

    if (inviteErr) {
      // Most common: the person already has an account. They're whitelisted now,
      // so they just sign in normally and land in as their granted role.
      const msg = String(inviteErr.message || '')
      const exists = /already.*regist|exist/i.test(msg)
      return json({
        whitelisted: true,
        invited: false,
        alreadyRegistered: exists,
        role: grantRole,
        note: exists
          ? 'Already has an account — approved; they can just sign in.'
          : msg,
      })
    }

    return json({ whitelisted: true, invited: true, role: grantRole })
  } catch (err) {
    console.error('[invite-member] error', err)
    return json({ error: String(err) }, 500)
  }
})
