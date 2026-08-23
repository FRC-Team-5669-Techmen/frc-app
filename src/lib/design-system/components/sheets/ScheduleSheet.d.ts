import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface ScheduleSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="key" repeated, slot="foot"; the child is the GanttChart or table. */
  children: ReactNode
}

export declare function ScheduleSheet(props: ScheduleSheetProps): JSX.Element
