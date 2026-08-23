import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface SafetySheetProps extends SheetBaseProps {
  /** slot="note" (a SafetyNote, REQUIRED - guarded), slot="eyebrow", slot="title", slot="lede", slot="aside", then Step children. */
  children: ReactNode
}

export declare function SafetySheet(props: SafetySheetProps): JSX.Element
