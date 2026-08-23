import { createContext, useContext, useId, useState } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotList, slotted } from '../slots.jsx'

const ScoutCtx = createContext(null)

/**
 * ScoutTable / ScoutRow - scouting data by team, with alliance side marked.
 *
 * ONE OF THE THREE components allowed to use --alliance-red / --alliance-blue,
 * and those only resolve inside .frc-ground-field. On SQUADRON or paper the row
 * stripe falls back to structure tones and the RED / BLUE word carries the
 * meaning instead, so alliance colour is never decoration.
 *
 * Clicking a row dims its siblings. It reveals nothing.
 */
export function ScoutTable({ defaultActive = null, className, children, ...rest }) {
  const [active, setActive] = useState(defaultActive)
  const { slots, rest: rows } = pickSlots(children)
  const cols = slotList(slots.col)
  return (
    <ScoutCtx.Provider value={{ active, setActive }}>
      <table
        className={cx('frc-scout', className)}
        data-frc="ScoutTable"
        data-focus={active != null ? '' : undefined}
        {...rest}
      >
        {slots.caption ? <caption className="frc-matrix-caption">{slots.caption}</caption> : null}
        <thead>
          <tr>{cols.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </ScoutCtx.Provider>
  )
}

export function ScoutRow({ id, alliance, className, children, onClick, ...rest }) {
  const ctx = useContext(ScoutCtx)
  const auto = useId()
  const key = id ?? auto
  const { slots } = pickSlots(children)
  const cells = slotList(slots.cell)
  const active = ctx ? ctx.active === key : false
  const toggle = () => { if (ctx) ctx.setActive(ctx.active === key ? null : key) }
  return (
    <tr
      className={cx('frc-scout-row', className)}
      data-frc="ScoutRow"
      data-alliance={alliance}
      data-active={active ? '' : undefined}
      tabIndex={0}
      onClick={(e) => { toggle(); if (onClick) onClick(e) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      {...rest}
    >
      <td>
        {slotted(slots.team, 'frc-scout-team')}
        {alliance ? <span className="frc-scout-tag">{alliance}</span> : null}
      </td>
      {cells.map((c, i) => <td key={i}>{c}</td>)}
    </tr>
  )
}
