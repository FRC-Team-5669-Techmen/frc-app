// Fixture: the event hub's family changes (supabase/migrations/0008_event_hub_families.sql).
// Contract: src/dev/fixture/README.md. A test-only port of 0008's five new
// RPCs over the tables features/eventhub.js seeds; the drive flags, the wider
// adult count and the guardians list are in eventhub.js's port itself, gated
// on this migration through engine.applied('0008'). The SQL is the rule,
// proven by 0008_event_hub_families_rls_test.sql on tools/sql-harness/.
import { hubFixture, removeFamily, removeGuardian } from './eventhub.js'

const { T, one, nowMs, txn, Refusal, tokenInvite, isStaff, claim, seatsIn, refuse } = hubFixture
const answer = (fn) => {
  try { return { data: fn(), error: null } } catch (e) {
    if (e instanceof Refusal) return { data: null, error: { code: e.state ?? 'P0001', message: `hub:${e.code}`, details: e.message, hint: null } }
    throw e
  }
}
const notFound = { data: null, error: { code: 'P0002', message: 'hub:not_found', details: 'That link is not valid.', hint: null } }
const staffOnly = { data: null, error: { code: 'P0001', message: 'hub:not_allowed', details: 'Staff only.', hint: null } }
const callerEmail = (db, token) => one(db, 'hub_invite_tokens', (t) => t.token === token && !t.revoked_at)?.email ?? null

export default {
  migration: '0008',
  creates: { rpcs: ['hub_remove_guardian', 'hub_remove_family', 'hub_staff_remove_guardian', 'hub_staff_remove_family', 'hub_staff_place_pair'] },
  rpcs: {
    hub_remove_guardian: ({ args, db, now }) => {
      const inv = tokenInvite(db, args?.p_token)
      if (!inv) return notFound
      return answer(() => txn(db, () => removeGuardian(db, inv, args?.p_email, null, callerEmail(db, args.p_token), nowMs(now))))
    },
    hub_remove_family: ({ args, db, now }) => {
      const inv = tokenInvite(db, args?.p_token)
      if (!inv) return notFound
      return answer(() => txn(db, () => removeFamily(db, inv, null, nowMs(now))))
    },
    hub_staff_remove_guardian: ({ args, db, user, now }) => {
      if (!isStaff(db, user?.id)) return staffOnly
      return answer(() => txn(db, () => removeGuardian(db, args?.p_invite, args?.p_email, user.id, null, nowMs(now))))
    },
    // Two students into an empty needs-two car at once: the first under a
    // temporary override, the second clears it, and a refusal seats nobody.
    hub_staff_place_pair: ({ args, db, user, now }) => {
      if (!isStaff(db, user?.id)) return staffOnly
      return answer(() => txn(db, () => {
        const t = nowMs(now)
        if (!args?.p_first || !args?.p_second || args.p_first === args.p_second) refuse('invalid', 'Pick two different students.')
        const c = one(db, 'hub_cars', (x) => x.id === args?.p_car)
        if (!c) refuse('car_gone', 'That car is no longer listed. Pick another.')
        if (seatsIn(db, c.id).length !== 0) refuse('invalid', 'This is for a car with nobody in it yet.')
        claim(db, c.id, args.p_first, user.id, 'pair placement', false, t)
        claim(db, c.id, args.p_second, user.id, null, false, t)
        Object.assign(c, { minor_override_reason: null, minor_override_by: null, minor_override_at: null })
        return { ok: true, riders: 2 }
      }))
    },
    hub_staff_remove_family: ({ args, db, user, now }) => {
      if (!isStaff(db, user?.id)) return staffOnly
      return answer(() => txn(db, () => removeFamily(db, args?.p_invite, user.id, nowMs(now))))
    },
  },
}
