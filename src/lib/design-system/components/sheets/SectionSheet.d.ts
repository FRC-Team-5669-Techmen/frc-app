import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface SectionSheetProps extends SheetBaseProps {
  /** Part number. Chrome, not copy: the part NAME is a child. */
  index?: number
  /** slot="eyebrow", slot="title", slot="lede". */
  children: ReactNode
}

export declare function SectionSheet(props: SectionSheetProps): JSX.Element
