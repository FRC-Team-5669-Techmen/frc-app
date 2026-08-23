import type { HTMLAttributes } from 'react'

export interface SealMarkProps extends HTMLAttributes<HTMLSpanElement> {
  /** URL of assets/team/5669-Seal.svg. Null renders the empty slot. */
  src?: string | null
  /** Square size in px. Floor 48. */
  size?: number
  alt?: string
}

export declare function SealMark(props: SealMarkProps): JSX.Element
