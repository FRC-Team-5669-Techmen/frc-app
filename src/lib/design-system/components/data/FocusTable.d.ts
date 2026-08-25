import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface FocusTableProps {
  /** id of the row focused at rest. */
  defaultActive?: string | null
  as?: ElementType
  className?: string
  children: ReactNode
}

export interface FocusRowProps {
  /** Stable id. Omitted, one is generated per instance. */
  id?: string
  className?: string
  onClick?: (e: unknown) => void
  /** slot="rank", slot="label", slot="value". */
  children: ReactNode
}

export declare function FocusTable(props: FocusTableProps): JSX.Element
export declare function FocusRow(props: FocusRowProps): JSX.Element
