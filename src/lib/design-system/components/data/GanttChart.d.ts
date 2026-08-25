import type { ElementType, ReactNode } from 'react'

export type GanttState = 'default' | 'done' | 'risk' | 'blocked'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface GanttChartProps {
  /** Column count for the lane grid. */
  cols?: number
  /** Today marker, as a percentage of the span. */
  today?: number | null
  as?: ElementType
  className?: string
  /** slot="tick" per column, then GanttBar children. */
  children: ReactNode
}

export interface GanttBarProps {
  /** Percentage of the whole span. */
  start?: number
  span?: number
  state?: GanttState
  className?: string
  /** slot="label" for the row; slot="bar" for copy inside the bar. */
  children: ReactNode
}

export declare function GanttChart(props: GanttChartProps): JSX.Element
export declare function GanttBar(props: GanttBarProps): JSX.Element
