// Fixture-mode plugin for the feedback console and widget (lane c).
// Contract: src/dev/fixture/README.md. Dev only; nothing here reaches `dist/`.
//
// WHAT IT MODELS
//   migration 0002 (supabase/migrations/0002_feedback_console.sql): the two
//   columns it adds to `feedback` and its two admin RPCs. With `__fx_mig=none`
//   the engine answers a select naming `tried`/`build` with 42703, an insert
//   naming them with PGRST204, and either RPC with PGRST202 -- exactly what the
//   live project answers before 0002 is pasted -- so the console's "not set up
//   yet" state and the widget's insert ladder are reproducible.
//
// WHAT IT CANNOT MODEL, said so nobody reads a pass as more than it is:
//   the pre-0002 NOT NULL on `feedback.category` and the old status CHECK are
//   constraints, and the fake engine enforces none. So in `mig=none` an
//   untyped report saves with category null on the first retry instead of
//   taking the third rung to 'feedback'. That rung is covered by
//   tests/feedback-model.test.js against a fake that refuses with 23502.
//
// The seed is shared by both migration states, so every row carries a status
// from the PRE-0002 vocabulary (open / reviewed / dismissed). That is a real
// stored state either side of the migration (the old console keeps writing it
// until the new client ships), and the console reads it as New / Seen /
// Won't do. In progress, Done and Spam are reached by moving reports with the
// RPCs, which is the thing worth testing.

import { STATUSES, STORED_STATUSES, normStatus } from '../../../feedbackModel.js'

// Fictional, fixed fallbacks in case the core seed names its personas
// differently; a row whose member is unknown renders as "Member".
const FALLBACK = {
  admin:    '00000000-0000-4000-8000-00000000fa01',
  mentor:   '00000000-0000-4000-8000-00000000fb01',
  student:  '00000000-0000-4000-8000-00000000fc01',
  student2: '00000000-0000-4000-8000-00000000fc02',
  parent:   '00000000-0000-4000-8000-00000000fd01',
}
const personaId = (ids, key) => ids?.[key] ?? ids?.[`${key}Id`] ?? FALLBACK[key]

const FIXED_NOW = Date.parse('2026-10-01T19:00:00Z')
function nowMs(now) {
  if (now instanceof Date) return now.getTime()
  if (typeof now === 'number') return now
  const parsed = Date.parse(now)
  return Number.isNaN(parsed) ? FIXED_NOW : parsed
}

function isAdminPersona(persona) {
  if (!persona) return false
  if (typeof persona.isAdmin === 'boolean') return persona.isAdmin
  if (Array.isArray(persona.roles)) return persona.roles.includes('admin')
  return persona.key === 'admin' || persona.id === 'admin' || persona.name === 'admin'
}

// The store's feedback rows, in whichever of the two plain shapes the engine
// keeps them. Anything else is reported rather than guessed at.
function feedbackRows(db) {
  if (Array.isArray(db?.feedback)) return db.feedback
  if (Array.isArray(db?.tables?.feedback)) return db.tables.feedback
  return null
}

const refuse = (code, message) => ({ data: null, error: { code, message } })

// Mirrors public.feedback_set_status: admin checked first, only the six new
// statuses, rows already there (under either spelling) untouched, previous
// state returned.
function setStatus({ args, db, user, persona, now }) {
  const uid = user?.id ?? null
  if (!uid) return refuse('42501', 'You must be signed in.')
  if (!isAdminPersona(persona)) return refuse('42501', 'Only an admin can triage feedback.')
  const status = String(args?.p_status ?? '').trim().toLowerCase()
  if (!STATUSES.includes(status)) return refuse('22023', `Unknown feedback status "${args?.p_status}".`)
  const rows = feedbackRows(db)
  if (!rows) return refuse('XX000', 'fixture c: no feedback rows in the store')
  const ids = new Set(args?.p_ids ?? [])
  const at = new Date(nowMs(now)).toISOString()
  const out = []
  for (const r of rows) {
    if (!ids.has(r.id) || normStatus(r.status) === status) continue
    out.push({ id: r.id, previous_status: r.status, previous_reviewed_by: r.reviewed_by ?? null, previous_reviewed_at: r.reviewed_at ?? null })
    if (status === 'new') Object.assign(r, { status, reviewed_by: null, reviewed_at: null })
    else Object.assign(r, { status, reviewed_by: uid, reviewed_at: at })
  }
  return { data: out, error: null }
}

// Mirrors public.feedback_restore_status: exact restore, only on rows still
// in the status the move set.
function restoreStatus({ args, db, user, persona }) {
  if (!user?.id) return refuse('42501', 'You must be signed in.')
  if (!isAdminPersona(persona)) return refuse('42501', 'Only an admin can triage feedback.')
  const items = Array.isArray(args?.p_items) ? args.p_items : null
  if (!items) return refuse('22023', 'Expected an array of reports to restore.')
  if (items.some(i => !STORED_STATUSES.includes(i?.status))) return refuse('22023', 'An undo can only restore a known feedback status.')
  const rows = feedbackRows(db)
  if (!rows) return refuse('XX000', 'fixture c: no feedback rows in the store')
  const from = String(args?.p_from ?? '').trim().toLowerCase()
  const out = []
  for (const i of items) {
    const r = rows.find(x => x.id === i.id)
    if (!r || r.status !== from) continue
    Object.assign(r, { status: i.status, reviewed_by: i.reviewed_by ?? null, reviewed_at: i.reviewed_at ?? null })
    out.push({ id: r.id, status: r.status })
  }
  return { data: out, error: null }
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function seed({ ids, now }) {
  const base = nowMs(now)
  const ago = (days, hours = 0) => new Date(base - days * 86_400_000 - hours * 3_600_000).toISOString()
  const admin = personaId(ids, 'admin')
  const mentor = personaId(ids, 'mentor')
  const s1 = personaId(ids, 'student')
  const s2 = personaId(ids, 'student2')
  const id = n => `0c0c0c0c-0000-4000-8000-${String(n).padStart(12, '0')}`
  const report = (n, o) => ({
    id: id(n),
    image_paths: [],
    viewport: '390x844',
    user_agent: IPHONE,
    reviewed_by: null,
    reviewed_at: null,
    tried: null,
    build: null,
    ...o,
  })
  return {
    feedback: [
      // New (stored as the old 'open'), three types, one with screenshots.
      report(1, { member_id: admin, category: 'feedback', status: 'open', route: '/schedule', viewport: '1440x900', user_agent: DESKTOP,
        message: 'I should be able to send feedback without having to pick a type first.', created_at: ago(28, 3) }),
      report(2, { member_id: s1, category: 'bug', status: 'open', route: '/hours',
        message: 'My hours total for this week is two hours short.\n### this line starts like a heading\n-----',
        tried: 'Reloaded the page and checked My Hours on a laptop too.', build: 'abc1234',
        image_paths: [`report/${s1}/0c-fixture-1.png`, `report/${s1}/0c-fixture-2.png`], created_at: ago(5, 2) }),
      report(3, { member_id: s2, category: 'idea', status: 'open', route: '/jobs', user_agent: PIXEL,
        message: 'Could the jobs list sort by due date?', build: 'abc1234', created_at: ago(3, 6) }),
      report(4, { member_id: s1, category: null, status: 'open', route: '/schedule',
        message: 'The week view is hard to read on my phone.', build: 'def5678',
        image_paths: [`report/${s1}/0c-fixture-3.png`], created_at: ago(1, 1) }),
      // Seen (stored as the old 'reviewed'), stamped by the admin.
      report(5, { member_id: mentor, category: 'idea', status: 'reviewed', route: '/verify-hours', viewport: '1440x900', user_agent: DESKTOP,
        message: 'Let me approve logged hours in bulk.', reviewed_by: admin, reviewed_at: ago(9), created_at: ago(12) }),
      report(6, { member_id: s2, category: 'bug', status: 'reviewed', route: '/dashboard', user_agent: PIXEL,
        message: 'The dashboard flashed the wrong name for a second.', reviewed_by: admin, reviewed_at: ago(6), created_at: ago(8) }),
      // Won't do (stored as the old 'dismissed').
      report(7, { member_id: mentor, category: 'feedback', status: 'dismissed', route: '/display', viewport: '1920x1080', user_agent: DESKTOP,
        message: 'Make the presence board purple.', reviewed_by: admin, reviewed_at: ago(14), created_at: ago(15) }),
      report(8, { member_id: s2, category: 'feedback', status: 'dismissed', route: '/dashboard',
        message: 'asdf asdf', reviewed_by: admin, reviewed_at: ago(19), created_at: ago(20) }),
    ],
  }
}

const author = { local: 'member_id', foreign: 'id', table: 'profiles', one: true }
const reviewer = { local: 'reviewed_by', foreign: 'id', table: 'profiles', one: true }

export default {
  migration: '0002',
  creates: {
    rpcs: ['feedback_set_status', 'feedback_restore_status'],
    columns: { feedback: ['tried', 'build'] },
  },
  seed,
  rpcs: {
    feedback_set_status: setStatus,
    feedback_restore_status: restoreStatus,
  },
  // src/FeedbackPage.jsx embeds both profiles with aliases and FK hints:
  //   author:profiles!feedback_member_id_fkey(...), reviewer:profiles!feedback_reviewed_by_fkey(...)
  // Every spelling the contract allows for a key is listed, so whichever the
  // engine looks up resolves to the right column.
  relations: {
    'feedback.author': author,
    'feedback.feedback_member_id_fkey': author,
    'feedback.profiles': author,
    'feedback.reviewer': reviewer,
    'feedback.feedback_reviewed_by_fkey': reviewer,
  },
  // supabase/feedback.sql: select is is_admin() only. A member cannot read a
  // report back, their own included.
  visible: {
    feedback: ({ persona }) => isAdminPersona(persona),
  },
}
