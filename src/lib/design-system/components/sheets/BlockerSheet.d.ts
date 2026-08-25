import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
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
