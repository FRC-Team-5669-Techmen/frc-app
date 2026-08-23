import type { ElementType, ReactNode } from 'react'

export interface PartCalloutProps {
  as?: ElementType
  className?: string
  /** slot="media" (a Cutout), slot="name", slot="vendor", slot="pn", slot="price", slot="note". */
  children: ReactNode
}

export declare function PartCallout(props: PartCalloutProps): JSX.Element
