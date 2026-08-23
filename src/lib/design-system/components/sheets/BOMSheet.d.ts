import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface BOMSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="totals", slot="aside", then PartCallout children. */
  children: ReactNode
}

export declare function BOMSheet(props: BOMSheetProps): JSX.Element
