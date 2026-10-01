// Fixture plugin: the IDEA certifications mirror (migration 0001, /certifications).
// Contract: src/dev/fixture/README.md. Plain data, no imports, no side effects.
//
// Two states, both driven by the engine's migration switch:
//   __fx_mig=all (or 0001)  the mirror is seeded below; the page renders the
//                           catalog, holder counts, your certifications /
//                           your student, and the staff sync readout.
//   __fx_mig=none           every table and the RPC answer PGRST205/PGRST202,
//                           and the page renders ONLY the not-synced line.
//
// Fictional people throughout. Holder rows are keyed by lowercased email, the
// same way the real mirror is, so the student persona's rows must carry the
// student persona's sign-in email. That email comes from the engine when it
// passes one (see emailFor); the defaults are only a fallback.

const DEFAULT_EMAILS = {
  student: 'student@fixture.techmen.test',
  student2: 'student2@fixture.techmen.test',
}

function emailFor(key, ctx) {
  const fromEngine = (ctx && ctx.emails && ctx.emails[key]) || (ctx && ctx.ids && ctx.ids.emails && ctx.ids.emails[key])
  return String(fromEngine || DEFAULT_EMAILS[key]).toLowerCase()
}

function clock(now) {
  if (typeof now === 'number') return now
  if (now instanceof Date) return now.getTime()
  const t = Date.parse(now)
  return Number.isFinite(t) ? t : Date.now()
}

// The student persona's rows, by serial. The parent persona is linked to the
// student persona, so these are exactly what a parent may read. Keyed by
// serial rather than email so the filter does not depend on what the engine
// passes to visible().
const STUDENT_SERIALS = new Set(['IDEA-FX-0001', 'IDEA-FX-0002', 'IDEA-FX-0003', 'IDEA-FX-0004'])

const DAY = 24 * 60 * 60 * 1000
const iso = (ms) => new Date(ms).toISOString()

// RLS model: a parent-only persona reads only their linked student's holder
// rows (the fixture parent is linked to the student persona); staff and
// members read every row. Same resolution as the app: staff wins over parent.
function isParentOnly(persona) {
  if (!persona || persona.isStaff) return false
  const roles = Array.isArray(persona.roles) ? persona.roles : []
  return persona.isParent === true || persona.key === 'parent' || roles.includes('parent')
}

const cert = (code, name, level, category, sort_order, extra = {}) => ({
  code, name, level, category, sort_order,
  definition: null, allows: null, does_not_allow: null,
  prerequisites: [], renewal: null, active: true,
  ...extra,
})

export default {
  migration: '0001',
  creates: {
    tables: ['idea_cert_catalog', 'idea_cert_holders', 'idea_cert_sync_log', 'idea_cert_sync_key'],
    rpcs: ['idea_cert_sync'],
  },

  seed: (ctx) => {
    const t = clock(ctx && ctx.now)
    const synced = iso(t - 2 * 60 * 60 * 1000)
    const student = emailFor('student', ctx)
    const student2 = emailFor('student2', ctx)

    const catalog = [
      cert('SAFE-1', 'Shop Safety', 1, 'Safety', 1, {
        definition: 'Knows the shop rules, the PPE for each station and the emergency stops.',
        allows: 'Working in the shop under supervision.',
        does_not_allow: 'Operating any powered machine.',
        renewal: 'Every school year.',
      }),
      cert('SAFE-2', 'Power Tool Safety', 2, 'Safety', 2, { prerequisites: ['SAFE-1'] }),
      cert('MECH-1', 'Hand Tools', 1, 'Mechanical', 10, { prerequisites: ['SAFE-1'] }),
      cert('MILL-2', 'Manual Mill Operator', 2, 'Machining', 20, {
        prerequisites: ['SAFE-1', 'MECH-1'],
        allows: 'Running the manual mill with a mentor in the room.',
      }),
      cert('WELD-3', 'Welding', 3, 'Machining', 25, { active: false }),
      cert('ELEC-1', 'Robot Wiring', 1, 'Electrical', 30),
    ].map(c => ({ ...c, synced_at: synced }))

    const h = (serial, email, holder_name, code, status, awardedDaysAgo, expiresInDays = null) => ({
      serial, email, holder_name, code, status,
      awarded_at: iso(t - awardedDaysAgo * DAY),
      awarded_by_name: 'Ms. Sample',
      expires_at: expiresInDays == null ? null : iso(t + expiresInDays * DAY),
      synced_at: synced,
    })

    const holders = [
      // The student persona: 2 held, 1 suspended, 1 lapsed (active but past
      // its expiry, so it must read Expired and not count).
      h('IDEA-FX-0001', student, 'Fixture Student One', 'SAFE-1', 'active', 30, 240),
      h('IDEA-FX-0002', student, 'Fixture Student One', 'MECH-1', 'active', 20),
      h('IDEA-FX-0003', student, 'Fixture Student One', 'MILL-2', 'suspended', 10),
      h('IDEA-FX-0004', student, 'Fixture Student One', 'SAFE-2', 'active', 400, -5),
      // The second student persona: 1 held, 1 revoked, 1 expired.
      h('IDEA-FX-0005', student2, 'Fixture Student Two', 'SAFE-1', 'active', 25),
      h('IDEA-FX-0006', student2, 'Fixture Student Two', 'ELEC-1', 'revoked', 15),
      h('IDEA-FX-0007', student2, 'Fixture Student Two', 'MECH-1', 'expired', 300),
      // Bosco Tech students with no account in this app: holders need none.
      h('IDEA-FX-0008', 'alex.fixture@example.invalid', 'Alex Fixture', 'SAFE-1', 'active', 40),
      h('IDEA-FX-0009', 'alex.fixture@example.invalid', 'Alex Fixture', 'MILL-2', 'active', 12),
      h('IDEA-FX-0010', 'morgan.fixture@example.invalid', 'Morgan Fixture', 'WELD-3', 'active', 90),
    ]

    return {
      idea_cert_catalog: catalog,
      idea_cert_holders: holders,
      idea_cert_sync_log: [
        { id: 1, received_at: synced, source_revision: 'fixture-rev-41', catalog_count: catalog.length,
          holder_count: holders.length, ok: true, error: null },
        { id: 2, received_at: iso(t - 60 * 60 * 1000), source_revision: 'fixture-rev-42', catalog_count: 6,
          holder_count: 11, ok: false,
          error: '1 problem(s): holders[10] (IDEA-FX-0011): code NOPE-1 is not in this snapshot\'s catalog' },
      ],
      idea_cert_sync_key: [],
    }
  },

  // The page never calls the sync. A call here models a wrong secret: the
  // fixture has none, so the generic refusal is the honest answer.
  rpcs: {
    idea_cert_sync: () => ({ data: null, error: { code: '28000', message: 'idea_cert_sync: refused' } }),
  },

  visible: {
    idea_cert_holders: ({ row, persona }) =>
      !isParentOnly(persona) || STUDENT_SERIALS.has(row.serial),
    idea_cert_sync_log: ({ persona }) => !!(persona && persona.isStaff),
    idea_cert_sync_key: () => false,
  },
}
