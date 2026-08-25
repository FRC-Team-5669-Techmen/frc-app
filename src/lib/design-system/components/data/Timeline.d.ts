import type { ElementType, ReactNode } from 'react'

export type TimelineState = 'default' | 'done' | 'current' | 'risk'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
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
