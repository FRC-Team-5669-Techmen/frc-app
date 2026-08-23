import type { ElementType, ReactNode } from 'react'

export interface QuoteBlockProps {
  as?: ElementType
  className?: string
  /** slot="text", slot="attr", slot="role". */
  children: ReactNode
}

export declare function QuoteBlock(props: QuoteBlockProps): JSX.Element
