import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface CompareSplitProps {
  as?: ElementType
  className?: string
  /** slot="label", slot="option-a", slot="option-b", then CompareRow children. */
  children: ReactNode
}

export interface CompareRowProps {
  /** Which side wins THIS row. The other side stays fully rendered. */
  lead?: 'a' | 'b'
  as?: ElementType
  className?: string
  /** slot="label", slot="a", slot="b". */
  children: ReactNode
}

export declare function CompareSplit(props: CompareSplitProps): JSX.Element
export declare function CompareRow(props: CompareRowProps): JSX.Element
