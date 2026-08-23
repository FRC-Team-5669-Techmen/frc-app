import type { ElementType, ReactNode } from 'react'

export type StepState = 'default' | 'done' | 'current'

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
