import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface ComparisonSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="verdict"; the child is a CompareSplit or a DecisionMatrix. */
  children: ReactNode
}

export declare function ComparisonSheet(props: ComparisonSheetProps): JSX.Element
