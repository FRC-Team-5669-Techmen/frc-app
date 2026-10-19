// Fixture: sign-out requests and meeting check-in
// (supabase/migrations/0014_session_signout.sql, src/signout.js,
// src/SignoutsPage.jsx). Contract: src/dev/fixture/README.md. Plain data, no
// imports, no side effects.
//
// 0014 applied      the tag routes and the dashboard ask through
//                   request_signout; /signouts lists the requests; Riley holds
//                   signout.approve (a student approver), Sam does not.
// 0014 not applied  the tables and RPCs answer PGRST205 / PGRST202, the note
//                   columns are missing, and every page checks out with one
//                   tap as before.
//
// NOT MODELLED: the attendance_events_self_out trigger (fixture mode has no
// triggers), so a direct OUT a student writes here succeeds. The guard is
// proven by 0014_session_signout_rls_test.sql and mutants-0014.mjs. The
// handlers below mirror each SQL body's checks and writes.

const CAP = 'signout.approve'

function refuse(message, code = 'P0001') {
  return { data: null, error: { code, message, details: null, hint: null } }
}
const rows = (db, t) => db[t] ?? []
const iso = (now) => (now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now())).toISOString()

function canApprove(db, user, persona) {
  if (persona?.isStaff) return true
  return rows(db, 'profiles').some((p) => p.id === user?.id && p.approved === true)
    && rows(db, 'member_permissions').some((r) => r.member_id === user?.id && r.capability === CAP)
}
function newest(db, uid) {
  return rows(db, 'attendance_events').filter((e) => e.user_id === uid)
    .sort((a, b) => b.event_time.localeCompare(a.event_time))[0] ?? null
}
function approveOne(db, engine, user, id, now) {
  const req = rows(db, 'signout_requests').find((r) => r.id === id)
  if (!req) return refuse('Request not found', 'P0002')
  if (req.member_id === user.id) return refuse('You cannot approve your own sign-out', '42501')
  if (req.status !== 'pending') return { data: req, error: null }
  let outId = null
  if (newest(db, req.member_id)?.type === 'in') {
    outId = engine.insertRow('attendance_events', {
      user_id: req.member_id, type: 'out', location: req.location ?? 'approved', method: 'manual',
      note: req.note, cleanup_confirmed: req.cleanup_confirmed, event_time: iso(now),
    }).id
  }
  const [row] = engine.updateRows('signout_requests', (r) => r.id === id,
    { status: 'approved', decided_by: user.id, decided_at: iso(now), out_event_id: outId })
  return { data: row, error: null }
}

export default {
  migration: '0014',
  creates: {
    tables: ['signout_requests', 'meeting_checkins'],
    rpcs: ['request_signout', 'withdraw_signout', 'approve_signout', 'approve_all_signouts',
      'return_signout', 'meeting_checkin', 'can_approve_signouts', 'switch_to_fll'],
    columns: {
      attendance_events: ['note', 'cleanup_confirmed'],
      signout_requests: {
        member_id: { type: 'uuid' },
        in_event_id: { type: 'uuid' },
        note: { type: 'text' },
        cleanup_confirmed: { type: 'boolean', default: false },
        location: { type: 'text' },
        source: { type: 'text', default: 'nfc' },
        status: { type: 'text', default: 'pending' },
        requested_at: { type: 'timestamp with time zone' },
        decided_by: { type: 'uuid' },
        decided_at: { type: 'timestamp with time zone' },
        reason: { type: 'text' },
        out_event_id: { type: 'uuid' },
      },
      meeting_checkins: {
        event_id: { type: 'uuid' },
        member_id: { type: 'uuid' },
        scanned_at: { type: 'timestamp with time zone' },
        status: { type: 'text' },
      },
    },
  },

  seed: ({ ids }) => ({
    capabilities: [{
      key: CAP,
      label: 'Can approve sign-outs',
      description: 'Approve or send back other members\' sign-out requests. Never their own. Staff can already do this.',
    }],
    member_permissions: [{ member_id: ids.student2, capability: CAP, granted_by: ids.admin }],
  }),

  // The capability row and Riley's grant exist only once 0014 is pasted (it
  // seeds the row); seed rows land under every migration state, so they are
  // hidden here while 0014 is off. `applied` is the engine's migration check.
  visible: {
    capabilities: ({ row, applied }) => row.key !== CAP || applied('0014'),
    member_permissions: ({ row, applied }) => row.capability !== CAP || applied('0014'),
    signout_requests: ({ row, user, persona, db }) => row.member_id === user?.id || canApprove(db, user, persona),
    meeting_checkins: ({ row, user, persona }) => row.member_id === user?.id || !!persona?.isStaff,
  },

  rpcs: {
    can_approve_signouts: ({ db, user, persona }) => ({ data: canApprove(db, user, persona), error: null }),

    request_signout: ({ args, db, user, engine, now }) => {
      if (!user) return refuse('Not signed in', '42501')
      const note = String(args.p_note ?? '').trim()
      if (note.length < 3) return refuse('Write a short note of what you did', '22023')
      const last = newest(db, user.id)
      if (!last || last.type !== 'in') return refuse('You are not signed in', 'P0002')
      const open = rows(db, 'signout_requests').find((r) => r.member_id === user.id && r.status === 'pending')
      if (open) return { data: open, error: null }
      const row = engine.insertRow('signout_requests', {
        member_id: user.id, in_event_id: last.id, note, cleanup_confirmed: !!args.p_cleanup,
        location: args.p_location ?? null, source: args.p_source === 'button' ? 'button' : 'nfc',
        status: 'pending', requested_at: iso(now),
      })
      return { data: row, error: null }
    },

    withdraw_signout: ({ user, engine, now }) => ({
      data: engine.updateRows('signout_requests', (r) => r.member_id === user?.id && r.status === 'pending',
        { status: 'withdrawn', decided_at: iso(now) }).length,
      error: null,
    }),

    approve_signout: ({ args, db, user, persona, engine, now }) => {
      if (!canApprove(db, user, persona)) return refuse('Only a mentor or a permitted student can approve sign-outs', '42501')
      return approveOne(db, engine, user, args.p_request, now)
    },

    approve_all_signouts: ({ db, user, persona, engine, now }) => {
      if (!canApprove(db, user, persona)) return refuse('Only a mentor or a permitted student can approve sign-outs', '42501')
      const ids = rows(db, 'signout_requests')
        .filter((r) => r.status === 'pending' && r.member_id !== user.id)
        .sort((a, b) => a.requested_at.localeCompare(b.requested_at)).map((r) => r.id)
      for (const id of ids) approveOne(db, engine, user, id, now)
      return { data: ids.length, error: null }
    },

    return_signout: ({ args, db, user, persona, engine, now }) => {
      if (!canApprove(db, user, persona)) return refuse('Only a mentor or a permitted student can send a sign-out back', '42501')
      const reason = String(args.p_reason ?? '').trim() || null
      const [row] = engine.updateRows('signout_requests',
        (r) => r.id === args.p_request && r.status === 'pending' && r.member_id !== user.id,
        { status: 'returned', decided_by: user.id, decided_at: iso(now), reason })
      if (!row) return refuse('No pending request to send back', 'P0002')
      return { data: row, error: null }
    },

    meeting_checkin: ({ args, db, user, engine, now }) => {
      if (!user) return refuse('Not signed in', '42501')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev || ev.kind !== 'meeting') return refuse('Not a team meeting', 'P0002')
      const t = Date.parse(iso(now))
      if (t < Date.parse(ev.starts_at) || t > Date.parse(ev.ends_at)) return refuse('That meeting is not on now', '22023')
      const have = rows(db, 'meeting_checkins').find((m) => m.event_id === ev.id && m.member_id === user.id)
      if (have) return { data: have, error: null }
      const status = t <= Date.parse(ev.starts_at) + 15 * 60_000 ? 'present' : 'late'
      return { data: engine.insertRow('meeting_checkins', { event_id: ev.id, member_id: user.id, scanned_at: iso(now), status }), error: null }
    },

    switch_to_fll: ({ args, db, user, engine, now }) => {
      if (!user) return refuse('Not signed in', '42501')
      const last = newest(db, user.id)
      if (!last || last.type !== 'in' || (last.category ?? 'build') === 'volunteer') return refuse('No build session to switch from', 'P0002')
      const at = Math.max(Date.parse(iso(now)), Date.parse(last.event_time) + 1)
      const loc = args.p_location ?? 'fll-room'
      engine.insertRow('attendance_events', {
        user_id: user.id, type: 'out', location: loc, method: 'nfc', event_time: new Date(at).toISOString(),
        note: String(args.p_note ?? '').trim() || 'Switched to FLL',
      })
      const inRow = engine.insertRow('attendance_events', {
        user_id: user.id, type: 'in', location: loc, method: 'nfc', category: 'volunteer',
        geo_ok: args.p_geo_ok ?? null, event_time: new Date(at + 1).toISOString(),
      })
      engine.updateRows('signout_requests', (r) => r.member_id === user.id && r.status === 'pending',
        { status: 'withdrawn', decided_at: iso(now) })
      return { data: inRow.id, error: null }
    },
  },

}
