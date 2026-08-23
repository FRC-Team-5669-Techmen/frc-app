import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export type StatusTone = 'default' | 'ok' | 'warn' | 'fault'

export interface SubteamStatusSheetProps extends SheetBaseProps {
  cols?: number
  /** slot="eyebrow", slot="title", slot="lede", slot="foot", then SubteamStatus children. */
  children: ReactNode
}

export interface SubteamStatusProps {
  tone?: StatusTone
  /** Structural numbers: the bar, not the words. */
  progress?: number
  max?: number
  className?: string
  /** slot="subteam", slot="status", slot="metric", slot="note". */
  children: ReactNode
}

export declare function SubteamStatusSheet(props: SubteamStatusSheetProps): JSX.Element
export declare function SubteamStatus(props: SubteamStatusProps): JSX.Element
