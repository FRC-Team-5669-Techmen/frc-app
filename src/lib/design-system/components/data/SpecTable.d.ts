import type { ElementType, ReactNode } from 'react'

export interface SpecTableProps {
  as?: ElementType
  className?: string
  /** slot="caption", then SpecRow children. */
  children: ReactNode
}

export interface SpecRowProps {
  /** Hero color on the value. One row per table, at most. */
  emphasis?: boolean
  as?: ElementType
  className?: string
  /** slot="label", slot="value", optional slot="note". */
  children: ReactNode
}

export declare function SpecTable(props: SpecTableProps): JSX.Element
export declare function SpecRow(props: SpecRowProps): JSX.Element
