import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface JumpGridProps {
  cols?: number
  as?: ElementType
  className?: string
  /** JumpCard children. Part numbers come from position. */
  children: ReactNode
}

export interface JumpCardProps {
  href?: string
  index?: number
  state?: 'default' | 'done'
  className?: string
  /** slot="title", slot="note". */
  children: ReactNode
}

export declare function JumpGrid(props: JumpGridProps): JSX.Element
export declare function JumpCard(props: JumpCardProps): JSX.Element
