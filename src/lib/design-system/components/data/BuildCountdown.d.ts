import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface BuildCountdownProps {
  /** A NUMBER, never a date: a deck must read the same in the shop and in the PDF. */
  value?: number
  /** Short fixed chrome, so it is allowed as a prop. */
  unit?: string
  /** Copper at or below this value. */
  warnAt?: number
  /** Rust at or below this value. */
  dueAt?: number
  as?: ElementType
  className?: string
  /** slot="label". */
  children?: ReactNode
}

export declare function BuildCountdown(props: BuildCountdownProps): JSX.Element
