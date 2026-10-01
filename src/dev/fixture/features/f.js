// Fixture: per-member capabilities (supabase/migrations/0004_member_permissions.sql)
// -- "Can add calendar events" on the admin roster, and what that unlocks on
// /schedule. Contract: src/dev/fixture/README.md. Imports nothing, does nothing
// at import time.
//
// Personas this fixture gives a role to:
//   student  HOLDS 'events.create' (granted by admin): sees "+ New event", and
//            Edit/Delete on the events they added that are not mandatory
//   student2 holds nothing: the schedule exactly as before the feature
//   mentor   staff: everything, as today, with no grant row at all
//   admin    the roster's Permissions row can grant / revoke
//
// With migration 0004 switched OFF (`__fx_mig=none`), member_permissions,
// capabilities and the three RPCs answer as missing (PGRST205 / PGRST202):
// the roster row must read "Not set up yet" and the student's schedule must
// look exactly like student2's.
//
// What the fake engine cannot model, said so nobody reads a pass as more: the
// three holder policies on public.events (the engine enforces no RLS on
// writes), so neither "a holder's event cannot join somebody else's series"
// nor the created_by / mandatory pins are exercised here -- the UI never sends
// a write that would hit them, and 0004_member_permissions_rls_test.sql
// proves them. has_capability() below does mirror the approval rule, reading
// the persona's profile from the store as the SQL reads profiles.approved.

const CAP = 'events.create'
const H = 3600 * 1000

// Fixed ids so a browser test can find these rows.
export const F_IDS = Object.freeze({
  evStudent:   'f0000000-0000-4000-8000-000000000001', // added by student: student may edit
  evMentor:    'f0000000-0000-4000-8000-000000000002', // added by mentor: student may not
  evSeriesA:   'f0000000-0000-4000-8000-000000000003', // student's two-event series
  evSeriesB:   'f0000000-0000-4000-8000-000000000004',
  evMandatory: 'f0000000-0000-4000-8000-000000000005', // student's, later made mandatory by staff
  series:      'f0000000-0000-4000-8000-0000000000aa',
})

function ms(now) {
  if (now instanceof Date) return now.getTime()
  const n = Number(now)
  return Number.isFinite(n) ? n : Date.now()
}
const iso = t => new Date(t).toISOString()

function event(id, title, kind, startMs, hours, createdBy, extra = {}) {
  return {
    id, title, kind,
    starts_at: iso(startMs), ends_at: iso(startMs + hours * H),
    location: 'Shop', notes: null,
    created_by: createdBy,
    created_at: iso(startMs - 72 * H), updated_at: iso(startMs - 72 * H),
    rsvp_enabled: false, capacity: null, series_id: null, mandatory: false,
    ...extra,
  }
}

// The engine's store shape is not pinned by the README; accept the plausible
// ones rather than guess one. Returns the live array for `name`.
function rows(db, name) {
  if (db && typeof db.table === 'function') return db.table(name)
  const store = db && typeof db.tables === 'object' && db.tables ? db.tables : db
  if (!Array.isArray(store[name])) store[name] = []
  return store[name]
}

function isAdmin(persona) {
  if (!persona) return false
  if (typeof persona.isAdmin === 'boolean') return persona.isAdmin
  if (Array.isArray(persona.roles)) return persona.roles.includes('admin')
  return persona.key === 'admin' || persona.name === 'admin' || persona.id === 'admin'
}

const denied = () => ({
  data: null,
  error: { code: '42501', message: 'Permission denied: admin role required', details: null, hint: null },
})

export default {
  migration: '0004',
  creates: {
    tables: ['capabilities', 'member_permissions'],
    rpcs: ['has_capability', 'admin_grant_capability', 'admin_revoke_capability'],
  },

  seed: ({ ids, now }) => {
    const t = ms(now)
    const day = 24 * H
    return {
      capabilities: [{
        key: CAP,
        label: 'Can add calendar events',
        description: 'Add events to the team schedule, and edit or delete the events they added. Cannot mark an event mandatory. Staff can already do all of this.',
        created_at: iso(t - 30 * day),
      }],
      member_permissions: [
        { member_id: ids.student, capability: CAP, granted_by: ids.admin, granted_at: iso(t - 3 * day) },
      ],
      events: [
        event(F_IDS.evStudent, 'CAD design review (student-run)', 'meeting', t + 1 * day + 2 * H, 2, ids.student,
          { notes: 'Added by a student with calendar permission.' }),
        event(F_IDS.evMentor, 'Build session', 'build', t + 2 * day + 2 * H, 3, ids.mentor),
        event(F_IDS.evSeriesA, 'Scouting practice', 'training', t + 3 * day + 2 * H, 1, ids.student,
          { series_id: F_IDS.series }),
        event(F_IDS.evSeriesB, 'Scouting practice', 'training', t + 10 * day + 2 * H, 1, ids.student,
          { series_id: F_IDS.series }),
        event(F_IDS.evMandatory, 'Team photo', 'meeting', t + 4 * day + 2 * H, 1, ids.student,
          { mandatory: true, notes: 'A student added it; staff made it mandatory, so only staff can change it now.' }),
      ],
    }
  },

  rpcs: {
    // Mirrors public.has_capability(): staff, or an APPROVED holder.
    has_capability: ({ args, db, user, persona }) => ({
      data: !!persona?.isStaff || (
        rows(db, 'profiles').some(p => p.id === user?.id && p.approved === true)
        && rows(db, 'member_permissions')
          .some(r => r.member_id === user?.id && r.capability === args?.p_capability)),
      error: null,
    }),

    admin_grant_capability: ({ args, db, user, persona, now }) => {
      if (!isAdmin(persona)) return denied()
      if (!rows(db, 'capabilities').some(c => c.key === args?.p_capability)) {
        return { data: null, error: { code: '22023', message: `Unknown capability: ${args?.p_capability}` } }
      }
      const grants = rows(db, 'member_permissions')
      if (!grants.some(r => r.member_id === args.p_member && r.capability === args.p_capability)) {
        grants.push({
          member_id: args.p_member, capability: args.p_capability,
          granted_by: user?.id ?? null, granted_at: iso(ms(now)),
        })
      }
      return { data: null, error: null }
    },

    admin_revoke_capability: ({ args, db, persona }) => {
      if (!isAdmin(persona)) return denied()
      const grants = rows(db, 'member_permissions')
      for (let i = grants.length - 1; i >= 0; i--) {
        if (grants[i].member_id === args?.p_member && grants[i].capability === args?.p_capability) grants.splice(i, 1)
      }
      return { data: null, error: null }
    },
  },

  // RLS "member_permissions read own or staff".
  visible: {
    member_permissions: ({ row, user, persona }) => !!persona?.isStaff || row.member_id === user?.id,
  },
}
