import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ClosingSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="lede", slot="next", slot="sponsors" (external chrome), slot="attribution". */
  children: ReactNode
}

export declare function ClosingSheet(props: ClosingSheetProps): JSX.Element
