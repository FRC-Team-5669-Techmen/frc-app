// Fixture: households, parents with more than one student
// (supabase/migrations/0009_event_hub_households.sql). Contract:
// src/dev/fixture/README.md. A test-only port of hub_household_open; the
// sibling rule itself (the one-child exemption, the household list on the
// page) is in features/eventhub.js, gated on this migration through
// engine.applied('0009'). The SQL is the rule, proven by
// 0009_event_hub_households_rls_test.sql on tools/sql-harness/.
import { hubFixture } from './eventhub.js'

const { T, one, nowMs } = hubFixture
const refusal = (code, details, state = 'P0001') => ({ data: null, error: { code: state, message: `hub:${code}`, details, hint: null } })

function mint(db, inv, email, t) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let token = ''
  for (let i = 0; i < 22; i++) token += a[Math.floor(Math.random() * a.length)]
  T(db, 'hub_invite_tokens').push({ token, invite_id: inv, email, created_at: new Date(t).toISOString(), revoked_at: null })
  return token
}

export default {
  migration: '0009',
  creates: { rpcs: ['hub_household_open'] },
  rpcs: {
    hub_household_open: ({ args, db, now }) => {
      const tk = one(db, 'hub_invite_tokens', (x) => x.token === args?.p_token && !x.revoked_at)
      if (!tk) return refusal('not_found', 'That link is not valid.', 'P0002')
      const from = one(db, 'hub_invites', (i) => i.id === tk.invite_id)
      const to = one(db, 'hub_invites', (i) => i.id === args?.p_invite)
      if (!tk.email || !to || to.id === from.id || to.event_id !== from.event_id || !(to.emails ?? []).includes(tk.email)) {
        return refusal('not_household', 'That page is not on your email. Open it from the email we sent for that student.')
      }
      return { data: { token: mint(db, to.id, tk.email, nowMs(now)) }, error: null }
    },
  },
}
