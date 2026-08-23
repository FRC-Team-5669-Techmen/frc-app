import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface AgendaSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="foot", then Step children. */
  children: ReactNode
}

export declare function AgendaSheet(props: AgendaSheetProps): JSX.Element
