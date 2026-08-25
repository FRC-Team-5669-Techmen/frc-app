import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SampleGridProps {
  cols?: number
  as?: ElementType
  className?: string
  /** slot="caption", then Sample children. */
  children: ReactNode
}

export interface SampleProps {
  src?: string
  alt?: string
  as?: ElementType
  className?: string
  /** slot="name", slot="note"; any other child is the media. */
  children?: ReactNode
}

export declare function SampleGrid(props: SampleGridProps): JSX.Element
export declare function Sample(props: SampleProps): JSX.Element
