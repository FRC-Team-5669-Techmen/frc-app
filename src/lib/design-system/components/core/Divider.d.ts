import type { HTMLAttributes } from 'react'
import type { ChevronRailTone } from './ChevronRail'

export type DividerVariant = 'auto' | 'line' | 'chevron'

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  /** auto (default): chevrons on SQUADRON, hairline elsewhere, chosen by the ground scope in CSS. */
  variant?: DividerVariant
  /** Use the active hairline (--line-strong) for the line form. */
  strong?: boolean
  /** Chevron color for the chevron form. */
  tone?: ChevronRailTone
}

export declare function Divider(props: DividerProps): JSX.Element
