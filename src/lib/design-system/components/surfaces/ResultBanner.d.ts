import type { ElementType, ReactNode } from 'react'

export type ResultTone = 'rank' | 'win' | 'loss'

export interface ResultBannerProps {
  /** win is --ok and loss is --fault. Never an alliance color. */
  tone?: ResultTone
  as?: ElementType
  className?: string
  /** slot="tag", slot="title", slot="note", slot="score". */
  children: ReactNode
}

export declare function ResultBanner(props: ResultBannerProps): JSX.Element
