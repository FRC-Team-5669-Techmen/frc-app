import { CAPABILITIES, reliability } from './model'
import { readableOptions, optionSummary, summaryText, choiceAnswers } from './options'
import { byDifference, sharedText } from './spread'

// The team card's evidence, ordered by what tells robots apart (feedback
// 449543dd). Answers that vary between observed robots come first with a
// "Varies by robot" mark; answers not yet compared (fewer than two robots)
// follow; answers every observed robot shares fold into one line each under
// "Same for every robot observed so far". Nothing is dropped: every shared
// line still shows this robot's own figure and pit claim, and a robot with no
// evidence reads "No evidence yet", never 0.
const UNKNOWN = { state: 'unknown', teams: 0, value: null }

export default function TeamEvidence({ team, records, options, spread, pitClaim }) {
  const opts = byDifference(readableOptions(options).map(o => ({ o, spread: spread?.options?.[o.key] ?? UNKNOWN })))
  const caps = byDifference(CAPABILITIES.map(c => ({ c, spread: spread?.capabilities?.[c.key] ?? UNKNOWN })))
  const shownOpts = opts.filter(x => x.spread.state !== 'shared'), shownCaps = caps.filter(x => x.spread.state !== 'shared')
  const shared = [
    ...opts.filter(x => x.spread.state === 'shared').map(({ o, spread: sp }) => {
      const s = optionSummary(records, team, o)
      const valueLabel = o.type === 'choice' ? choiceAnswers(o).find(([v]) => v === sp.value)?.[1] : o.type === 'yesno' ? null : `median ${sp.value}`
      return { key: `o:${o.key}`, label: o.label, line: sharedText(sp, { yesno: o.type === 'yesno', valueLabel }), mine: s.n ? summaryText(o, s) : 'No evidence yet' }
    }),
    ...caps.filter(x => x.spread.state === 'shared').map(({ c, spread: sp }) => {
      const r = reliability(records, team, c.key)
      return { key: `c:${c.key}`, label: c.label, line: sharedText(sp), mine: `${r.denominator ? `${r.yes}/${r.denominator} observed matches` : 'No evidence yet'} · ${pitClaim(c.key)}` }
    }),
  ]
  const varies = <span className="sc-varies">Varies by robot</span>
  return <>
    {shownOpts.length > 0 && <dl className="sc-option-summary" data-option-summary>{shownOpts.map(({ o, spread: sp }) => <div key={o.key} data-evidence-key={o.key} data-spread={sp.state}><dt>{o.label}{sp.state === 'varies' && varies}</dt><dd>{summaryText(o, optionSummary(records, team, o))}</dd></div>)}</dl>}
    {shownCaps.length > 0 && <div className="sc-evidence-grid">{shownCaps.map(({ c, spread: sp }) => { const r = reliability(records, team, c.key); return <div className="sc-evidence" key={c.key} data-evidence-key={c.key} data-spread={sp.state}><h4>{c.label}{sp.state === 'varies' && varies}</h4><span className="sc-help">{pitClaim(c.key)}</span><div className="sc-ratio">{r.percent === null ? 'No evidence' : `${Math.round(r.percent)}%`}<span>{r.yes}/{r.denominator} observed matches</span></div><p className="sc-help">{r.sufficient ? '3+ observed matches' : 'Provisional: fewer than 3 observed matches'}{r.disputed ? ` · ${r.disputed} disputed` : ''}</p><details><summary>Count details</summary><p className="sc-help">{r.no} observed failures. Excluded scout responses: {r.didNotSee} did not see, {r.notApplicable} not applicable, {r.missing} unanswered. Disputed matches are excluded.</p></details></div> })}</div>}
    {shared.length > 0 && <details className="sc-shared" data-shared-evidence><summary>Same for every robot observed so far ({shared.length})</summary>
      <p className="sc-help">These answers do not tell robots apart yet. Each moves back up as soon as a robot answers differently.</p>
      <ul className="sc-shared-list">{shared.map(x => <li key={x.key} data-evidence-key={x.key.slice(2)} data-spread="shared"><strong>{x.label}</strong><span>{x.line}</span><span className="sc-help">This robot: {x.mine}</span></li>)}</ul>
    </details>}
  </>
}
