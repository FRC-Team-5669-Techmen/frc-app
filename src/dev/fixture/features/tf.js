// Fixture-mode plugin for the overhaul audit's trivial fixes (lane tf).
// Contract: src/dev/fixture/README.md. Dev only; nothing here reaches `dist/`.
//
// No migration: every fix in the lane reads and writes what is already live,
// so both migration states see the same rows and the same UI.
//
// WHAT IT SEEDS, and what each row is for:
//   one open Mechanical job carrying two reference links, one https and one
//   javascript:. src/JobsPage.jsx renders a link's href only for http(s), so
//   in the job's detail the https link is a live <a href> and the javascript:
//   one is its label with NO href. The https link is the positive control:
//   without it, "no href" would also be what a detail that rendered no links
//   at all looks like.
//
// Everything else the lane's browser checks need is already in the core seed:
//   Una (persona `pending`, approved false, status active) for the approved-
//   only reads on /display, /dashboard and the parent dashboard; Morgan's
//   stale open session (c6, capped) for the service letter's '(capped)' mark.
//   That session is Build, so the mark shows only with Build ticked on the
//   letter: under the default Volunteer + Outreach, Morgan's letter is empty.

const JOB_ID = '7f5f0000-0000-4000-8000-000000000001'

export default {
  migration: null,
  creates: {},
  seed: ({ ids, now }) => {
    const t0 = now == null ? NaN : new Date(now).getTime()
    if (!Number.isFinite(t0)) return {}
    const at = (daysAgo) => new Date(t0 - daysAgo * 86_400_000).toISOString()
    return {
      tasks: [{
        id: JOB_ID,
        title: 'Check the bumper bracket drawing',
        subteam: 'Mechanical',
        status: 'open',
        max_claimants: 2,
        description: 'Compare the bumper bracket against the drawing before cutting. Two reference links below.',
        due_date: null,
        created_by: ids.mentor,
        created_at: at(3),
        updated_at: at(3),
        completed_at: null,
        links: [
          { label: 'Bracket drawing', url: 'https://example.com/bumper-bracket' },
          { label: 'Unsafe link', url: 'javascript:alert(1)' },
        ],
        images: [],
      }],
    }
  },
}
