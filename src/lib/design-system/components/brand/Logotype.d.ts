import type { HTMLAttributes } from 'react'
import type { MarkVariant } from './MarkGlyph'

export interface LogotypeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: MarkVariant
  src?: string | null
  /** Height in px. Floor 24. */
  height?: number
  /** Slot width placeholder until Type-*.svg supplies the aspect ratio. */
  width?: number
  alt?: string
}

export declare function Logotype(props: LogotypeProps): JSX.Element
