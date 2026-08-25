import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export type StatusTone = 'default' | 'ok' | 'warn' | 'fault'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
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
