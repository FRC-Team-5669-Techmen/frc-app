import type { ElementType, HTMLAttributes, ReactNode } from 'react'

export interface HudFrameProps extends HTMLAttributes<HTMLElement> {
  /** Figure label, short fixed chrome (top-left mono tab). */
  label?: ReactNode
  /** Unit / scale readout, short fixed chrome (top-right). */
  readout?: ReactNode
  /** Element to render; defaults to `figure`. */
  as?: ElementType
  /** The framed drawing. */
  children?: ReactNode
}

export declare function HudFrame(props: HudFrameProps): JSX.Element
