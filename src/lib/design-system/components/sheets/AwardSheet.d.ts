import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface AwardSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="plate" (AwardPlate); every other child is the side column. */
  children: ReactNode
}

export declare function AwardSheet(props: AwardSheetProps): JSX.Element
