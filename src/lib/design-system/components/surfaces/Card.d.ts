import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface CardProps {
  /** Remove the padding so media can run to the card edge. */
  flush?: boolean
  as?: ElementType
  className?: string
  /** slot="title", slot="meta", slot="foot"; everything else is the body. */
  children: ReactNode
}

export declare function Card(props: CardProps): JSX.Element
