import type { ElementType, ReactNode } from 'react'

/** The team subteam vocabulary, re-exported from src/subteams.js (one list, no copy). */
export declare const SUBTEAMS: string[]

export interface SubteamBadgeProps {
  /** Thicker rule for the subteam being led on this sheet. */
  lead?: boolean
  as?: ElementType
  className?: string
  /** The subteam name. A value outside the vocabulary still renders, but marked. */
  children: ReactNode
}

export declare function SubteamBadge(props: SubteamBadgeProps): JSX.Element
