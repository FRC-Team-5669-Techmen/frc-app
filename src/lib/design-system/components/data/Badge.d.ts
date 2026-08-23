import type { ElementType, ReactNode } from 'react'

export type BadgeTone = 'default' | 'ok' | 'warn' | 'fault' | 'accent' | 'program'

export interface BadgeProps {
  tone?: BadgeTone
  /** Fill the pill with the tone instead of outlining it. */
  solid?: boolean
  /** The circular state token. Off for a pure word pill. */
  dot?: boolean
  as?: ElementType
  className?: string
  /** The status, in WORDS. Copy lives in children. */
  children: ReactNode
}

export declare function Badge(props: BadgeProps): JSX.Element
