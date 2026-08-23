import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface QuoteSheetProps extends SheetBaseProps {
  /** slot="portrait", slot="text", slot="attr", slot="role". */
  children: ReactNode
}

export declare function QuoteSheet(props: QuoteSheetProps): JSX.Element
