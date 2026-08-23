import type { HTMLAttributes } from 'react'

export type ChevronRailTone = 'accent' | 'dim' | 'structure'

export interface ChevronRailProps extends HTMLAttributes<HTMLDivElement> {
  /** accent (gold / bronze on paper) | dim (ash) | structure (space gray). */
  tone?: ChevronRailTone
  /** Rail height in px. Structural, not copy. */
  height?: number
}

export declare function ChevronRail(props: ChevronRailProps): JSX.Element
