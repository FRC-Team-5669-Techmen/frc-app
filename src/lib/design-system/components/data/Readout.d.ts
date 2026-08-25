import type { ElementType, ReactNode } from 'react'

export type ReadoutTone = 'default' | 'ok' | 'warn' | 'fault'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ReadoutProps {
  tone?: ReadoutTone
  as?: ElementType
  className?: string
  /** slot="label" and slot="value". */
  children: ReactNode
}

export declare function Readout(props: ReadoutProps): JSX.Element
