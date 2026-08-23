import { cx } from '../cx.js'
import { pickSlots, slotList, slotted } from '../slots.jsx'

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
 *     <Cutout slot="portrait" src={...} />
 *     <span slot="name">Alex Rivera</span>
 *     <span slot="title">Drive coach</span>
 *     <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
 *     <li slot="cert" data-status="certified" data-safety>Mill</li>
 *   </RoleCard>
 */
export function RoleCard({ as: Tag = 'article', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  const subteams = slotList(slots.subteam)
  const certs = slotList(slots.cert)
  return (
    <Tag className={cx('frc-role', className)} data-frc="RoleCard" {...rest}>
      <div className="frc-role-portrait">{slots.portrait}</div>
      <div className="frc-role-body">
        {slotted(slots.name, 'frc-role-name', 'h3')}
        {slotted(slots.title, 'frc-role-title')}
        {subteams.length ? <div className="frc-role-tags">{subteams}</div> : null}
        {certs.length ? <ul className="frc-role-certs">{certs.map((c, i) => slotted(c, 'frc-role-cert', 'li', i))}</ul> : null}
        {extra}
      </div>
    </Tag>
  )
}
