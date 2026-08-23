import type { ElementType, ReactNode } from 'react'

export interface JumpGridProps {
  cols?: number
  as?: ElementType
  className?: string
  /** JumpCard children. Part numbers come from position. */
  children: ReactNode
}

export interface JumpCardProps {
  href?: string
  index?: number
  state?: 'default' | 'done'
  className?: string
  /** slot="title", slot="note". */
  children: ReactNode
}

export declare function JumpGrid(props: JumpGridProps): JSX.Element
export declare function JumpCard(props: JumpCardProps): JSX.Element
