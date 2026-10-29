// Fixture: the shared pick board (supabase/migrations/0042_scouting_pick_board.sql,
// ledger 0032). A port of 0042's rules for browser workflows; the SQL is
// proven by 0042_scouting_pick_board_rls_test.sql.
//
// fixtureResults() is the stand-in for The Blue Alliance during a Beach
// Blitz qualification day: the 42 real 2026cabl teams (from the shipped
// season prior), 60 deterministic qualification matches with 2026 score
// breakdowns (HUB points, per-robot TOWER levels, RP). features/scouting.js
// answers a roster import for 2026cabl with it.
import prior from '../../../scouting/priors/2026cabl.json'

const rows = (db, name) => db[name] ?? []
const ok = (data) => ({ data, error: null })
const fail = (message, code = '22023') => ({ data: null, error: { message, code } })
const stamp = (now) => new Date(now).toISOString()
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent && rows(db, 'profiles').some(p => p.id === user.id && p.approved && p.status === 'active') && (persona?.isStaff || persona?.roles?.includes('student'))
const manages = (ctx, event) => eligible(ctx) && (ctx.persona?.isStaff
  || rows(ctx.db, 'event_roles').some(r => r.event_id === event && r.member_id === ctx.user.id && r.role === 'scouting_lead')
  || rows(ctx.db, 'member_permissions').some(r => r.member_id === ctx.user.id && r.capability === 'scouting.manage'))

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

/** The TBA stand-in: { teams, matches } in the scouting-import shape. */
export function fixtureResults({ played = 60, now = Date.now() } = {}) {
  const r = rng(5669)
  const teams = Object.keys(prior.teams).map(Number).sort((a, b) => a - b)
  const strength = new Map(teams.map(t => [t, Math.max(8, (prior.teams[t]?.total ?? 25) * (0.85 + 0.3 * r()))]))
  const level = s => (s > 150 ? 'Level3' : s > 80 ? 'Level2' : s > 40 ? 'Level1' : 'None')
  const towerPts = { Level1: 10, Level2: 20, Level3: 30, None: 0 }
  const matches = []
  let pool = []
  for (let n = 1; n <= 60; n++) {
    if (pool.length < 6) pool = [...pool, ...[...teams].sort(() => r() - 0.5).filter(t => !pool.includes(t))]
    const six = pool.splice(0, 6)
    const side = list => {
      const fuel = Math.round(list.reduce((s, t) => s + 0.8 * strength.get(t), 0) * (0.85 + 0.3 * r()))
      const bd = { hubScore: { totalPoints: fuel, totalCount: fuel }, foulPoints: 0 }
      list.forEach((t, i) => { const s = strength.get(t); bd[`endGameTowerRobot${i + 1}`] = r() < 0.85 ? level(s) : 'None'; bd[`autoTowerRobot${i + 1}`] = s > 120 && r() < 0.7 ? 'Level1' : 'None' })
      const tower = list.reduce((s, _, i) => s + towerPts[bd[`endGameTowerRobot${i + 1}`]] + (bd[`autoTowerRobot${i + 1}`] === 'Level1' ? 15 : 0), 0)
      return { teams: list, score: fuel + tower, bd }
    }
    const red = side(six.slice(0, 3)), blue = side(six.slice(3))
    const isPlayed = n <= played
    for (const [a, b] of [[red, blue], [blue, red]]) a.bd.rp = (a.score > b.score ? 3 : a.score === b.score ? 1 : 0) + (a.bd.hubScore.totalPoints >= 240 ? 1 : 0)
    matches.push({ key: `2026cabl_qm${n}`, teams: six, alliances: {
      red: { teams: red.teams, score: isPlayed ? red.score : -1, score_breakdown: isPlayed ? red.bd : null },
      blue: { teams: blue.teams, score: isPlayed ? blue.score : -1, score_breakdown: isPlayed ? blue.bd : null },
    }, videos: [], time: null })
  }
  const fetchedAt = stamp(now)
  return {
    teams: teams.map(t => ({ team_number: t, payload: { name: `Team ${t}`, source: 'tba', fetched_at: fetchedAt } })),
    matches, fetched_at: fetchedAt, event_key: '2026cabl',
    sources: [{ source: 'tba_teams', status: 'ok' }, { source: 'tba_matches', status: 'ok' }, { source: 'statbotics', status: 'unavailable' }],
  }
}

function boardJson(row) {
  return row ? { event_id: row.event_id, state: structuredClone(row.state), version: row.version, updated_at: row.updated_at } : null
}

export default {
  migration: '0042',
  creates: { tables: ['scouting_pick_board'], rpcs: ['scouting_pick_board_get', 'scouting_pick_board_save'] },
  visible: { scouting_pick_board: () => false },
  rpcs: {
    scouting_pick_board_get: (ctx) => {
      if (!eligible(ctx)) return fail('Scouting is available to approved student and staff accounts.', '42501')
      return ok(boardJson(rows(ctx.db, 'scouting_pick_board').find(r => r.event_id === ctx.args.p_event)))
    },
    scouting_pick_board_save: (ctx) => {
      const { args: a, db, engine, user, now } = ctx
      if (!manages(ctx, a.p_event)) return fail('Only scouting managers can change the pick board.', '42501')
      if (!rows(db, 'events').some(e => e.id === a.p_event && ['competition', 'training'].includes(e.kind))) return fail('Choose a competition or training event.')
      if (!['override', 'selection', 'matches', 'settings'].includes(a.p_section)) return fail('Unknown pick board section.')
      const v = a.p_value
      if (v != null && JSON.stringify(v).length > 400000) return fail('That is too much data for the pick board.')
      let row = rows(db, 'scouting_pick_board').find(r => r.event_id === a.p_event)
      if (!row) row = engine.insertRow('scouting_pick_board', { event_id: a.p_event, state: {}, version: 0, updated_at: stamp(now) })
      const st = structuredClone(row.state ?? {})
      if (a.p_section === 'override') {
        if (!Number.isInteger(a.p_team) || a.p_team < 1 || a.p_team > 99999) return fail('Name the team.')
        st.overrides = st.overrides ?? {}
        if (v == null) delete st.overrides[String(a.p_team)]
        else {
          if (typeof v !== 'object' || Array.isArray(v)) return fail('An override is an object.')
          if (Object.keys(v).some(k => !['flag', 'bump', 'note'].includes(k))) return fail('An override has flag, bump and note only.')
          if ('flag' in v && v.flag !== null && !['must', 'avoid'].includes(v.flag)) return fail('The flag is must or avoid.')
          if ('bump' in v && (typeof v.bump !== 'number' || v.bump < -30 || v.bump > 30)) return fail('A bump is -30 to 30 points.')
          if ('note' in v && (typeof v.note !== 'string' || v.note.length > 300)) return fail('A note is up to 300 characters.')
          st.overrides[String(a.p_team)] = { ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null)), by: user.id, at: stamp(now) }
        }
      } else if (a.p_section === 'selection') {
        if (!v || typeof v !== 'object' || !Array.isArray(v.seeds) || !Array.isArray(v.log)) return fail('The selection needs seeds and a log.')
        if (v.log.some(x => !x || !['pick', 'decline'].includes(x.type) || !['number', 'string'].includes(typeof x.team))) return fail('Each selection entry is a pick or a decline of one team.')
        const cur = Number(st.selection?.version ?? 0)
        if (a.p_expected == null || Number(a.p_expected) !== cur) return fail('Someone else changed the selection. Reload it, then record the pick again.', '40001')
        const { version: _drop, ...rest } = v
        st.selection = { ...rest, version: cur + 1, by: user.id, at: stamp(now) }
      } else if (a.p_section === 'matches') {
        if (!v || typeof v !== 'object' || !Array.isArray(v.matches)) return fail('Results are an object with a list of matches.')
        st.matches = { ...v, saved_by: user.id, saved_at: stamp(now) }
      } else {
        if (!v || typeof v !== 'object') return fail('Settings are an object.')
        if (Object.keys(v).some(k => !['event_key', 'our_team', 'rounds', 'alliances', 'want_defense'].includes(k))) return fail('Unknown pick board setting.')
        if ('rounds' in v && !(typeof v.rounds === 'number' && v.rounds >= 1 && v.rounds <= 4)) return fail('Rounds are 1 to 4.')
        st.settings = { ...(st.settings ?? {}), ...v }
      }
      const [updated] = engine.updateRows('scouting_pick_board', r => r.event_id === a.p_event, { state: st, version: row.version + 1, updated_at: stamp(now) })
      return ok(boardJson(updated))
    },
  },
}
