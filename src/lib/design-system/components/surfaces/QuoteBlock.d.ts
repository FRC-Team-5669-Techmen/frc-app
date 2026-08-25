import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface QuoteBlockProps {
  as?: ElementType
  className?: string
  /** slot="text", slot="attr", slot="role". */
  children: ReactNode
}

export declare function QuoteBlock(props: QuoteBlockProps): JSX.Element
