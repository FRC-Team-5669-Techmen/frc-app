import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface SplitSheetProps extends SheetBaseProps {
  /** Which side the visual aid sits on. */
  media?: 'left' | 'right'
  weight?: 'even' | 'media' | 'copy'
  /** slot="eyebrow", slot="title", slot="lede", slot="media"; every other child is copy. */
  children: ReactNode
}

export declare function SplitSheet(props: SplitSheetProps): JSX.Element
