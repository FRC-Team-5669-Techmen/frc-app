// FRC5669DesignSystem — invariant guards.
//
// Several rules in the specification are enforced in component code rather than
// left to prose: ImageFrame rejects bleed on a screenshot, Cutout rejects
// fit="cover", SponsorTier rejects a mark that is not a floating Cutout,
// SafetySheet rejects a body with no SafetyNote, and FirstName rejects plural
// and possessive forms of the FIRST name.
//
// EVERY GUARD RENDERS A VISIBLE RUST FAULT MARKER AT RUN TIME AND THROWS ONLY
// INSIDE THE DEV HARNESS.
//
// A guard that throws during a presentation takes the whole deck down in front
// of the room, and it does it on the external decks that matter most — the
// judge deck, the sponsor deck — which is the opposite of what the guard is
// for. A visible marker fails loudly enough to be caught and cheaply enough to
// be survived: the presenter sees a rust block where the sheet should be, and
// keeps presenting.
//
// The marker is NOT a soft landing. `npm run ds:audit` fails on any fault
// marker in a template, and pre-delivery audit check 40 requires zero markers
// in any deck called finished. The guard's real job is done at audit time; its
// run-time behaviour only decides how badly a miss hurts.
//
// There is ONE guard behaviour in this system. FirstName used to throw on an
// external audience and warn otherwise; that split is gone, because two guard
// behaviours in one system means nobody can predict what a guard does.
import { cx } from './cx.js'

let harness = false

/**
 * The dev harness (the /_ds route, the capture script, a test) turns this on so
 * a guard throws and the failure is impossible to skim past. A deck never does.
 */
export function setHarnessMode(on) {
  harness = Boolean(on)
}

export function isHarnessMode() {
  return harness
}

/**
 * FaultMarker — what a tripped guard renders. Rust, mono, uppercase, sized to
 * be seen from the back of a shop bay, and carrying the rule it broke so the
 * person who reads it knows what to fix.
 */
export function FaultMarker({ component, rule, detail, as: Tag = 'div', className, ...rest }) {
  return (
    <Tag
      className={cx('frc-fault', className)}
      data-frc-fault={component}
      role="alert"
      {...rest}
    >
      <span className="frc-fault-tag">Design system fault</span>
      <span className="frc-fault-rule">{`${component}: ${rule}`}</span>
      {detail ? <span className="frc-fault-detail">{detail}</span> : null}
    </Tag>
  )
}

/**
 * Trip a guard.
 *
 * Returns the marker element to render in place of the component. Inside the
 * dev harness it throws first, so a build, a proof or a capture run fails
 * rather than quietly producing a deck with a rust block in it.
 */
export function fault(component, rule, detail, markerProps) {
  const message = detail ? `${component}: ${rule} ${detail}` : `${component}: ${rule}`
  if (harness) throw new Error(message)
  return <FaultMarker component={component} rule={rule} detail={detail} {...markerProps} />
}
