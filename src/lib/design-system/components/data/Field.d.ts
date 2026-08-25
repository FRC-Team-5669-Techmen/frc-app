import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface FieldProps {
  inline?: boolean
  /** Mono, tabular value - for measurements and codes. */
  mono?: boolean
  as?: ElementType
  className?: string
  /** slot="label" and slot="value". */
  children: ReactNode
}

export declare function Field(props: FieldProps): JSX.Element
