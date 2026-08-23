import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface DataSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="stat" repeated, slot="aside"; the child is the chart or table. */
  children: ReactNode
}

export declare function DataSheet(props: DataSheetProps): JSX.Element
