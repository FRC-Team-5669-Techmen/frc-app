import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface StatementSheetProps extends SheetBaseProps {
  size?: 'display' | 'hero' | 'h1'
  /** slot="eyebrow", slot="title", slot="attribution". */
  children: ReactNode
}

export declare function StatementSheet(props: StatementSheetProps): JSX.Element
