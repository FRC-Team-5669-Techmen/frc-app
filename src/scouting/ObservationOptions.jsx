import { useState } from 'react'
import SuggestOption from './SuggestOption'
import { OPTION_TYPES, OPTION_PHASES, OPTION_STATUS, activeOptions, choicesFromText, choicesToText, optionProblem, typeLabel } from './options'

// Observation options (0037, ledger 0029): what every scout answers beyond the
// built-in match fields. Everyone sees the options that are on and can suggest
// one; the scouting lead (and staff) approve, edit, decline, retire, restore,
// add and reorder. One list for the whole team, every event.
const phaseName = (p) => OPTION_PHASES.find(([v]) => v === p)?.[1] ?? p

function Editor({ start, onSave, onCancel, busy }) {
  const [label, setLabel] = useState(start?.label ?? '')
  const [help, setHelp] = useState(start?.help ?? '')
  const [type, setType] = useState(start?.type ?? 'yesno')
  const [phase, setPhase] = useState(start?.phase ?? 'teleop')
  const [choices, setChoices] = useState(choicesToText(start?.choices))
  const [err, setErr] = useState('')
  const locked = !!start?.was_active
  async function save(status) {
    // Keep the saved values of existing choices so a rename never orphans answers.
    let parsed = type === 'choice' ? choicesFromText(choices) : null
    if (parsed && start?.choices) {
      const byLabel = new Map(start.choices.map(([v, l]) => [l.trim().toLowerCase(), v]))
      const kept = new Set()
      parsed = parsed.map(([v, l]) => { const old = byLabel.get(l.trim().toLowerCase()); if (old && !kept.has(old)) { kept.add(old); return [old, l] } return [v, l] })
      if (locked) for (const [v, l] of start.choices) if (!parsed.some(([x]) => x === v)) parsed.push([v, l])
      const seen = new Set()
      parsed = parsed.map(([v, l]) => { let k = v, n = 1; while (seen.has(k)) { n += 1; k = `${v}_${n}` } seen.add(k); return [k, l] })
    }
    const problem = optionProblem({ label, type, choices: parsed })
    if (problem) { setErr(problem); return }
    setErr('')
    try { await onSave({ p_id: start?.id ?? null, p_label: label.trim(), p_type: type, p_choices: parsed, p_phase: phase, p_help: help.trim() || null, p_status: status, p_position: start?.position ?? null }) }
    catch (e) { setErr(e?.message || 'Could not save. Nothing changed.') }
  }
  return <div className="sc-opt-editor" role="group" aria-label={start?.id ? `Edit ${start.label}` : 'New observation option'}>
    <label>What scouts watch for<input maxLength="120" value={label} onChange={e => setLabel(e.target.value)} placeholder="Passing actually reaches a partner" /></label>
    <label>Hint for scouts (optional)<input maxLength="300" value={help} onChange={e => setHelp(e.target.value)} placeholder="Count only passes a partner picks up" /></label>
    <fieldset className="sc-choice"><legend>Answer type{locked ? ' (fixed once used)' : ''}</legend><div className="sc-choice-options">
      {OPTION_TYPES.map(t => <button key={t.value} type="button" disabled={locked && t.value !== type} aria-pressed={type === t.value} onClick={() => setType(t.value)}>{t.label}</button>)}
    </div></fieldset>
    {type === 'choice' && <label>Answers, one per line{locked ? ' (rename or add; used answers stay)' : ''}<textarea rows="4" value={choices} onChange={e => setChoices(e.target.value)} /></label>}
    <label>When in the match<select value={phase} onChange={e => setPhase(e.target.value)}>{OPTION_PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    {start?.request_note && <p className="sc-help">Asked by {start.requested_by_name}: {start.request_note}</p>}
    {err && <p className="sc-error" role="alert">{err}</p>}
    <div className="sc-actions">
      <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="sc-primary" onClick={() => save('active')} disabled={busy}>{start?.status === 'active' ? 'Save' : 'Turn on for every scout'}</button>
    </div>
  </div>
}

export default function ObservationOptions({ data, online, onRequest, onSave, onReload }) {
  const [editing, setEditing] = useState(null) // option id, 'new', or null
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [declining, setDeclining] = useState(null)
  const [reason, setReason] = useState('')
  if (!data) return null
  const list = data.options ?? []
  const mgr = !!data.can_manage
  const on = activeOptions(list)
  const requests = list.filter(o => o.status === 'requested')
  const mine = list.filter(o => o.mine && o.status !== 'active')
  const off = list.filter(o => ['retired', 'declined'].includes(o.status))
  async function run(key, fn, text) {
    if (busy) return
    setBusy(key); setMsg('')
    try { await fn(); await onReload(); setMsg(text); setEditing(null); setDeclining(null); setReason('') }
    catch (e) { setMsg(e?.message || 'Could not save. Nothing changed.') }
    finally { setBusy('') }
  }
  const status = (o, s, extra = {}) => run(o.id, () => onSave({ p_id: o.id, p_label: o.label, p_type: o.type, p_choices: o.choices, p_phase: o.phase, p_help: o.help, p_status: s, p_position: o.position, ...extra }),
    s === 'active' ? `"${o.label}" is on for every scout.` : s === 'retired' ? `"${o.label}" is off. Saved answers stay.` : `"${o.label}" declined.`)
  const move = (o, dir) => {
    const same = on.filter(x => x.phase === o.phase)
    const i = same.findIndex(x => x.id === o.id), j = i + dir
    if (j < 0 || j >= same.length) return
    const other = same[j]
    const a = other.position === o.position ? o.position + dir : other.position
    run(o.id, async () => {
      await onSave({ p_id: o.id, p_label: o.label, p_type: o.type, p_choices: o.choices, p_phase: o.phase, p_help: o.help, p_status: 'active', p_position: a })
      await onSave({ p_id: other.id, p_label: other.label, p_type: other.type, p_choices: other.choices, p_phase: other.phase, p_help: other.help, p_status: 'active', p_position: o.position })
    }, 'Order saved.')
  }
  return <details className="sc-card sc-options" open={mgr && requests.length > 0} data-observation-options>
    <summary>Observation options <span className="sc-pill">{on.length} on</span>{mgr && requests.length > 0 && <span className="sc-pill sc-pill-alert">{requests.length} to review</span>}</summary>
    <p className="sc-help">{mgr ? 'You choose what every scout answers beyond the built-in fields. Requests from scouts wait here for you.' : 'Questions your scouting lead added to every observation. Saw something they miss? Suggest it.'}</p>
    {!online && <p className="sc-help">Offline: showing the list saved on this device. Suggestions and changes need a connection.</p>}
    {msg && <p role="status" className="sc-notice">{msg}</p>}

    {mgr && requests.length > 0 && <section aria-label="Requests to review" className="sc-opt-section">
      <h3>Requests to review</h3>
      <ul className="sc-opt-list">{requests.map(o => <li key={o.id} className="sc-opt sc-opt-requested" data-option={o.key}>
        {editing === o.id ? <Editor start={o} busy={!!busy} onCancel={() => setEditing(null)} onSave={args => run(o.id, () => onSave(args), `"${args.p_label}" is on for every scout.`)} /> : <>
          <div className="sc-opt-main"><strong>{o.label}</strong><span className="sc-opt-meta">{typeLabel(o.type)} · {phaseName(o.phase)} · asked by {o.requested_by_name}{o.example_team ? ` · team ${o.example_team}` : ''}</span>
            {o.request_note && <span className="sc-help">{o.request_note}</span>}</div>
          {declining === o.id ? <div className="sc-opt-decline"><label>Why not (optional)<input maxLength="300" value={reason} onChange={e => setReason(e.target.value)} placeholder="Notes already cover this" /></label>
            <div className="sc-actions"><button type="button" onClick={() => setDeclining(null)}>Back</button><button type="button" disabled={!!busy || !online} onClick={() => status(o, 'declined', { p_decline_reason: reason.trim() || null })}>Decline</button></div></div>
          : <div className="sc-actions">
            <button type="button" className="sc-primary" disabled={!!busy || !online} onClick={() => status(o, 'active')}>Turn on</button>
            <button type="button" disabled={!!busy || !online} onClick={() => setEditing(o.id)}>Edit first</button>
            <button type="button" disabled={!!busy || !online} onClick={() => { setDeclining(o.id); setReason('') }}>Decline</button>
          </div>}
        </>}
      </li>)}</ul>
    </section>}

    <section aria-label="On for every scout" className="sc-opt-section">
      <h3>On for every scout</h3>
      {on.length ? <ul className="sc-opt-list">{on.map(o => <li key={o.id} className="sc-opt" data-option={o.key}>
        {editing === o.id ? <Editor start={o} busy={!!busy} onCancel={() => setEditing(null)} onSave={args => run(o.id, () => onSave(args), `"${args.p_label}" saved.`)} /> : <>
          <div className="sc-opt-main"><strong>{o.label}</strong><span className="sc-opt-meta">{typeLabel(o.type)} · {phaseName(o.phase)}{o.type === 'choice' ? ` · ${o.choices.map(c => c[1]).join(', ')}` : ''}</span>{o.help && <span className="sc-help">{o.help}</span>}</div>
          {mgr && <div className="sc-actions">
            <button type="button" aria-label={`Move ${o.label} up`} disabled={!!busy || !online} onClick={() => move(o, -1)}>↑</button>
            <button type="button" aria-label={`Move ${o.label} down`} disabled={!!busy || !online} onClick={() => move(o, 1)}>↓</button>
            <button type="button" disabled={!!busy || !online} onClick={() => setEditing(o.id)}>Edit</button>
            <button type="button" disabled={!!busy || !online} onClick={() => status(o, 'retired')}>Turn off</button>
          </div>}
        </>}
      </li>)}</ul> : <p className="sc-help">{mgr ? 'None yet. Add the first one below, or turn on a request.' : 'None yet.'}</p>}
      {mgr && (editing === 'new'
        ? <Editor busy={!!busy} onCancel={() => setEditing(null)} onSave={args => run('new', () => onSave(args), `"${args.p_label}" is on for every scout.`)} />
        : <button type="button" className="sc-primary" disabled={!online} onClick={() => setEditing('new')} data-option-add>Add an observation option</button>)}
    </section>

    {!mgr && <section aria-label="Suggest an observation" className="sc-opt-section">
      {online ? <SuggestOption onSuggest={async args => { await onRequest(args); await onReload() }} /> : <p className="sc-help">Reconnect to suggest an observation.</p>}
      {mine.length > 0 && <><h3>Your suggestions</h3><ul className="sc-opt-list">{mine.map(o => <li key={o.id} className="sc-opt" data-option={o.key}><div className="sc-opt-main"><strong>{o.label}</strong>
        <span className="sc-opt-meta">{OPTION_STATUS[o.status]}{o.status === 'declined' && o.decline_reason ? `: ${o.decline_reason}` : ''}</span></div></li>)}</ul></>}
    </section>}

    {mgr && off.length > 0 && <details className="sc-opt-off"><summary>Turned off and declined ({off.length})</summary>
      <ul className="sc-opt-list">{off.map(o => <li key={o.id} className="sc-opt" data-option={o.key}><div className="sc-opt-main"><strong>{o.label}</strong><span className="sc-opt-meta">{OPTION_STATUS[o.status]} · {typeLabel(o.type)}{o.decline_reason ? ` · ${o.decline_reason}` : ''}</span></div>
        <div className="sc-actions"><button type="button" disabled={!!busy || !online} onClick={() => status(o, 'active')}>Turn on</button></div></li>)}</ul>
    </details>}
  </details>
}
