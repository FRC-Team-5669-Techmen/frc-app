import type { ElementType, ReactNode } from 'react'

export type GanttState = 'default' | 'done' | 'risk' | 'blocked'

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
