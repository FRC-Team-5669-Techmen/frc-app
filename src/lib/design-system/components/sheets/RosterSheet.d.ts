import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface RosterSheetProps extends SheetBaseProps {
  cols?: number
  /** slot="eyebrow", slot="title", slot="lede", slot="foot", then RoleCard children. */
  children: ReactNode
}

export declare function RosterSheet(props: RosterSheetProps): JSX.Element
