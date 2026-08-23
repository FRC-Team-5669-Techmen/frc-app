import type { HTMLAttributes, ReactNode } from 'react'

export interface SeasonLockupProps extends HTMLAttributes<HTMLDivElement> {
  /** Season years, rendered as given. Convention: 2026-27. */
  years?: string
  /** Season artwork. Null renders the empty slot. */
  src?: string | null
  artWidth?: number
  artHeight?: number
  /** The season name. Copy. */
  children: ReactNode
}

export declare function SeasonLockup(props: SeasonLockupProps): JSX.Element
