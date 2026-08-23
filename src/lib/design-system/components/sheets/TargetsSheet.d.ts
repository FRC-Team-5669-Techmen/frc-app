import type { ReactNode } from 'react'
import type { SheetBaseProps } from './Sheet'

export interface TargetsSheetProps extends SheetBaseProps {
  /** The shared scale and the target line. Structure, not copy. */
  max?: number
  target?: number | null
  /** slot="eyebrow", slot="title", slot="lede", slot="aside", then Bar children. */
  children: ReactNode
}

export declare function TargetsSheet(props: TargetsSheetProps): JSX.Element
