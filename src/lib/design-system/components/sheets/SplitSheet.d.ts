import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SplitSheetProps extends SheetBaseProps {
  /** Which side the visual aid sits on. */
  media?: 'left' | 'right'
  weight?: 'even' | 'media' | 'copy'
  /** slot="eyebrow", slot="title", slot="lede", slot="media"; every other child is copy. */
  children: ReactNode
}

export declare function SplitSheet(props: SplitSheetProps): JSX.Element
