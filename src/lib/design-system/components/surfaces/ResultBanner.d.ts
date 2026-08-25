import type { ElementType, ReactNode } from 'react'

export type ResultTone = 'rank' | 'win' | 'loss'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ResultBannerProps {
  /** win is --ok and loss is --fault. Never an alliance color. */
  tone?: ResultTone
  as?: ElementType
  className?: string
  /** slot="tag", slot="title", slot="note", slot="score". */
  children: ReactNode
}

export declare function ResultBanner(props: ResultBannerProps): JSX.Element
