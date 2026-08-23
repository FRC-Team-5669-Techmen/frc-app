import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface MatchBreakdownSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="score" (AllianceSplit), slot="clock" (MatchClock), slot="red", slot="blue"; the child is the scouting table or notes. */
  children: ReactNode
}

export declare function MatchBreakdownSheet(props: MatchBreakdownSheetProps): JSX.Element
