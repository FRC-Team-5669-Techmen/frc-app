import type { ElementType, ReactNode } from 'react'

export interface FieldProps {
  inline?: boolean
  /** Mono, tabular value - for measurements and codes. */
  mono?: boolean
  as?: ElementType
  className?: string
  /** slot="label" and slot="value". */
  children: ReactNode
}

export declare function Field(props: FieldProps): JSX.Element
