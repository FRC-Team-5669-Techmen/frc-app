import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface ClosingSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="next", slot="sponsors" (external chrome), slot="attribution". */
  children: ReactNode
}

export declare function ClosingSheet(props: ClosingSheetProps): JSX.Element
