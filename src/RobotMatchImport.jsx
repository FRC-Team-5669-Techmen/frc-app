import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { ROBOT_REPO, KIND_LABELS, parseMatchFile, planImport, importLinks, listRobotFiles } from './robotMatches'

// The import panel of the match log (0038, ledger 0028): pull every new file
// from the robot repo, or drop files; a preview before anything is saved. A
// typed crew name that is not an exact match must be chosen (or left blank)
// before that file can be saved, so a guess is never applied silently.

const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const ROLES = [['driver', 'Driver'], ['operator', 'Operator'], ['coach', 'Coach']]
const PULL_LIMIT = 80

export default function RobotMatchImport({ members, batteries, routines, events, matches, onDone }) {
  const [plans, setPlans] = useState([])
  const [choice, setChoice] = useState({}) // fileName -> { driver, operator, coach, battery, routine, addRoutine, skip }
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [over, setOver] = useState(false)
  const [results, setResults] = useState([])
  const existing = useMemo(() => new Set((matches ?? []).map((m) => m.file_name).filter(Boolean)), [matches])
  const simRows = useMemo(() => (matches ?? []).filter((m) => m.source === 'sim_page' && !m.file_name), [matches])
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? 'Unknown'

  function preview(parsedList) {
    const ctx = { members, batteries, routines, events, simRows, existing }
    const seen = new Set()
    const next = parsedList.filter((p) => (seen.has(p.fileName) ? false : seen.add(p.fileName))).map((p) => planImport(p, ctx))
      .sort((a, b) => String(a.cols?.started_at ?? '').localeCompare(String(b.cols?.started_at ?? '')))
    setPlans(next)
    setChoice({})
    setResults([])
    const n = next.filter((x) => x.status === 'new').length
    setMsg(next.length ? `${n} new · ${next.filter((x) => x.status === 'already').length} already imported · ${next.filter((x) => x.status === 'error').length} not readable` : 'No match files found.')
  }

  async function pull() {
    setBusy('pull'); setMsg('Reading the robot repo…'); setResults([])
    const list = await listRobotFiles()
    if (list.error) { setMsg(list.error); setBusy(''); return }
    if (list.empty || !list.files.length) { setMsg('No match files have been pushed yet. Run Sync Match Data on the driver station laptop first.'); setPlans([]); setBusy(''); return }
    const fresh = list.files.filter((f) => !existing.has(f.name))
    if (!fresh.length) { setMsg(`All ${list.files.length} match files are already imported.`); setPlans([]); setBusy(''); return }
    const take = fresh.slice(0, PULL_LIMIT)
    const parsed = await Promise.all(take.map(async (f) => {
      try { const r = await fetch(f.url); return parseMatchFile(r.ok ? await r.text() : '', f.name) } catch { return { ok: false, fileName: f.name, error: 'Could not download this file.' } }
    }))
    preview(parsed)
    if (fresh.length > PULL_LIMIT) setMsg((m) => `${m}. Showing the newest ${PULL_LIMIT} of ${fresh.length}; import these, then pull again.`)
    setBusy('')
  }

  async function drop(fileList) {
    const files = [...(fileList ?? [])].filter((f) => /\.json$/i.test(f.name))
    if (!files.length) { setMsg('Drop .json match files.'); return }
    setBusy('read')
    preview(await Promise.all(files.map(async (f) => parseMatchFile(await f.text(), f.name))))
    setBusy('')
  }

  const pick = (file, key, value) => setChoice((c) => ({ ...c, [file]: { ...c[file], [key]: value } }))
  const unresolved = (p) => ROLES.some(([r]) => p.crew[r].status === 'confirm' && (choice[p.fileName]?.[r] === undefined))
  const ready = plans.filter((p) => p.status === 'new' && !choice[p.fileName]?.skip)
  const blocked = ready.filter(unresolved)

  async function save() {
    if (busy || !ready.length || blocked.length) return
    setBusy('save'); setMsg('')
    const out = []
    for (const p of ready) {
      const links = importLinks(p, choice[p.fileName] ?? {})
      const r = await writeVia(supabase, 'robot_match_import', { p_file_name: p.fileName, p_raw: p.raw, p_links: links })
      if (r.error || r.via !== 'function') out.push({ file: p.fileName, ok: false, text: r.error?.message || 'The match log is not set up yet. Nothing was saved.' })
      else out.push({ file: p.fileName, ok: true, text: `${r.data.status === 'merged' ? 'Merged with the Match Sim record' : r.data.status === 'already' ? 'Already imported' : 'Imported'}${(r.data.notes ?? []).length ? `. ${r.data.notes.join(' ')}` : ''}` })
    }
    const okN = out.filter((x) => x.ok).length
    setResults(out)
    setMsg(`${okN} of ${out.length} saved${okN < out.length ? '. The rest were not changed.' : '.'}`)
    setPlans((ps) => ps.filter((p) => !out.some((x) => x.ok && x.file === p.fileName)))
    setBusy('')
    if (okN) onDone?.()
  }

  const memberOptions = (p, role) => {
    const c = p.crew[role]
    const list = c.status === 'confirm' ? c.candidates : members
    return list
  }

  return (
    <details className="rm-import" open={!(matches ?? []).length}>
      <summary>Import robot matches</summary>
      <p className="ba-muted">Pull every new file from the robot repo ({ROBOT_REPO.repo}/{ROBOT_REPO.dir}), or drop files from the driver station laptop. Nothing is saved until you press Import.</p>
      <div className="ba-row">
        <button type="button" className="ba-primary" onClick={pull} disabled={!!busy} data-pull>{busy === 'pull' ? 'Pulling…' : 'Pull from GitHub'}</button>
      </div>
      <label className="rm-drop" data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); drop(e.dataTransfer?.files) }}>
        <input type="file" accept=".json,application/json" multiple onChange={(e) => { drop(e.target.files); e.target.value = '' }} data-drop />
        <strong>Drop match files here</strong>
        <span className="ba-muted">or tap to choose · match-data/matches/*.json</span>
      </label>
      {msg && <p className="ba-msg" role="status">{msg}</p>}
      {!!plans.length && (
        <ul className="rm-plans">
          {plans.map((p) => {
            const c = choice[p.fileName] ?? {}
            if (p.status === 'error') return <li key={p.fileName} className="rm-plan rm-plan-error" data-plan="error"><span className="rm-plan-file">{p.fileName}</span><p>{p.error}</p></li>
            if (p.status === 'already') return <li key={p.fileName} className="rm-plan" data-plan="already"><span className="rm-plan-file">{p.fileName}</span><p className="ba-muted">Already imported. Re-importing changes nothing.</p></li>
            const batteryId = c.battery !== undefined ? c.battery : p.battery.battery?.id ?? ''
            const driverId = c.driver !== undefined ? c.driver : p.crew.driver.status === 'exact' ? p.crew.driver.member.id : ''
            return (
              <li key={p.fileName} className="rm-plan rm-plan-new" data-plan="new" data-file={p.fileName}>
                <div className="rm-top">
                  <span className="rm-label">{p.cols.match_label}</span>
                  <span className="rm-pill">{KIND_LABELS[p.cols.kind]}</span>
                  <span className="rm-when">{when(p.cols.started_at)}{p.cols.alliance ? ` · ${p.cols.alliance} ${p.cols.station ?? ''}` : ''}</span>
                </div>
                <span className="rm-plan-file">{p.fileName}</span>
                {p.confirm.map((x) => <p key={x} className="rm-confirm">Check: {x}</p>)}
                <div className="rm-plan-links">
                  {ROLES.map(([role, label]) => {
                    const cr = p.crew[role]
                    const v = c[role] !== undefined ? c[role] : cr.status === 'exact' ? cr.member.id : cr.status === 'confirm' ? '__pick' : ''
                    return (
                      <label key={role} className="ba-field">
                        <span>{label} {p.cols.crew_typed[role] && <em className="rm-typed">typed “{p.cols.crew_typed[role]}”</em>}</span>
                        <select aria-label={`${label} for ${p.cols.match_label}`} value={v} onChange={(e) => pick(p.fileName, role, e.target.value)} data-role={role}>
                          {v === '__pick' && <option value="__pick" disabled>Choose who this is</option>}
                          <option value="">Nobody / not sure</option>
                          {memberOptions(p, role).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          {cr.status === 'confirm' && <option disabled>──────────</option>}
                          {cr.status === 'confirm' && members.filter((m) => !cr.candidates.includes(m)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                    )
                  })}
                  <label className="ba-field">
                    <span>Battery {p.cols.crew_typed.battery && <em className="rm-typed">typed “{p.cols.crew_typed.battery}”</em>}</span>
                    <select aria-label={`Battery for ${p.cols.match_label}`} value={batteryId} onChange={(e) => pick(p.fileName, 'battery', e.target.value)} data-role="battery">
                      <option value="">None</option>
                      {batteries.filter((b) => b.status !== 'retired' || b.id === batteryId).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </label>
                  <label className="ba-field">
                    <span>Auto {p.cols.auto_name && <em className="rm-typed">“{p.cols.auto_name}”</em>}</span>
                    <select aria-label={`Auto routine for ${p.cols.match_label}`} value={c.routine !== undefined ? c.routine : p.routine.routine?.id ?? ''} onChange={(e) => pick(p.fileName, 'routine', e.target.value)} data-role="routine">
                      <option value="">None</option>
                      {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                </div>
                {p.routine.status === 'missing' && !(c.routine) && (
                  <label className="rm-check"><input type="checkbox" checked={!!c.addRoutine} onChange={(e) => pick(p.fileName, 'addRoutine', e.target.checked)} data-add-routine />Add “{p.cols.auto_name.slice(0, 60)}” as an auto routine</label>
                )}
                <ul className="rm-writes">
                  {p.sim && <li>Joins the Match Sim record from {when(p.sim.started_at)} (one match, not two).</li>}
                  {p.event && <li>Links to {p.event.title}.</li>}
                  <li>{batteryId && !p.sim?.battery_run_id ? `Logs one battery run for ${batteries.find((b) => b.id === batteryId)?.label}.` : 'No battery run.'}</li>
                  <li>{driverId && driverId !== '__pick' ? `Logs ${Math.max(1, Math.round((p.cols.duration_s ?? 160) / 60))} min of drive time for ${nameOf(driverId)}.` : 'No drive time (no driver).'}</li>
                </ul>
                <label className="rm-check"><input type="checkbox" checked={!!c.skip} onChange={(e) => pick(p.fileName, 'skip', e.target.checked)} />Skip this file</label>
              </li>
            )
          })}
        </ul>
      )}
      {!!plans.length && (
        <div className="ba-row">
          <button type="button" className="ba-primary" onClick={save} disabled={!!busy || !ready.length || !!blocked.length} data-import>
            {busy === 'save' ? 'Importing…' : `Import ${ready.length} match${ready.length === 1 ? '' : 'es'}`}
          </button>
          {!!blocked.length && <span className="rm-confirm">Choose the crew for {blocked.length} file{blocked.length === 1 ? '' : 's'} first.</span>}
        </div>
      )}
      {!!results.length && <ul className="rm-results">{results.map((r) => <li key={r.file}>{r.file}: {r.text}</li>)}</ul>}
    </details>
  )
}
