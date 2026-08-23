import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface BlockerSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="aside", then Blocker children. */
  children: ReactNode
}

export interface BlockerProps {
  /** fault = blocked, warn = at risk, ok = cleared. */
  severity?: 'fault' | 'warn' | 'ok'
  id?: string
  className?: string
  /** slot="state", slot="title", slot="owner". */
  children: ReactNode
}

export declare function BlockerSheet(props: BlockerSheetProps): JSX.Element
export declare function Blocker(props: BlockerProps): JSX.Element
