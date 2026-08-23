import type { ElementType, HTMLAttributes, ReactNode } from 'react'

export type PlateTreatment = 'auto' | 'plate' | 'well'
export type PlatePad = 'normal' | 'tight' | 'loose'

export interface PlatePanelProps extends HTMLAttributes<HTMLElement> {
  /** auto: rise on SQUADRON, recess on FIELD, flat on paper. plate / well force one. */
  treatment?: PlateTreatment
  /** Rivet seam along the top edge. */
  rivets?: boolean
  pad?: PlatePad
  /** Element to render; defaults to `section`. */
  as?: ElementType
  children?: ReactNode
}

export declare function PlatePanel(props: PlatePanelProps): JSX.Element
