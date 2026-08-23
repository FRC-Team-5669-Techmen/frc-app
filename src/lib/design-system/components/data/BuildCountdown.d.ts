import type { ElementType, ReactNode } from 'react'

export interface BuildCountdownProps {
  /** A NUMBER, never a date: a deck must read the same in the shop and in the PDF. */
  value?: number
  /** Short fixed chrome, so it is allowed as a prop. */
  unit?: string
  /** Copper at or below this value. */
  warnAt?: number
  /** Rust at or below this value. */
  dueAt?: number
  as?: ElementType
  className?: string
  /** slot="label". */
  children?: ReactNode
}

export declare function BuildCountdown(props: BuildCountdownProps): JSX.Element
