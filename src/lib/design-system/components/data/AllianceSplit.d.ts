import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface AllianceSplitProps {
  /** Which side won. Marked in --ok, never by loudening an alliance color. */
  outcome?: 'red' | 'blue' | null
  as?: ElementType
  className?: string
  /** slot="red-tag" | "red-score" | "red-teams" | "vs" | "blue-tag" | "blue-score" | "blue-teams". */
  children: ReactNode
}

export declare function AllianceSplit(props: AllianceSplitProps): JSX.Element
