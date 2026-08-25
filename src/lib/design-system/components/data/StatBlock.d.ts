import type { ElementType, ReactNode } from 'react'

export type StatTone = 'default' | 'hero' | 'ok' | 'warn' | 'fault'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface StatBlockProps {
  /** hero adds the rationed glow (zero on paper, by alias). */
  tone?: StatTone
  size?: 'md' | 'sm'
  as?: ElementType
  className?: string
  /** slot="value", slot="unit", slot="label", slot="note". */
  children: ReactNode
}

export declare function StatBlock(props: StatBlockProps): JSX.Element
