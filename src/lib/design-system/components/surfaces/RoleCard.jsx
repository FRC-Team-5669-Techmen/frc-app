import { cx } from '../cx.js'
import { pickSlots, slotList, slotted } from '../slots.jsx'

const DENSITIES = ['default', 'compact']

/**
 * RoleCard - a member: who they are, which subteams they sit on, what they are
 * certified to run.
 *
 * It matches the app model - subteams from src/subteams.js, certifications with
 * the member_skills states certified / in_progress and the skills
 * safety_critical flag - but it TAKES ITS DATA AS PROPS AND CHILDREN. It never
 * queries Supabase: a deck component that fetched would put an auth dependency
 * on a projector in a gym with no network.
 *
 *   <RoleCard>
 *     <Cutout slot="media" src={...} />
 *     <span slot="name">Alex Rivera</span>
 *     <span slot="title">Drive coach</span>
 *     <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
 *     <li slot="cert" data-status="certified" data-safety>Mill</li>
 *     <p slot="note">Runs the pit checklist.</p>
 *   </RoleCard>
 *
 * THE CARD OWNS ITS OWN TYPE SCALE, PADDING AND GAPS. A deck that sets
 * font-size, padding, gap or grid-template-columns on a RoleCard or on
 * anything inside one is reimplementing the component, which the inheritance
 * rules forbid. That is what `density` exists to prevent:
 *
 *   default - up to about four cards on a sheet. Media sits BESIDE the text.
 *   compact - six or more cards on one sheet. Media sits ABOVE the text, and
 *             the card drops to the smaller scale and tighter padding by
 *             itself. Nothing about the smaller size is a deck's job to state.
 *
 * A grid of them wants the `frc-role-grid` class on the wrapper, which carries
 * the column rule and the gutter for both densities. That is the whole reason
 * it exists: a deck laying out nine of these should name a system class, never
 * hand-write gridTemplateColumns and gap.
 *
 * The media slot is optional, and when it is empty it renders the same marked
 * empty slot every other artwork-bearing component in the system renders, so
 * an unfilled card reads as a slot waiting for a photo rather than as a card
 * that failed to lay out.
 */
export function RoleCard({
  as: Tag = 'article',
  density = 'default',
  mediaFile,
  className,
  children,
  ...rest
}) {
  const d = DENSITIES.includes(density) ? density : 'default'
  const { slots, rest: extra } = pickSlots(children)
  // `portrait` is the original slot name and keeps working unchanged.
  const media = slots.media ?? slots.portrait
  const subteams = slotList(slots.subteam)
  const certs = slotList(slots.cert)
  return (
    <Tag
      className={cx('frc-role', className)}
      data-frc="RoleCard"
      data-density={d}
      {...rest}
    >
      <div className="frc-role-media">
        {media ?? (
          <span className="frc-frame-empty">
            {mediaFile ? `Empty slot - expected ${mediaFile}` : 'Empty portrait slot'}
          </span>
        )}
      </div>
      <div className="frc-role-body">
        {slotted(slots.name, 'frc-role-name', 'h3')}
        {slotted(slots.title, 'frc-role-title')}
        {subteams.length ? <div className="frc-role-tags">{subteams}</div> : null}
        {certs.length ? <ul className="frc-role-certs">{certs.map((c, i) => slotted(c, 'frc-role-cert', 'li', i))}</ul> : null}
        {slotted(slots.note, 'frc-role-note', 'p')}
        {extra}
      </div>
    </Tag>
  )
}
