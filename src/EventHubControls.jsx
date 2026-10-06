// The family page's form controls (event family hub). Every question is a
// <Q>: a large plain-language label, an optional (i) info card that opens on a
// tap (and on hover where there is a mouse), an optional hint, the control,
// and the field's save state. Nothing here decides a rule; a control sends an
// answer and shows what the server said.
import { useEffect, useId, useRef, useState } from 'react'
import { fmtTime } from './eventHub'
import { IconCheck, IconChevron, IconInfo } from './eventIcons'

/** "Saving", "Saved 2:41 PM", "Not saved, retrying", or a refusal sentence. */
export function SaveNote({ s, tz }) {
  if (!s) return null
  const text = s.state === 'saving' ? 'Saving'
    : s.state === 'saved' ? `Saved ${fmtTime(s.at, tz)}`
      : s.state === 'retrying' ? 'Not saved, retrying'
        : s.message
  return <span className={`eh-save eh-save-${s.state}`} aria-live="polite" data-testid="eh-save">{text}</span>
}

const canHover = () => {
  try { return window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? false } catch { return false }
}

/**
 * The (i) beside a question. A tap pins the card open until a second tap, the
 * close button, Escape or a tap elsewhere; with a mouse, hovering shows it too.
 */
export function InfoTip({ children, label = 'More about this question' }) {
  const [pinned, setPinned] = useState(false)
  const [hover, setHover] = useState(false)
  const id = useId()
  const box = useRef(null)
  const open = pinned || hover
  // Closing also drops the hover, or a mouse still over the (i) would keep
  // the card up after "Got it".
  const close = () => { setPinned(false); setHover(false) }
  useEffect(() => {
    if (!pinned) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) { setPinned(false); setHover(false) } }
    const esc = (e) => { if (e.key === 'Escape') { setPinned(false); setHover(false) } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [pinned])
  return (
    <span className="eh-tip" ref={box}
          onMouseEnter={() => { if (canHover()) setHover(true) }}
          onMouseLeave={() => setHover(false)}>
      <button type="button" className={`eh-tip-btn${open ? ' eh-tip-on' : ''}`} aria-expanded={open} aria-controls={id}
              aria-label={label} data-testid="eh-tip-btn" onClick={() => { if (pinned) close(); else setPinned(true) }}>
        <IconInfo size={18} />
      </button>
      {open && (
        <span className="eh-tip-card" id={id} role="note" data-testid="eh-tip-card">
          <span className="eh-tip-text">{children}</span>
          {pinned && <button type="button" className="eh-tip-close" onClick={close}>Got it</button>}
        </span>
      )}
    </span>
  )
}

/** A question: label, info card, hint, the control, its save state. */
export function Q({ label, info, hint, children, s, tz, testid, as = 'fieldset', className = '' }) {
  const Tag = as
  const Head = as === 'fieldset' ? 'legend' : 'div'
  return (
    <Tag className={`eh-q ${className}`} data-testid={testid}>
      <Head className="eh-q-head">
        <span className="eh-q-label">{label}</span>
        {info && <InfoTip>{info}</InfoTip>}
      </Head>
      {hint && <p className="eh-hint">{hint}</p>}
      {children}
      <SaveNote s={s} tz={tz} />
    </Tag>
  )
}

/** Chips: short answers side by side (Yes / No, Coming / Not coming). */
export function Choice({ k, label, info, hint, options, value, onPick, ctx, disabled, children, testid }) {
  return (
    <Q label={label} info={info} hint={hint} s={ctx.states[k]} tz={ctx.tz} testid={testid}>
      <div className="eh-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.on ?? value === o.value
          return (
            <button key={o.key ?? String(o.value)} type="button" role="radio" aria-checked={on}
                    className={`eh-chip${on ? ' eh-chip-on' : ''}${o.tone ? ` eh-chip-${o.tone}` : ''}`} disabled={disabled}
                    onClick={() => onPick(o.value)}>
              {on && <IconCheck size={16} />}{o.label}
            </button>
          )
        })}
      </div>
      {children}
    </Q>
  )
}

/** Option cards: one big tappable card per answer, with an icon and a line
 *  saying what it means. For the questions people get wrong when the choices
 *  are bare words (how a student gets somewhere). */
export function Options({ k, label, info, hint, options, value, onPick, ctx, disabled, children, testid, assumed }) {
  // Once answered, the question shrinks to the chosen card and a Change
  // button, so a page of answered questions is short and easy to scan. An
  // answer the page ASSUMED (nobody picked it yet) stays open with every
  // card showing and says so, so nobody skips past a choice they never made.
  const [open, setOpen] = useState(false)
  const chosen = options.find((o) => o.value === value)
  const shut = !!chosen && !open && !assumed
  const shown = shut ? [chosen] : options
  return (
    <Q label={label} info={info} hint={hint} s={ctx.states[k]} tz={ctx.tz} testid={testid}>
      {assumed && chosen && !disabled && <p className="eh-assumed" data-testid="eh-assumed">{assumed}</p>}
      <div className={`eh-options${shut ? ' eh-options-shut' : ''}`} role="radiogroup" aria-label={label}>
        {shown.map((o) => {
          const on = value === o.value
          const Icon = o.icon
          return (
            <button key={String(o.value)} type="button" role="radio" aria-checked={on} disabled={disabled}
                    className={`eh-option${on ? ' eh-option-on' : ''}`}
                    onClick={() => { if (shut) { setOpen(true); return } setOpen(false); onPick(o.value) }}>
              {Icon && <span className="eh-option-icon"><Icon size={24} /></span>}
              <span className="eh-option-text">
                <span className="eh-option-title">{o.label}</span>
                {o.sub && <span className="eh-option-sub">{o.sub}</span>}
              </span>
              <span className="eh-option-mark" aria-hidden="true">{on ? <IconCheck size={18} /> : null}</span>
            </button>
          )
        })}
        {shut && !disabled && (
          <button type="button" className="eh-btn eh-btn-quiet eh-option-change" onClick={() => setOpen(true)} data-testid="eh-option-change">
            Change this answer
          </button>
        )}
      </div>
      {children}
    </Q>
  )
}

export function Tick({ k, label, info, checked, onToggle, ctx, disabled, hint, testid }) {
  return (
    <div className="eh-tick-wrap">
      <div className="eh-tick-row">
        <button type="button" role="checkbox" aria-checked={!!checked} className={`eh-tick${checked ? ' eh-tick-on' : ''}`}
                disabled={disabled} onClick={() => onToggle(!checked)} data-testid={testid}>
          <span className="eh-tick-box" aria-hidden="true">{checked ? <IconCheck size={16} /> : null}</span>
          <span>{label}</span>
        </button>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {hint && <p className="eh-hint">{hint}</p>}
      <SaveNote s={ctx.states[k]} tz={ctx.tz} />
    </div>
  )
}

/** A text answer that saves itself a moment after typing stops, and on blur.
 *  With `format` (phones), the box shows the formatted value and keeps
 *  showing it while focused, so tapping in never rewrites what is under the
 *  cursor; what was typed is what is saved, and it is formatted on blur. */
export function Text({ k, label, info, hint, value, onCommit, ctx, disabled, type = 'text', inputMode, autoComplete, placeholder,
  multiline = false, maxLength, testid, wait = 800, format }) {
  const shown = (v) => (format && v ? format(v) : (v ?? ''))
  const [local, setLocal] = useState(shown(value))
  const focused = useRef(false)
  const last = useRef(value ?? '')
  const timer = useRef(null)
  useEffect(() => {
    if (!focused.current && !timer.current) { setLocal(shown(value)); last.current = value ?? '' }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), [])
  const same = (a, b) => (format ? shown(a) === shown(b) : a === b)
  const commit = (v) => {
    clearTimeout(timer.current)
    timer.current = null
    if (same(v, last.current)) return
    last.current = v
    onCommit(v)
  }
  const change = (v) => {
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(v), wait)
  }
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <Q as="div" label={label} info={info} hint={hint} s={ctx.states[k]} tz={ctx.tz} className="eh-field">
      <Tag className="eh-input" type={multiline ? undefined : type} inputMode={inputMode} autoComplete={autoComplete}
           placeholder={placeholder} maxLength={maxLength} disabled={disabled} data-testid={testid}
           value={local} aria-label={label} rows={multiline ? 2 : undefined}
           onFocus={() => { focused.current = true }}
           onBlur={(e) => { focused.current = false; commit(e.target.value); if (format) setLocal(shown(e.target.value)) }}
           onChange={(e) => change(e.target.value)} />
    </Q>
  )
}

/**
 * A count: 0 to 4 as chips, then "5 or more", which opens a minus / number /
 * plus row up to `max`. A value already above 4 opens on the row.
 */
export function CountPicker({ k, label, info, hint, value, onPick, ctx, disabled, max = 30, testid }) {
  const big = value != null && value > 4
  const [more, setMore] = useState(big)
  useEffect(() => { if (big) setMore(true) }, [big])
  const n = value ?? 5
  const set = (v) => onPick(Math.max(0, Math.min(max, v)))
  return (
    <Q label={label} info={info} hint={hint} s={ctx.states[k]} tz={ctx.tz} testid={testid}>
      <div className="eh-chips" role="radiogroup" aria-label={label}>
        {[0, 1, 2, 3, 4].map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled}
                  className={`eh-chip eh-chip-num${value === v ? ' eh-chip-on' : ''}`}
                  onClick={() => { setMore(false); onPick(v) }}>{v}</button>
        ))}
        {max > 4 && (
          <button type="button" role="radio" aria-checked={big} disabled={disabled}
                  className={`eh-chip${big ? ' eh-chip-on' : ''}`} data-testid="eh-count-more"
                  onClick={() => { setMore(true); if (!big) onPick(5) }}>5 or more</button>
        )}
      </div>
      {more && max > 4 && (
        <div className="eh-stepper-row">
          <button type="button" className="eh-btn eh-step-btn" disabled={disabled || n <= 5} aria-label="One fewer"
                  onClick={() => set(n - 1)}>−</button>
          <input className="eh-input eh-count-input" type="number" inputMode="numeric" min={5} max={max} disabled={disabled}
                 value={big ? value : ''} aria-label={`${label}, exact number`} data-testid="eh-count-input"
                 onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) set(v) }} />
          <button type="button" className="eh-btn eh-step-btn" disabled={disabled || n >= max} aria-label="One more"
                  onClick={() => set(n + 1)}>+</button>
        </div>
      )}
    </Q>
  )
}

/** A collapsible block: a big header row that opens and closes the body. */
export function Fold({ title, icon: Icon, children, defaultOpen = false, tone, testid, sub, feature = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  // feature: a fold that holds something people need (the carpool board, the
  // food sign-up), drawn as a coloured card with an Open / Close label so it
  // does not read as a footnote.
  return (
    <section className={`eh-fold${open ? ' eh-fold-open' : ''}${tone ? ` eh-tone-${tone}` : ''}${feature ? ' eh-fold-feature' : ''}`} data-testid={testid}>
      <button type="button" className="eh-fold-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {Icon && <span className="eh-fold-icon"><Icon size={20} /></span>}
        <span className="eh-fold-title">{title}{sub && <span className="eh-fold-sub">{sub}</span>}</span>
        {feature && <span className="eh-fold-cta" aria-hidden="true">{open ? 'Close' : 'Open'}</span>}
        <span className="eh-fold-chev" aria-hidden="true"><IconChevron size={20} /></span>
      </button>
      {open && <div className="eh-fold-body" id={id}>{children}</div>}
    </section>
  )
}
