import type { HTMLAttributes } from 'react'

export type MarkVariant = 'gold' | 'white' | 'black' | 'auto'

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
