import { cx } from '../cx.js'

/**
 * Chip - a tag, not a status (that is Badge). Selection is EMPHASIS only: a
 * chip never reveals content, because base state shows everything.
 * The label is the child; an optional count rides along.
 */
export function Chip({ selected = false, count, as: Tag = 'span', className, children, ...rest }) {
  return (
    <Tag
      className={cx('frc-chip', className)}
      data-frc="Chip"
      data-selected={selected ? '' : undefined}
      {...rest}
    >
      {children}
      {count != null ? <span className="frc-chip-count">{count}</span> : null}
    </Tag>
  )
}
