import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface GallerySheetProps extends SheetBaseProps {
  cols?: number
  /** slot="eyebrow", slot="title", slot="lede", then Sample children. */
  children: ReactNode
}

export declare function GallerySheet(props: GallerySheetProps): JSX.Element
