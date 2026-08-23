import type { ElementType, ReactNode } from 'react'

export type TimelineState = 'default' | 'done' | 'current' | 'risk'

export interface TimelineProps {
  as?: ElementType
  className?: string
  children: ReactNode
}

export interface TimelineItemProps {
  state?: TimelineState
  as?: ElementType
  className?: string
  /** slot="when", slot="title", slot="body". */
  children: ReactNode
}

export declare function Timeline(props: TimelineProps): JSX.Element
export declare function TimelineItem(props: TimelineItemProps): JSX.Element
