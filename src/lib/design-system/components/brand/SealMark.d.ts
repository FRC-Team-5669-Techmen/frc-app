import type { HTMLAttributes } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SealMarkProps extends HTMLAttributes<HTMLSpanElement> {
  /** URL of assets/team/5669-Seal.svg. Null renders the empty slot. */
  src?: string | null
  /** Square size in px. Floor 48. */
  size?: number
  alt?: string
}

export declare function SealMark(props: SealMarkProps): JSX.Element
