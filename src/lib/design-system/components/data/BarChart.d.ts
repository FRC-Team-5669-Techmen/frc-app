import type { ElementType, ReactNode } from 'react'

export type BarTone = 'default' | 'ok' | 'warn' | 'fault' | 'quiet'

export interface BarChartProps {
  /** The shared scale. Structure, not copy. */
  max?: number
  /** Optional target line, in the same units as max. */
  target?: number | null
  as?: ElementType
  className?: string
  /** slot="caption", then Bar children. */
  children: ReactNode
}

export interface BarProps {
  value?: number
  tone?: BarTone
  className?: string
  /** slot="label"; slot="value" overrides the printed number. */
  children: ReactNode
}

export declare function BarChart(props: BarChartProps): JSX.Element
export declare function Bar(props: BarProps): JSX.Element
