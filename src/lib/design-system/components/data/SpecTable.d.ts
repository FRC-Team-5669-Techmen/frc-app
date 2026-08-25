import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SpecTableProps {
  as?: ElementType
  className?: string
  /** slot="caption", then SpecRow children. */
  children: ReactNode
}

export interface SpecRowProps {
  /** Hero color on the value. One row per table, at most. */
  emphasis?: boolean
  as?: ElementType
  className?: string
  /** slot="label", slot="value", optional slot="note". */
  children: ReactNode
}

export declare function SpecTable(props: SpecTableProps): JSX.Element
export declare function SpecRow(props: SpecRowProps): JSX.Element
