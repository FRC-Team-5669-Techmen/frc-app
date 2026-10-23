// Fixture: answers to feedback (supabase/migrations/0024_feedback_inbox.sql,
// part C). Contract: src/dev/fixture/README.md. Plain data, no imports, no
// side effects. A test-only PORT of feedback_reply, feedback_replies_for and
// my_feedback, so the console and the widget can be driven in a browser; the
// rule is the SQL, proven by 0024_feedback_inbox_rls_test.sql.
//
// NOT MODELLED: 0024's two triggers (fixture mode has no triggers), so a
// send-back or an access request writes no notice or mail here. The answer's
// notice and email are written by the handler, as the SQL function does.

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const iso = (now) => (now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now())).toISOString()
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const nameOf = (db, id) => {
  const p = rows(db, 'profiles').find((x) => x.id === id)
  return (p?.nickname || '').trim() || (p?.full_name || '').trim() || 'Admin'
}

export default {
  migration: '0024',
  creates: {
    tables: ['feedback_replies'],
    rpcs: ['feedback_reply', 'feedback_replies_for', 'my_feedback'],
  },
  // RLS on, no policy and no client grant: nobody reads the table directly.
  visible: { feedback_replies: () => false },
  rpcs: {
    feedback_reply: ({ args, db, user, persona, engine, now }) => {
      if (!persona?.isAdmin) return refuse('Only an admin can answer feedback', '42501')
      const body = String(args?.p_body ?? '').trim()
      if (!body || body.length > 2000) return refuse('Write an answer of up to 2000 characters', '22023')
      const f = rows(db, 'feedback').find((x) => x.id === args?.p_feedback)
      if (!f) return refuse('No such report', 'P0002')
      const r = engine.insertRow('feedback_replies', { feedback_id: f.id, author_id: user.id, body, created_at: iso(now) })
      // 'open' is the pre-0002 spelling of new that the core seed still carries.
      if (f.status === 'new' || f.status === 'open') engine.updateRows('feedback', (x) => x.id === f.id, { status: 'seen', reviewed_by: user.id, reviewed_at: iso(now) })
      if (f.member_id && f.member_id !== user.id && Array.isArray(db.member_notices)) {
        engine.insertRow('member_notices', { member_id: f.member_id, kind: 'feedback_reply', title: 'Answer to your feedback', body, created_by: user.id })
      }
      return { data: { id: r.id, feedback_id: f.id, body, created_at: r.created_at }, error: null }
    },
    feedback_replies_for: ({ args, db, persona }) => {
      if (!persona?.isAdmin) return refuse('Only an admin can read the inbox', '42501')
      const ids = args?.p_ids ?? []
      return {
        data: rows(db, 'feedback_replies').filter((r) => ids.includes(r.feedback_id))
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .map((r) => ({ id: r.id, feedback_id: r.feedback_id, body: r.body, created_at: r.created_at, author: nameOf(db, r.author_id) })),
        error: null,
      }
    },
    my_feedback: ({ db, user }) => {
      if (!user) return { data: [], error: null }
      const mine = rows(db, 'feedback').filter((f) => f.member_id === user.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50)
      return {
        data: mine.map((f) => ({
          id: f.id, created_at: f.created_at, route: f.route, category: f.category, message: String(f.message ?? '').slice(0, 600), status: f.status,
          replies: rows(db, 'feedback_replies').filter((r) => r.feedback_id === f.id)
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((r) => ({ body: r.body, created_at: r.created_at })),
        })),
        error: null,
      }
    },
  },
}
