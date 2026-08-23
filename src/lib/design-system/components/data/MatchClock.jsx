import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/** Real FRC match timing: 0:20 autonomous, then 2:20 teleop. */
export const MATCH_PHASES = {
  auto:   { seconds: 20,  label: 'Autonomous', warnAt: 5 },
  teleop: { seconds: 140, label: 'Teleop',     warnAt: 30 },
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * MatchClock - the match clock at projection scale, and SILENT: it renders a
 * time, it does not run one. A deck component that counted down on its own
 * would put a moving number on a printed sheet and would disagree with the
 * field the moment the field paused.
 *
 * Base state is the FULL duration of the phase, which is what "base styles are
 * the visible end state" means for a timer.
 *
 * Copper (--warn) at the warning threshold. At zero it uses rust (--fault),
 * NOT alliance red: a sheet carrying a match clock also carries alliance
 * colors, and a red zero state is unreadable there.
 */
export function MatchClock({ phase = 'teleop', remaining, warnAt, as: Tag = 'div', className, children, ...rest }) {
  const spec = MATCH_PHASES[phase] || MATCH_PHASES.teleop
  const total = spec.seconds
  const left = remaining == null ? total : Math.max(0, Math.min(total, remaining))
  const threshold = warnAt == null ? spec.warnAt : warnAt
  const state = left <= 0 ? 'zero' : left <= threshold ? 'warn' : 'rest'
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag
      className={cx('frc-clock', className)}
      data-frc="MatchClock"
      data-phase={phase}
      data-state={state}
      {...rest}
    >
      {slots.phase
        ? slotted(slots.phase, 'frc-clock-phase', 'p')
        : <p className="frc-clock-phase">{spec.label}</p>}
      <p className="frc-clock-time frc-numeral">{formatClock(left)}</p>
      <div className="frc-clock-track">
        <div className="frc-clock-fill" style={{ '--pct': total > 0 ? (left / total) * 100 : 0 }} />
      </div>
      {slotted(slots.note, 'frc-clock-note', 'p')}
      {extra}
    </Tag>
  )
}
