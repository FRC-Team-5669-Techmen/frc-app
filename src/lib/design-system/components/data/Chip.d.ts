import type { ElementType, ReactNode } from 'react'

export interface ChipProps {
  /** Emphasis only. A chip never reveals content. */
  selected?: boolean
  count?: number | string
  as?: ElementType
  className?: string
  children: ReactNode
}

export declare function Chip(props: ChipProps): JSX.Element
