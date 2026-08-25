import type { ElementType, ReactNode } from 'react'

export type StepState = 'default' | 'done' | 'current'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface StepCardProps {
  as?: ElementType
  className?: string
  /** slot="caption", then Step children. Numbering is a CSS counter. */
  children: ReactNode
}

export interface StepProps {
  state?: StepState
  as?: ElementType
  className?: string
  /** slot="title", slot="text". */
  children: ReactNode
}

export declare function StepCard(props: StepCardProps): JSX.Element
export declare function Step(props: StepProps): JSX.Element
