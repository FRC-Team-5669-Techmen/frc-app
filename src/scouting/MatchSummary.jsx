import { fmtMedian, fmtRate, towerLabel } from './match'

// Per-team match numbers from CONFIRMED current observations (match.js
// teamMatchSummary). Every figure carries how many matches it rests on; a
// figure with no recorded matches reads "--", never 0.
export default function MatchSummary({ s, compact = false }) {
  if (!s) return null
  if (!s.matches) return <p className="sc-help sc-match-none">No match fields recorded yet for this team.</p>
  const cells = [
    ['Median FUEL', fmtMedian(s.totalFuel), `${s.totalFuel.n} match${s.totalFuel.n === 1 ? '' : 'es'}`],
    ['Auto FUEL', fmtMedian(s.auto_fuel), `n ${s.auto_fuel.n}`],
    ['Teleop FUEL', fmtMedian(s.teleop_fuel), `n ${s.teleop_fuel.n}`],
    ['Best TOWER', towerLabel(s.tower.best), `median ${towerLabel(s.tower.median)} · n ${s.tower.n}`],
    ['Trouble', fmtRate(s.troubleRate), `${s.troubleRate.bad}/${s.troubleRate.n} died, tipped, stuck or broke`],
    ['Driver', fmtMedian(s.driver_skill), `of 5 · n ${s.driver_skill.n}`],
    ['Defense', fmtRate(s.defense), s.defense.n ? `played in ${s.defense.played}/${s.defense.n} · rated ${fmtMedian(s.defense_rating)}` : 'n 0'],
    ['Shuttled', fmtRate(s.shuttled), `${s.shuttled.yes}/${s.shuttled.n} matches`],
  ]
  return <div className={`sc-match-summary${compact ? ' sc-match-compact' : ''}`} aria-label={`Match numbers for team ${s.team}`}>
    <div className="sc-match-grid">{(compact ? cells.slice(0, 4).concat([cells[4]]) : cells).map(([label, value, sub]) =>
      <div key={label} className="sc-match-cell"><span className="sc-match-label">{label}</span><strong className="sc-match-value">{value}</strong><span className="sc-match-sub">{sub}</span></div>)}</div>
    <p className="sc-help">{s.matches} scouted match{s.matches === 1 ? '' : 'es'} with match fields · confirmed, current event only · one value per match · missed {fmtMedian(s.teleop_missed)} median{s.auto_climb.n ? ` · auto climb ${s.auto_climb.yes}/${s.auto_climb.n}` : ''}{s.died.disputed + s.stuck.disputed ? ' · some reliability answers disputed' : ''}</p>
    {!compact && !!s.fouls.notes.length && <details><summary>Fouls and cards ({s.fouls.notes.length})</summary><ul className="sc-fouls">{s.fouls.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}
  </div>
}
