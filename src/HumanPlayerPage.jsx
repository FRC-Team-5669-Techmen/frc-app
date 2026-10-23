import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { resolveCurrentSeason } from './seasons'
import { PHASES, MATCH_SECONDS, matchState, cueTimes, fmtClock } from './matchSim'
import { useCues } from './matchCues'
import {
  HP_RULES, DRILLS, DEFAULT_SHOTS, DEFAULT_RATE_SECONDS, leaderboard, inSeason, laDate, drillLabel,
  attemptValue, fmtValue, attemptProblem, needsText, isFullRun,
} from './humanPlayerScore'
import './BatteriesPage.css'
import './MatchSim.css'
import './HumanPlayer.css'

// The human player leaderboard (migration 0033, ledger 0025). Three drills,
// every attempt logged. Every write is a database function through writeVia
// with NO direct fallback: before 0033 is applied the page reads "not set up
// yet", and a write that finds no function is reported as not set up, never
// as saved. The Human Player Score is computed in src/humanPlayerScore.js and
// only there; the match run uses the simulator clock in src/matchSim.js.

const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const todayLA = () => laDate(new Date().toISOString())
const other = (a) => (a === 'red' ? 'blue' : 'red')
const pct = (x) => `${Math.round(x * 100)}%`

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The human player leaderboard is not set up yet. Nothing was saved.' }
  return r.data
}

/** An attempt as one line: "15 of 20", "18 in 30 s (0.60/s)", "31 active · 4 inactive · 9 missed". */
function attemptLine(x) {
  const missed = x.attempted - x.made - (x.made_inactive ?? 0)
  if (x.drill === 'accuracy') return `${x.made} of ${x.attempted} (${pct(x.made / x.attempted)})`
  if (x.drill === 'rate') return `${x.made} in ${x.seconds} s · ${missed} missed (${fmtValue('rate', x.made / x.seconds)})`
  return `${x.made} active · ${x.made_inactive} inactive · ${missed} missed${isFullRun(x) ? '' : ' · partial run'}`
}

export default function HumanPlayerPage({ session, hasRole = () => false }) {
  const uid = session?.user?.id
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const [s, setS] = useState({ loading: true })
  const [seasonId, setSeasonId] = useState(null)
  const [msg, setMsg] = useState('')
  const [openId, setOpenId] = useState(null)
  const [live, setLive] = useState(null) // { drill, member, config }
  const [result, setResult] = useState(null) // what a live run counted, handed to the form
  const formRef = useRef(null)

  const load = useCallback(async () => {
    const [at, se] = await Promise.all([
      supabase.from('hp_attempts').select('*').order('attempt_date', { ascending: false }).limit(5000),
      supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: false }),
    ])
    if (at.error) { setS({ loading: false, missing: isSchemaMissing(at.error), error: isSchemaMissing(at.error) ? null : at.error }); return }
    const ids = new Set((at.data ?? []).map((x) => x.member_id))
    if (uid) ids.add(uid)
    let roster = []
    if (isStaff) {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('id, full_name, nickname, approved, status'),
        supabase.from('member_roles').select('member_id, role').in('role', ['student', 'mentor', 'lead', 'admin']),
      ])
      const can = new Set((r.data ?? []).map((x) => x.member_id))
      roster = (p.data ?? []).filter((x) => x.approved && (x.status ?? 'active') === 'active' && can.has(x.id))
        .map((x) => ({ id: x.id, name: displayName(x) })).sort((a, b) => a.name.localeCompare(b.name))
      for (const m of roster) ids.delete(m.id)
    }
    const p = ids.size ? await supabase.from('profiles').select('id, full_name, nickname').in('id', [...ids]) : { data: [] }
    const names = new Map([...roster.map((m) => [m.id, m.name]), ...(p.data ?? []).map((x) => [x.id, displayName(x)])])
    const seasons = se.data ?? []
    setS({ loading: false, attempts: at.data ?? [], seasons, names, roster })
    setSeasonId((cur) => cur ?? (resolveCurrentSeason(seasons)?.id ?? 'all'))
  }, [uid, isStaff])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  const season = useMemo(() => (s.seasons ?? []).find((x) => x.id === seasonId) ?? null, [s.seasons, seasonId])
  const nameOf = useCallback((id) => s.names?.get(id) ?? '', [s.names])
  const board = useMemo(() => (s.attempts ? leaderboard(s.attempts, season, nameOf) : { ranked: [], unranked: [], teamBest: {} }), [s.attempts, season, nameOf])

  const head = (title) => <h1 className="ba-title">{title}</h1>
  if (parentOnly) return <main className="ba-wrap">{head('Human player')}<p className="ba-muted">The human player leaderboard is for students and staff.</p><Link className="ba-link" to="/dashboard">Back to Home</Link></main>
  if (s.loading) return <main className="ba-wrap">{head('Human player')}<p className="ba-muted" role="status">Loading the human player leaderboard…</p></main>
  if (s.missing) return <main className="ba-wrap hp-wrap"><Link className="ba-back" to="/robot">← Robot</Link>{head('Human player')}<div className="ba-empty"><h2>Not set up yet</h2><p>The human player leaderboard starts when migration 0033 is applied. Everything else in the app works as before.</p></div></main>
  if (s.error) return <main className="ba-wrap">{head('Human player')}<p className="ba-error" role="alert">{errText(s.error)}</p><button className="ba-btn" onClick={load}>Try again</button></main>

  if (live) return <LiveRun {...live} name={nameOf(live.member) || 'Me'} onAbort={() => setLive(null)}
    onDone={(r) => { setResult({ ...r, drill: live.drill, member: live.member, key: Date.now() }); setLive(null); setMsg('Run over. Check the counts and save it.'); setTimeout(() => formRef.current?.scrollIntoView({ block: 'start' }), 0) }} />

  const mine = s.attempts.filter((x) => x.member_id === uid && inSeason(x.attempt_date, season))
  const counted = s.attempts.filter((x) => !x.voided_at && inSeason(x.attempt_date, season))
  const me = board.ranked.find((r) => r.id === uid)
  const opened = openId ? { id: openId, name: nameOf(openId) || 'Member', row: [...board.ranked, ...board.unranked].find((r) => r.id === openId) } : null
  const after = async (text) => { setMsg(text); setResult(null); await load() }

  return (
    <main className="ba-wrap hp-wrap" data-page="human-player">
      <Link className="ba-back" to="/robot">← Robot</Link>
      <header className="ba-head">
        <div>
          <span className="ba-eyebrow">Drive team</span>
          <h1 className="ba-title">Human player</h1>
          <p className="ba-sub">Accuracy, rate and full match runs on the real clock. One Human Player Score per season, built to predict who scores the most FUEL at a competition.</p>
        </div>
        <div className="ba-head-actions">
          <button className="ba-primary" onClick={() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); formRef.current?.querySelector('button')?.focus({ preventScroll: true }) }}>Log an attempt</button>
        </div>
      </header>

      <div className="hp-bar">
        <label className="ba-field hp-season"><span>Season</span>
          <select value={seasonId ?? 'all'} onChange={(e) => setSeasonId(e.target.value)} aria-label="Season">
            {s.seasons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="all">All time</option>
          </select>
        </label>
        <div className="ba-tally hp-tally" aria-label="Season summary">
          <span><b className="hud-tnum">{board.ranked.length}</b> ranked</span>
          <span><b className="hud-tnum">{counted.length}</b> attempts</span>
          <span><b className="hud-tnum">{fmtValue('match', board.teamBest.match)}</b> team best match</span>
          {me && <span className="hp-tally-me"><b className="hud-tnum">#{me.rank}</b> you</span>}
        </div>
      </div>
      {msg && <p className="ba-msg" role="status">{msg}</p>}

      <section aria-label="Human player leaderboard">
        {!board.ranked.length ? (
          <div className="ba-empty"><h2>Nobody ranked yet</h2><p>A player is ranked after {HP_RULES.MIN_ATTEMPTS} attempts of each drill{season ? ` in ${season.name}` : ''}. Run the first one below.</p></div>
        ) : (
          <ol className="hp-board">
            <li className="hp-row hp-row-head" aria-hidden="true">
              <span className="hp-rank">#</span><span className="hp-name">Human player</span><span className="hp-score">Score</span>
              <span className="hp-match">Match</span><span className="hp-rate">Rate</span><span className="hp-acc">Accuracy</span>
            </li>
            {board.ranked.map((r) => (
              <li key={r.id} className={`hp-row${r.id === uid ? ' hp-row-me' : ''}${r.rank === 1 ? ' hp-row-top' : ''}`} data-player={r.name}>
                <button className="hp-open" onClick={() => setOpenId(r.id)} aria-label={`${r.name}: Human Player Score ${r.score}, open details`}>
                  <span className="hp-rank hud-tnum">{r.rank}</span>
                  <span className="hp-name">{r.name}{r.id === uid && <i className="hp-you">you</i>}</span>
                  <span className="hp-score hud-tnum" data-score={r.score}>{r.score}</span>
                  <span className="hp-match hud-tnum"><i>Match</i>{fmtValue('match', r.drills.match.value)}</span>
                  <span className="hp-rate hud-tnum"><i>Rate</i>{fmtValue('rate', r.drills.rate.value)}</span>
                  <span className="hp-acc hud-tnum"><i>Acc</i>{fmtValue('accuracy', r.drills.accuracy.value)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {board.unranked.length > 0 && (
          <div className="hp-unranked">
            <h2 className="ba-h3">Not ranked yet <span className="ba-muted">{HP_RULES.MIN_ATTEMPTS} of each drill to rank</span></h2>
            <ul>{board.unranked.map((r) => (
              <li key={r.id} data-unranked={r.name}><button className="ba-link-btn hp-un-name" onClick={() => setOpenId(r.id)}>{r.name}{r.id === uid ? ' (you)' : ''}</button><span className="hp-needs">{needsText(r.needs)}</span></li>
            ))}</ul>
          </div>
        )}
      </section>

      <details className="ba-rules hp-formula">
        <summary>How the Human Player Score works</summary>
        <p>One number from 0 to 100 per season, built to predict who scores the most FUEL in a real match.</p>
        <ul>
          <li><b>Each attempt</b>: accuracy = made ÷ shots; rate = made ÷ seconds; match run = FUEL made while our HUB was active (made while inactive and misses count 0). A match run counts when at least {pct(HP_RULES.FULL_MATCH_SHARE)} of the match clock ran.</li>
          <li><b>Recent best</b>: of your last {HP_RULES.RECENT} attempts of a drill, the average of your best {HP_RULES.BEST}. One lucky run cannot top the board, and a bad day falls out.</li>
          <li><b>Ranked</b> after {HP_RULES.MIN_ATTEMPTS} attempts of every drill. Until then the list says what you still need.</li>
          <li><b>Against the team best</b>: each drill is your recent best ÷ the best recent best on the team, 0 to 1.</li>
          <li><b>Score</b> = 100 × ({HP_RULES.MATCH_WEIGHT} × match + {HP_RULES.RATE_WEIGHT} × rate + {HP_RULES.ACCURACY_WEIGHT} × accuracy). The match run counts most because it is closest to competition: it rewards shooting when the HUB is active and holding when it is not.</li>
        </ul>
        <p>A voided attempt counts for nothing. These weights are proposed defaults.</p>
      </details>

      <div className="hp-cols">
        <section className="hp-panel" ref={formRef} aria-labelledby="hp-log-h">
          <h2 className="ba-h3" id="hp-log-h">Log an attempt</h2>
          <AttemptForm key={result?.key ?? 'blank'} uid={uid} isStaff={isStaff} roster={s.roster} result={result} onSaved={after}
            onLive={(x) => { setMsg(''); setLive(x) }} onDiscard={() => { setResult(null); setMsg('') }} />
        </section>
        <section className="hp-panel" aria-labelledby="hp-mine-h">
          <h2 className="ba-h3" id="hp-mine-h">My attempts <span className="ba-muted">{season ? season.name : 'All time'}</span></h2>
          {me || board.unranked.find((r) => r.id === uid) ? <PlayerFacts row={me || board.unranked.find((r) => r.id === uid)} /> : null}
          {!mine.length ? <p className="ba-muted">No attempts {season ? 'this season' : 'yet'}. Run your first drill.</p> : (
            <AttemptList list={mine} uid={uid} isStaff={isStaff} nameOf={nameOf} onSaved={after} />
          )}
        </section>
      </div>

      {opened && <PlayerSheet d={opened} uid={uid} isStaff={isStaff} season={season} nameOf={nameOf}
        attempts={s.attempts.filter((x) => x.member_id === opened.id && inSeason(x.attempt_date, season))}
        onClose={() => setOpenId(null)} onSaved={after} />}
    </main>
  )
}

function PlayerFacts({ row }) {
  return (
    <dl className="ba-facts hp-facts">
      {row.score != null && <div><dt>Score</dt><dd className="hp-big hud-tnum">{row.score}</dd></div>}
      {DRILLS.map((d) => (
        <div key={d.key}><dt>{d.label}</dt><dd className="hud-tnum">{fmtValue(d.key, row.drills[d.key].value)}<small>{row.drills[d.key].needs ? ` · needs ${row.drills[d.key].needs}` : ` · best ${fmtValue(d.key, row.drills[d.key].personalBest)}`}</small></dd></div>
      ))}
    </dl>
  )
}

function AttemptForm({ uid, isStaff, roster = [], start = null, result = null, onSaved, onCancel, onLive, onDiscard }) {
  const blank = { member: uid, drill: 'match', date: todayLA(), shots: String(DEFAULT_SHOTS), made: '', missed: '', madeInactive: '', seconds: String(DEFAULT_RATE_SECONDS), alliance: 'red', inactiveFirst: null, notes: '' }
  const init = () => {
    if (start) return { member: start.member_id, drill: start.drill, date: start.attempt_date, shots: String(start.attempted), made: String(start.made), madeInactive: String(start.made_inactive ?? 0),
      missed: String(start.attempted - start.made - (start.made_inactive ?? 0)), seconds: start.seconds == null ? '' : String(start.seconds), alliance: start.alliance, inactiveFirst: start.inactive_first, notes: start.notes ?? '' }
    if (result) return { ...blank, member: result.member ?? uid, drill: result.drill, shots: String(result.shots ?? DEFAULT_SHOTS), made: String(result.made), missed: String(result.missed), madeInactive: String(result.madeInactive ?? 0),
      seconds: result.seconds == null ? blank.seconds : String(result.seconds), alliance: result.alliance ?? 'red', inactiveFirst: result.inactiveFirst ?? null }
    return blank
  }
  const [v, setV] = useState(init)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const num = (x) => (String(x ?? '').trim() === '' ? 0 : Number(x))
  const shape = (x) => {
    const made = x.made, inact = x.drill === 'match' ? (x.madeInactive || '0') : '0'
    const attempted = x.drill === 'accuracy' ? x.shots : String(num(x.made) + num(inact) + num(x.missed))
    const seconds = x.drill === 'accuracy' ? null : x.drill === 'match' && !start && !result ? String(MATCH_SECONDS) : x.seconds
    return { drill: x.drill, date: x.date, made, attempted, madeInactive: inact, seconds }
  }
  const set = (patch) => setV({ ...v, ...patch })
  async function save(e) {
    e.preventDefault()
    const f = shape(v)
    const problem = attemptProblem(f)
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    const made = Number(f.made), attempted = Number(f.attempted), madeInactive = Number(f.madeInactive), seconds = f.seconds == null ? null : Number(f.seconds), notes = v.notes.trim() || null
    try {
      if (start) done(await writeVia(supabase, 'hp_edit_attempt', { p_attempt: start.id, p_date: v.date, p_made: made, p_attempted: attempted, p_made_inactive: madeInactive, p_seconds: seconds, p_notes: notes }))
      else done(await writeVia(supabase, 'hp_log_attempt', { p_member: v.member && v.member !== uid ? v.member : null, p_date: v.date, p_drill: v.drill, p_made: made, p_attempted: attempted,
        p_made_inactive: madeInactive, p_seconds: seconds, p_alliance: v.drill === 'match' ? v.alliance : null, p_inactive_first: v.drill === 'match' ? v.inactiveFirst : null, p_notes: notes }))
      const forName = v.member && v.member !== uid ? roster.find((m) => m.id === v.member)?.name ?? 'the player' : null
      await onSaved(start ? 'Attempt corrected.' : `${drillLabel(v.drill)} logged${forName ? ` for ${forName}` : ''}: ${f.made} made.`)
    } catch (x) { setErr(errText(x)) }
    setSaving(false)
  }
  const numBox = (key, label, unit, hint) => (
    <label className="ba-num"><span>{label}</span><span className="ba-num-box"><input inputMode="numeric" pattern="[0-9]*" value={v[key] ?? ''} placeholder={hint}
      onChange={(e) => set({ [key]: e.target.value.replace(/[^0-9]/g, '') })} aria-label={label} />{unit && <i>{unit}</i>}</span></label>)
  const startLive = () => onLive({ drill: v.drill, member: v.member || uid, config: { shots: num(v.shots) || DEFAULT_SHOTS, seconds: num(v.seconds) || DEFAULT_RATE_SECONDS, alliance: v.alliance || 'red' } })
  return (
    <form className="ba-form hp-form" onSubmit={save}>
      {isStaff && !start && roster.length > 0 && (
        <label className="ba-field"><span>Human player</span>
          <select value={v.member ?? ''} onChange={(e) => set({ member: e.target.value })} aria-label="Human player">
            {!roster.some((m) => m.id === uid) && <option value={uid}>Me</option>}
            {roster.map((m) => <option key={m.id} value={m.id}>{m.id === uid ? `${m.name} (me)` : m.name}</option>)}
          </select>
        </label>
      )}
      {!start && (
        <fieldset className="ba-seg"><legend>Drill</legend>
          <div className="ba-seg-opts">{DRILLS.map((d) => <button type="button" key={d.key} aria-pressed={v.drill === d.key} disabled={!!result} onClick={() => set({ drill: d.key })}>{d.label}</button>)}</div>
        </fieldset>
      )}
      <p className="ba-muted hp-drill-help">{v.drill === 'accuracy' ? 'A fixed set of shots from the human player position. Count the makes.' : v.drill === 'rate' ? 'A timed burst with bins of FUEL ready. As many as you can make.' : 'A full match on the simulator clock. Shoot when our HUB is active; a make while it is inactive counts nothing.'}</p>
      {!start && !result && onLive && (
        <div className="hp-live-setup">
          {v.drill === 'accuracy' && numBox('shots', 'Shots in the set', 'shots', String(DEFAULT_SHOTS))}
          {v.drill === 'rate' && numBox('seconds', 'Burst length', 's', String(DEFAULT_RATE_SECONDS))}
          {v.drill === 'match' && (
            <fieldset className="ba-seg"><legend>Our alliance</legend><div className="ba-seg-opts">{[['red', 'Red'], ['blue', 'Blue']].map(([k, l]) => <button key={k} type="button" className={`ms-${k}`} aria-pressed={v.alliance === k} onClick={() => set({ alliance: k })}>{l}</button>)}</div></fieldset>
          )}
          <button type="button" className="ba-primary hp-go" onClick={startLive}>{v.drill === 'match' ? 'Start a match run' : v.drill === 'rate' ? 'Start the timer' : 'Start counting'}</button>
          <p className="ba-muted">Or type the counts below if you counted on paper.</p>
        </div>
      )}
      {result && <p className="hp-result-note">{drillLabel(v.drill)} {v.drill === 'match' && v.inactiveFirst ? `· ${v.inactiveFirst.toUpperCase()} HUB inactive first ` : ''}· counted live. Fix any count, then save.</p>}
      <div className="ba-grid2 hp-counts">
        {v.drill === 'accuracy' && (result || start) && numBox('shots', 'Shots', 'shots')}
        {numBox('made', v.drill === 'match' ? 'Made, HUB active' : 'Made', 'FUEL', '0')}
        {v.drill === 'match' && numBox('madeInactive', 'Made, HUB inactive', 'FUEL', '0')}
        {v.drill !== 'accuracy' && numBox('missed', 'Missed', 'FUEL', '0')}
        {v.drill === 'rate' && (result || start) && numBox('seconds', 'Seconds', 's')}
        {v.drill === 'match' && start && numBox('seconds', 'Seconds run', 's')}
      </div>
      <div className="ba-grid2">
        <label className="ba-field"><span>Date</span><input type="date" value={v.date} max={todayLA()} onChange={(e) => set({ date: e.target.value })} aria-label="Date" /></label>
        <label className="ba-field"><span>Notes (optional)</span><input value={v.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} placeholder="Overhand, from the outpost" aria-label="Notes" /></label>
      </div>
      {err && <p className="ba-error" role="alert">{err}</p>}
      <div className="ba-row">
        <button className="ba-primary hp-save" type="submit" disabled={saving}>{saving ? 'Saving…' : start ? 'Save correction' : 'Save attempt'}</button>
        {onCancel && <button className="ba-btn" type="button" onClick={onCancel}>Cancel</button>}
        {result && onDiscard && <button className="ba-btn" type="button" onClick={onDiscard}>Discard run</button>}
      </div>
    </form>
  )
}

function AttemptList({ list, uid, isStaff, nameOf, onSaved, showLogger = false }) {
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  async function voidIt(x) {
    setErr('')
    try { done(await writeVia(supabase, 'hp_void_attempt', { p_attempt: x.id, p_reason: null })); await onSaved('Attempt voided. It stays on the record and counts for nothing.') } catch (e) { setErr(errText(e)) }
  }
  const canVoid = (x) => !x.voided_at && (isStaff || (x.member_id === uid && Date.parse(x.created_at) > Date.now() - 24 * 3600_000))
  return (
    <>
      {err && <p className="ba-error" role="alert">{err}</p>}
      <ol className="ba-history hp-attempts">
        {list.map((x) => (
          <li key={x.id} className={x.voided_at ? 'hp-void' : ''} data-attempt={x.id}>
            {editing === x.id ? <AttemptForm uid={uid} isStaff start={x} onSaved={async (t) => { setEditing(null); await onSaved(t) }} onCancel={() => setEditing(null)} /> : (
              <>
                <div className="ba-run-top">
                  <strong><span className={`hp-chip hp-chip-${x.drill}`}>{drillLabel(x.drill)}</span> <span className="hud-tnum">{attemptLine(x)}</span></strong>
                  <span className="hud-mono">{day(x.attempt_date)}</span>
                </div>
                {x.notes && <p className="ba-run-note">{x.notes}</p>}
                <div className="ba-run-foot">
                  <span className="ba-muted">{x.voided_at ? `Void${x.void_reason ? `: ${x.void_reason}` : ''}` : attemptValue(x) == null ? 'Not scored' : showLogger && x.logged_by && x.logged_by !== x.member_id ? `Logged by ${nameOf(x.logged_by) || 'staff'}` : ''}</span>
                  <span className="hp-actions">
                    {isStaff && !x.voided_at && <button className="ba-link-btn" onClick={() => setEditing(x.id)}>Edit</button>}
                    {canVoid(x) && <button className="ba-link-btn hp-void-btn" onClick={() => voidIt(x)}>Void</button>}
                  </span>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

function PlayerSheet({ d, uid, isStaff, season, attempts, nameOf, onClose, onSaved }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current, opener = document.activeElement
    el?.showModal?.()
    return () => { el?.close?.(); if (opener?.isConnected) opener.focus() }
  }, [])
  return (
    <dialog ref={ref} className="ba-sheet hp-sheet" aria-label={`${d.name} details`} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="ba-sheet-head">
        <div><span className="ba-eyebrow">{season ? season.name : 'All time'}</span><h2>{d.name}</h2></div>
        <button className="ba-btn" onClick={onClose}>Close</button>
      </div>
      <div className="ba-sheet-body">
        {d.row ? <PlayerFacts row={d.row} /> : <p className="ba-muted">Nothing counted in this season.</p>}
        {d.row?.rank && <p className="ba-muted">Rank #{d.row.rank}. Against the team best: match {pct(d.row.norm.match)}, rate {pct(d.row.norm.rate)}, accuracy {pct(d.row.norm.accuracy)}.</p>}
        {d.row && !d.row.qualified && <p className="ba-muted">{needsText(d.row.needs)} to be ranked.</p>}
        <h3 className="ba-h3">Attempts</h3>
        {!attempts.length ? <p className="ba-muted">No attempts {season ? 'this season' : 'yet'}.</p> : <AttemptList list={attempts} uid={uid} isStaff={isStaff} nameOf={nameOf} onSaved={onSaved} showLogger />}
      </div>
    </dialog>
  )
}

/**
 * The live run, full screen, for the person logging in the shop. Accuracy
 * counts to the set size; rate counts down the burst; the match run runs the
 * simulator clock (src/matchSim.js) with a random HUB order shown before the
 * start, and files each make as active or inactive by the HUB state at the tap.
 */
function LiveRun({ drill, config, name, onDone, onAbort }) {
  const [inactiveFirst] = useState(() => (Math.random() < 0.5 ? 'red' : 'blue'))
  const alliance = config.alliance ?? 'red'
  const [startedAt, setStartedAt] = useState(drill === 'accuracy' ? Date.now() : null)
  const [now, setNow] = useState(() => Date.now())
  const [paused, setPaused] = useState(false)
  const [by5, setBy5] = useState(false)
  const [taps, setTaps] = useState([]) // 'made' | 'inactive' | 'miss', each a FUEL
  const offset = useRef(0)
  const pausedAt = useRef(null)
  const fired = useRef(new Set())
  const ended = useRef(false)
  const cues = useCues()
  const timed = drill !== 'accuracy'
  useEffect(() => { if (!timed || !startedAt || paused) return undefined; const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t) }, [timed, startedAt, paused])
  const elapsed = startedAt ? Math.max(0, (now - startedAt - offset.current) / 1000) : 0
  const total = drill === 'match' ? MATCH_SECONDS : drill === 'rate' ? config.seconds : null
  const st = drill === 'match' ? matchState(elapsed, inactiveFirst) : null
  const ours = st ? st.active[alliance] : true
  const madeN = taps.filter((t) => t === 'made').length, inactN = taps.filter((t) => t === 'inactive').length, missN = taps.filter((t) => t === 'miss').length
  const shotN = taps.length

  const finish = (secs) => {
    if (ended.current) return
    ended.current = true
    onDone({ made: madeN, madeInactive: inactN, missed: missN, shots: drill === 'accuracy' ? shotN : undefined, seconds: drill === 'accuracy' ? null : Math.max(5, Math.round(secs)), alliance, inactiveFirst: drill === 'match' ? inactiveFirst : null })
  }
  useEffect(() => {
    if (!timed || !startedAt) return
    if (drill === 'match') for (const c of cueTimes()) {
      const key = `${c.kind}:${c.at}`
      if (elapsed >= c.at && elapsed < c.at + 1.5 && !fired.current.has(key)) { fired.current.add(key); cues.play(c.kind) }
    }
    if (drill === 'rate') {
      if (!fired.current.has('start')) { fired.current.add('start'); cues.play('start') }
      if (total - elapsed <= 5 && !fired.current.has('warn')) { fired.current.add('warn'); cues.play('warning') }
    }
    if (elapsed >= total) { if (drill === 'rate') cues.play('end'); finish(total) }
  }, [elapsed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (drill === 'accuracy' && shotN >= config.shots) finish(0) }, [shotN]) // eslint-disable-line react-hooks/exhaustive-deps

  const running = drill === 'accuracy' || (startedAt && !paused && elapsed < total)
  const add = (kind) => {
    if (!running) return
    let n = by5 ? 5 : 1
    if (drill === 'accuracy') n = Math.min(n, config.shots - shotN)
    const k = kind === 'made' && !ours ? 'inactive' : kind
    setTaps((t) => [...t, ...Array(n).fill(k)])
  }
  const undo = () => setTaps((t) => t.slice(0, by5 ? -5 : -1))
  const togglePause = () => { if (paused) { offset.current += Date.now() - pausedAt.current; setPaused(false) } else { pausedAt.current = Date.now(); setPaused(true) } }
  const begin = () => { cues.unlock(); setStartedAt(Date.now()); setNow(Date.now()) }
  const tone = drill === 'match' ? ` ms-run-${alliance}` : ''

  if (timed && !startedAt) return (
    <div className={`ms-run hp-run${tone}`} data-testid="hp-ready" role="dialog" aria-label={`${drillLabel(drill)} ready`}>
      <div className="ms-top"><span className="ms-crew">HP {name}</span><span className="ms-meta">{drillLabel(drill)}</span></div>
      <div className="ms-phase">{drill === 'match' ? 'MATCH RUN' : 'RATE'}</div>
      {drill === 'match' ? (
        <div className={`hp-order ms-hub-${inactiveFirst}`} data-testid="hp-order">
          <span>RANDOM DRAW</span>
          <b>{inactiveFirst.toUpperCase()} HUB INACTIVE FIRST</b>
          <i>Our HUB ({alliance}) is {inactiveFirst === alliance ? 'inactive in SHIFTS 1 and 3, active in 2 and 4' : 'active in SHIFTS 1 and 3, inactive in 2 and 4'}. Both HUBS are active in AUTO, the TRANSITION SHIFT and END GAME.</i>
        </div>
      ) : <div className="hp-order"><span>TIME TRIAL</span><b>{config.seconds} SECONDS</b><i>Bins of FUEL ready. Count every make and every miss.</i></div>}
      <div className="hp-ready-actions">
        <button className="ba-primary hp-go" onClick={begin}>Start</button>
        <button className="ba-btn" onClick={onAbort}>Back</button>
      </div>
    </div>
  )

  const clock = drill === 'match' ? fmtClock(st.periodClock) : drill === 'rate' ? fmtClock(total - elapsed) : `${shotN}/${config.shots}`
  const next = st ? PHASES[st.index + 1] : null
  return (
    <div className={`ms-run hp-run${tone}${ours ? ' hp-on' : ' hp-off'}`} data-phase={st?.phase.key ?? drill} role="timer" aria-live="off" data-testid="hp-live">
      <div className="ms-top"><span className="ms-crew">HP {name}</span><span className="ms-meta">{drillLabel(drill)}{drill === 'match' ? ` · ${inactiveFirst.toUpperCase()} inactive first` : ''}</span></div>
      {st && <div className="ms-phase hp-phase" data-testid="hp-phase">{st.phase.label}</div>}
      <div className="hp-clock hud-tnum" data-testid="hp-clock">{clock}</div>
      {st && <div className="ms-sub hud-tnum">{st.phase.period === 'teleop' ? `${fmtClock(st.remainingInPhase)} left in ${st.phase.label}` : st.phase.period === 'pause' ? 'Field scoring AUTO' : 'AUTO'}{next ? ` · next ${next.label}` : ''}</div>}
      {st && <div className={`hp-hub${ours ? ' hp-hub-on' : ''}`} data-testid="hp-hub"><span>OUR HUB</span><b>{ours ? 'ACTIVE' : 'INACTIVE'}</b><i>{ours ? 'Shoot' : 'Hold. A make now counts nothing'}</i></div>}
      {st && <div className="ms-bar" aria-hidden="true">{PHASES.map((p, i) => <i key={p.key} style={{ flexGrow: p.seconds }} className={i < st.index ? 'ms-done' : i === st.index ? 'ms-now' : ''} />)}</div>}
      <div className="hp-count hud-tnum" data-testid="hp-tally">
        <span><b>{madeN}</b> made{drill === 'match' ? ' active' : ''}</span>
        {drill === 'match' && <span><b>{inactN}</b> inactive</span>}
        <span><b>{missN}</b> missed</span>
      </div>
      <div className="hp-pads">
        <button className="hp-pad hp-pad-made" onClick={() => add('made')} disabled={!running} aria-label={`Plus ${by5 ? 5 : 1} made`}>+{by5 ? 5 : 1}<small>MADE</small></button>
        <button className="hp-pad hp-pad-miss" onClick={() => add('miss')} disabled={!running} aria-label={`Plus ${by5 ? 5 : 1} miss`}>+{by5 ? 5 : 1}<small>MISS</small></button>
      </div>
      <div className="hp-controls">
        <button className="ba-btn" aria-pressed={by5} onClick={() => setBy5(!by5)}>{by5 ? 'Count by 1' : 'Count by 5'}</button>
        <button className="ba-btn" onClick={undo} disabled={!taps.length}>Undo</button>
        {timed && <button className="ba-btn" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>}
        <button className="ba-btn" onClick={() => finish(elapsed)}>{drill === 'accuracy' ? 'Done' : 'End now'}</button>
        <button className="ba-btn" onClick={onAbort}>Abandon</button>
      </div>
    </div>
  )
}
