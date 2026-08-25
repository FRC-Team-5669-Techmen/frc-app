import type { HTMLAttributes, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SeasonLockupProps extends HTMLAttributes<HTMLDivElement> {
  /** Season years, rendered as given. Convention: 2026-27. */
  years?: string
  /** Season artwork. Null renders the empty slot. */
  src?: string | null
  artWidth?: number
  artHeight?: number
  /** The season name. Copy. */
  children: ReactNode
}

export declare function SeasonLockup(props: SeasonLockupProps): JSX.Element
