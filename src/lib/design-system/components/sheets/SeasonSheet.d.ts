import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface SeasonSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lockup" (SeasonLockup), slot="stat" repeated. */
  children: ReactNode
}

export declare function SeasonSheet(props: SeasonSheetProps): JSX.Element
