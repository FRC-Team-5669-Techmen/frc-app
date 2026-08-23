import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface ScoutingSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="aside"; the child is the ScoutTable. */
  children: ReactNode
}

export declare function ScoutingSheet(props: ScoutingSheetProps): JSX.Element
