import type { ElementType, HTMLAttributes, ReactNode } from 'react'

export type EyebrowTone = 'default' | 'accent' | 'live' | 'plain'

export interface EyebrowProps extends HTMLAttributes<HTMLElement> {
  /** default: ash text + tick. accent: gold tick, body text. live: pulsing gold dot. plain: no tick. */
  tone?: EyebrowTone
  /** Element to render; defaults to `p`. */
  as?: ElementType
  /** The label text. Rendered UPPERCASE by CSS. */
  children: ReactNode
}

export declare function Eyebrow(props: EyebrowProps): JSX.Element
