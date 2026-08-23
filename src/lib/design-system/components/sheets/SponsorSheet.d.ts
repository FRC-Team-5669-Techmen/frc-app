import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface SponsorSheetProps extends SheetBaseProps {
  /** slot="eyebrow", slot="title", slot="thanks", slot="attribution"; the child is the SponsorWall. */
  children: ReactNode
}

export declare function SponsorSheet(props: SponsorSheetProps): JSX.Element
