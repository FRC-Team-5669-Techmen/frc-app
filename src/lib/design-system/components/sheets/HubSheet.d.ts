import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface HubSheetProps extends SheetBaseProps {
  cols?: number
  /** slot="eyebrow", slot="title", slot="lede", then JumpCard children. */
  children: ReactNode
}

export declare function HubSheet(props: HubSheetProps): JSX.Element
