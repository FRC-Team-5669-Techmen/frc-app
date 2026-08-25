import type { ElementType, ReactNode } from 'react'

export type BarTone = 'default' | 'ok' | 'warn' | 'fault' | 'quiet'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
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
