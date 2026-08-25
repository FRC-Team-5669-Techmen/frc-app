import type { ElementType, ReactNode } from 'react'

export type Alliance = 'red' | 'blue'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ScoutTableProps {
  defaultActive?: string | null
  className?: string
  /** slot="col" per column, optional slot="caption", then ScoutRow children. */
  children: ReactNode
}

export interface ScoutRowProps {
  id?: string
  /** Alliance colors resolve only on the FIELD ground; the word always shows. */
  alliance?: Alliance
  className?: string
  onClick?: (e: unknown) => void
  /** slot="team", then slot="cell" per column. */
  children: ReactNode
}

export declare function ScoutTable(props: ScoutTableProps): JSX.Element
export declare function ScoutRow(props: ScoutRowProps): JSX.Element
