import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface ProcedureSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="aside", then Step children. */
  children: ReactNode
}

export declare function ProcedureSheet(props: ProcedureSheetProps): JSX.Element
