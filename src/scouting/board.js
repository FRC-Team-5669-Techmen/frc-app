// The pick board's whole computation in one place (ledger 0032), so the
// page (PickBoard.jsx) and the connector's pick_board tool can never give
// different answers. Pure: everything comes in as arguments.
import { aggregatePickLists } from './model.js'
import { teamMatchSummary } from './match.js'
import { superSummary } from './superscout.js'
import { boardOrder, dataRatings, roleScore, scoutSignals, teamValue } from './pickRank.js'
import { allianceOf, availability, onClock, picksUntilOurs, pickable, replay } from './draft.js'

export const OUR_TEAM = 5669

/** Teams, names and the season prior the board ranks from. */
export function boardInputs({ state = {}, records = [], prior = null }) {
  const matches = state.matches?.matches ?? []
  const names = new Map()
  for (const t of state.matches?.teams ?? []) names.set(Number(t.n), t.name)
  for (const r of records) if (r.kind === 'team' && r.payload?.name) names.set(r.team_number, r.payload.name)
  const s = new Set()
  for (const r of records) if (r.kind === 'team' && r.team_number) s.add(r.team_number)
  for (const t of state.matches?.teams ?? []) s.add(Number(t.n))
  for (const m of matches) for (const t of [...(m.red?.teams ?? []), ...(m.blue?.teams ?? [])]) s.add(Number(t))
  if (prior?.teams && !s.size) for (const k of Object.keys(prior.teams)) s.add(Number(k))
  const teams = [...s].filter(n => Number.isInteger(n) && n > 0).sort((a, b) => a - b)
  const priorMap = new Map()
  for (const [k, v] of Object.entries(prior?.teams ?? {})) if (typeof v?.total === 'number') priorMap.set(Number(k), { total: v.total, source: 'season' })
  // Statbotics EPA, when the import got one, is a better season number.
  for (const t of state.matches?.teams ?? []) if (typeof t.epa === 'number') priorMap.set(Number(t.n), { total: t.epa, source: 'statbotics' })
  return { teams, names, priorMap, matches }
}

/** The live selection replayed from its log, or null before it starts. */
export function draftFrom(selection) {
  if (!selection?.seeds?.length) return { setup: null, draft: null }
  const setup = { seeds: selection.seeds.map(Number), rounds: Number(selection.rounds) || 3, alliances: Number(selection.alliances) || 8 }
  return { setup, draft: replay(setup, (selection.log ?? []).map(a => ({ ...a, team: Number(a.team) }))) }
}

/** One row per team: value, why, and the score for OUR alliance. */
export function rankRows({ teams, matches, priorMap, records, names, draft = null, ourTeam = OUR_TEAM, wantDefense = false }) {
  const data = dataRatings(teams, matches, priorMap)
  const votes = new Map(aggregatePickLists(records).map(v => [v.team, v]))
  const base = teams.map(t => {
    const s = scoutSignals({ match: teamMatchSummary(records, t), superS: superSummary(records, t), vote: votes.get(t) })
    return { id: t, name: names.get(t) ?? '', data: data.get(t), signals: s, ...teamValue(data.get(t), s) }
  })
  const valueOf = new Map(base.map(r => [r.id, r.value]))
  const ours = draft ? draft.alliances[allianceOf(draft, ourTeam)] ?? [ourTeam] : [ourTeam]
  const members = ours.map(t => valueOf.get(t)).filter(v => typeof v === 'number')
  return base.map(r => ({ ...r, score: roleScore(r.value, members, { defense: r.signals.defense, wantDefense }) }))
}

/** Chance each team is still there at our next pick (null when we do not pick again). */
export function boardOdds(draft, rows, ourTeam = OUR_TEAM, runs = 300) {
  if (!draft) return null
  return availability(draft, new Map(rows.filter(r => r.id !== ourTeam).map(r => [r.id, r.value])), ourTeam, { runs })
}

/** Everything a reader needs: the order, the clock, our next pick. */
export function boardView({ state = {}, records = [], prior = null }) {
  const settings = state.settings ?? {}
  const ourTeam = Number(settings.our_team) || OUR_TEAM
  const { teams, names, priorMap, matches } = boardInputs({ state, records, prior })
  const { draft } = draftFrom(state.selection)
  const rows = rankRows({ teams, matches, priorMap, records, names, draft, ourTeam, wantDefense: !!settings.want_defense })
  const overrides = state.overrides ?? {}
  const autoRank = new Map(boardOrder(rows, {}).map((r, i) => [r.id, i + 1]))
  const ordered = boardOrder(rows, overrides)
  const odds = boardOdds(draft, rows, ourTeam)
  const clock = draft ? onClock(draft) : null
  const until = draft ? picksUntilOurs(draft, ourTeam) : null
  const available = id => !draft || pickable(draft, id)
  return { ourTeam, teams, names, matches, rows, ordered, overrides, autoRank, draft, clock, until, odds, available,
    played: matches.filter(m => m.level === 'qm' && m.red?.score != null).length }
}
