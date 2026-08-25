import type { HTMLAttributes } from 'react'

export type MarkVariant = 'gold' | 'white' | 'black' | 'auto'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface MarkGlyphProps extends HTMLAttributes<HTMLSpanElement> {
  /** One of the three published versions, or auto (gold on dark grounds, black on paper). */
  variant?: MarkVariant
  /** Explicit URL; otherwise assets.js. Null renders the empty slot. */
  src?: string | null
  /** Square size in px. Floor 24. */
  size?: number
  alt?: string
}

export declare function MarkGlyph(props: MarkGlyphProps): JSX.Element
