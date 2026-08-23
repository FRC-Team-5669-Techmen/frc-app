import type { ElementType, ReactNode } from 'react'

export type ReadoutTone = 'default' | 'ok' | 'warn' | 'fault'

export interface ReadoutProps {
  tone?: ReadoutTone
  as?: ElementType
  className?: string
  /** slot="label" and slot="value". */
  children: ReactNode
}

export declare function Readout(props: ReadoutProps): JSX.Element
