import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface FieldSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="aside"; the child is the FieldDiagram. */
  children: ReactNode
}

export declare function FieldSheet(props: FieldSheetProps): JSX.Element
