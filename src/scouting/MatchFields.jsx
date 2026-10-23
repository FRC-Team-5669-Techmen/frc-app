import { MATCH_FIELDS, PHASES, YES_NO, stepCount } from './match'

// The REBUILT match fields on an observation (0027). Built for one hand in
// the stands: counts are big +1, +5 and -1 buttons; every choice is a big
// toggle; tapping a selected choice clears it back to NOT RECORDED. Nothing
// starts at 0: a count reads "Not recorded" until the first tap.
function Count({ field, value, onChange }) {
  const recorded = value !== undefined
  return <fieldset className="sc-count" data-field={field.key}>
    <legend>{field.label}{field.optional ? <span className="sc-optional"> (optional)</span> : null}</legend>
    <div className="sc-count-row">
      <button type="button" className="sc-step sc-step-minus" aria-label={`${field.label} minus 1`} disabled={!recorded || value === 0} onClick={() => onChange(stepCount(value, -1))}>−1</button>
      <output className={`sc-count-value${recorded ? '' : ' sc-unrecorded'}`} aria-live="polite" aria-label={`${field.label}: ${recorded ? value : 'not recorded'}`}>{recorded ? value : '--'}</output>
      <button type="button" className="sc-step" aria-label={`${field.label} plus 1`} onClick={() => onChange(stepCount(value, 1))}>+1</button>
      <button type="button" className="sc-step" aria-label={`${field.label} plus 5`} onClick={() => onChange(stepCount(value, 5))}>+5</button>
    </div>
    <div className="sc-count-foot">
      {recorded ? <button type="button" className="sc-clear" onClick={() => onChange(undefined)}>Clear (not recorded)</button>
        : <><span className="sc-help">Not recorded</span><button type="button" className="sc-clear" onClick={() => onChange(0)}>Saw zero</button></>}
    </div>
  </fieldset>
}

function Toggle({ field, value, options, onChange }) {
  return <fieldset className="sc-choice" data-field={field.key}><legend>{field.label}</legend><div className="sc-choice-options">
    {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)}>{text}</button>)}
  </div></fieldset>
}

export default function MatchFields({ value = {}, onChange }) {
  const set = (key, v) => {
    const next = { ...value }
    if (v === undefined) delete next[key]; else next[key] = v
    onChange(next)
  }
  return <div className="sc-match-fields">
    <p className="sc-help">Record only what you saw. A field you skip stays not recorded, never zero. Tap a selected answer again to clear it.</p>
    {PHASES.map(([phase, title]) => <section key={phase} className="sc-phase" aria-label={title}>
      <h3 className="sc-phase-title">{title}</h3>
      {MATCH_FIELDS.filter(f => f.phase === phase).map(f => {
        if (f.type === 'count') return <Count key={f.key} field={f} value={value[f.key]} onChange={v => set(f.key, v)} />
        if (f.type === 'yesno') return <Toggle key={f.key} field={f} value={value[f.key]} options={YES_NO} onChange={v => set(f.key, v)} />
        if (f.type === 'choice') return <Toggle key={f.key} field={f} value={value[f.key]} options={f.options} onChange={v => set(f.key, v)} />
        if (f.type === 'rating') return <Toggle key={f.key} field={f} value={value[f.key]} options={[1, 2, 3, 4, 5].map(n => [n, String(n)])} onChange={v => set(f.key, v)} />
        return <label key={f.key}>{f.label}<input maxLength="500" value={value[f.key] ?? ''} placeholder="Foul or card, if any" onChange={e => set(f.key, e.target.value === '' ? undefined : e.target.value)} /></label>
      })}
    </section>)}
  </div>
}
