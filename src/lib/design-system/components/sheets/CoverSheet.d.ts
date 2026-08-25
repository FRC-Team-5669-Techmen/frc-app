import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface CoverSheetProps extends SheetBaseProps {
  /** Which program lockup the external audience mode shows. */
  program?: 'frc' | 'ftc' | 'fll'
  /** slot="eyebrow", slot="title", slot="subtitle", slot="meta", slot="attribution". */
  children: ReactNode
}

export declare function CoverSheet(props: CoverSheetProps): JSX.Element
