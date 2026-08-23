import { createContext, useContext, useId, useState } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const FocusCtx = createContext(null)

/**
 * FocusTable / FocusRow - a ranked list where clicking a row DIMS ITS SIBLINGS.
 * That is the whole interaction. Click targets may change emphasis; they may
 * never reveal content, so every row is fully rendered at rest and a printed or
 * reduced-motion copy of the sheet loses nothing.
 */
export function FocusTable({ defaultActive = null, as: Tag = 'div', className, children, ...rest }) {
  const [active, setActive] = useState(defaultActive)
  const { slots, rest: rows } = pickSlots(children)
  return (
    <FocusCtx.Provider value={{ active, setActive }}>
      <Tag
        className={cx('frc-focus', className)}
        data-frc="FocusTable"
        data-focus={active != null ? '' : undefined}
        {...rest}
      >
        {slotted(slots.caption, 'frc-spec-caption')}
        {rows}
      </Tag>
    </FocusCtx.Provider>
  )
}

export function FocusRow({ id, className, children, onClick, ...rest }) {
  const ctx = useContext(FocusCtx)
  const auto = useId()
  const key = id ?? auto
  const { slots, rest: extra } = pickSlots(children)
  const active = ctx ? ctx.active === key : false
  return (
    <button
      type="button"
      className={cx('frc-focus-row', className)}
      data-frc="FocusRow"
      data-active={active ? '' : undefined}
      onClick={(e) => {
        if (ctx) ctx.setActive(ctx.active === key ? null : key)
        if (onClick) onClick(e)
      }}
      {...rest}
    >
      {slotted(slots.rank, 'frc-focus-rank')}
      {slotted(slots.label, 'frc-focus-label')}
      {slotted(slots.value, 'frc-focus-value')}
      {extra}
    </button>
  )
}
