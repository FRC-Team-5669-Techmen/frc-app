import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface TimelineSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="aside", then TimelineItem children. */
  children: ReactNode
}

export declare function TimelineSheet(props: TimelineSheetProps): JSX.Element
