import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface CoverSheetProps extends SheetBaseProps {
  /** Which program lockup the external audience mode shows. */
  program?: 'frc' | 'ftc' | 'fll'
  /** slot="eyebrow", slot="title", slot="subtitle", slot="meta", slot="attribution". */
  children: ReactNode
}

export declare function CoverSheet(props: CoverSheetProps): JSX.Element
