import type { ElementType, ReactNode } from 'react'

export interface CompareSplitProps {
  as?: ElementType
  className?: string
  /** slot="label", slot="option-a", slot="option-b", then CompareRow children. */
  children: ReactNode
}

export interface CompareRowProps {
  /** Which side wins THIS row. The other side stays fully rendered. */
  lead?: 'a' | 'b'
  as?: ElementType
  className?: string
  /** slot="label", slot="a", slot="b". */
  children: ReactNode
}

export declare function CompareSplit(props: CompareSplitProps): JSX.Element
export declare function CompareRow(props: CompareRowProps): JSX.Element
