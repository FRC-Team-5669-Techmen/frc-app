import type { ElementType, ReactNode } from 'react'

export interface SampleGridProps {
  cols?: number
  as?: ElementType
  className?: string
  /** slot="caption", then Sample children. */
  children: ReactNode
}

export interface SampleProps {
  src?: string
  alt?: string
  as?: ElementType
  className?: string
  /** slot="name", slot="note"; any other child is the media. */
  children?: ReactNode
}

export declare function SampleGrid(props: SampleGridProps): JSX.Element
export declare function Sample(props: SampleProps): JSX.Element
