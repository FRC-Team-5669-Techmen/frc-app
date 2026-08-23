import type { ElementType, ReactNode } from 'react'

export interface AllianceSplitProps {
  /** Which side won. Marked in --ok, never by loudening an alliance color. */
  outcome?: 'red' | 'blue' | null
  as?: ElementType
  className?: string
  /** slot="red-tag" | "red-score" | "red-teams" | "vs" | "blue-tag" | "blue-score" | "blue-teams". */
  children: ReactNode
}

export declare function AllianceSplit(props: AllianceSplitProps): JSX.Element
