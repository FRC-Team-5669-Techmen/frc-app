import type { ElementType, ReactNode } from 'react'

export interface CardProps {
  /** Remove the padding so media can run to the card edge. */
  flush?: boolean
  as?: ElementType
  className?: string
  /** slot="title", slot="meta", slot="foot"; everything else is the body. */
  children: ReactNode
}

export declare function Card(props: CardProps): JSX.Element
