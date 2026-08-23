import type { ElementType, ReactNode } from 'react'

export interface FocusTableProps {
  /** id of the row focused at rest. */
  defaultActive?: string | null
  as?: ElementType
  className?: string
  children: ReactNode
}

export interface FocusRowProps {
  /** Stable id. Omitted, one is generated per instance. */
  id?: string
  className?: string
  onClick?: (e: unknown) => void
  /** slot="rank", slot="label", slot="value". */
  children: ReactNode
}

export declare function FocusTable(props: FocusTableProps): JSX.Element
export declare function FocusRow(props: FocusRowProps): JSX.Element
