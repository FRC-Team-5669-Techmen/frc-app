import type { ElementType, ReactNode } from 'react'

export interface SafetyNoteProps {
  as?: ElementType
  className?: string
  /** slot="title" (defaults to Safety), slot="rule" repeated, slot="ppe" repeated; everything else is the body. */
  children: ReactNode
}

export declare function SafetyNote(props: SafetyNoteProps): JSX.Element
