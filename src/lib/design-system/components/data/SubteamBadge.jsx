import { cx } from '../cx.js'
import { SUBTEAMS, isSubteam } from '../../../../subteams.js'

// The vocabulary is NOT copied here. src/subteams.js is the single source of
// truth for this app (profiles.subteams stores those literals and
// member_applications CHECK-pins them), so the deck reads the same list the
// roster does and a new subteam needs no edit in this file.
export { SUBTEAMS }

/**
 * SubteamBadge - one subteam from the team vocabulary. The name is the child.
 * There is deliberately no color or icon map keyed to the list: the list grows,
 * and a per-value map drops every new value into an unstyled default.
 * A string that is not in the vocabulary still renders (nothing is swallowed)
 * but is marked, so a typo is visible on the sheet instead of silent.
 */
/** The subteam-badge contract as PROPS. It still READS the name, because marking
 *  a value that is not in the team vocabulary is the component's whole job — that
 *  behaviour survives being painted rather than wrapped. */
export function subteamBadgeProps(name, { lead = false, className } = {}) {
  const n = typeof name === 'string' ? name.trim() : null
  const known = n === null ? true : isSubteam(n)
  return {
    className: cx('frc-subteam', !known && 'frc-subteam-unknown', lead && 'frc-subteam-lead', className),
    'data-frc': 'SubteamBadge',
    'data-subteam': n || undefined,
    title: known ? undefined : `"${n}" is not in the team subteam vocabulary (src/subteams.js)`,
  }
}

export function SubteamBadge({ lead = false, as: Tag = 'span', className, children, ...rest }) {
  const name = typeof children === 'string' ? children.trim() : null
  const known = name === null ? true : isSubteam(name)
  return (
    <Tag
      className={cx('frc-subteam', !known && 'frc-subteam-unknown', lead && 'frc-subteam-lead', className)}
      data-frc="SubteamBadge"
      data-subteam={name || undefined}
      title={known ? undefined : `"${name}" is not in the team subteam vocabulary (src/subteams.js)`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
