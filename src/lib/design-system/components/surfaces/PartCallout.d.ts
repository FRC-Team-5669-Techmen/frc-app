import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface PartCalloutProps {
  as?: ElementType
  className?: string
  /** slot="media" (a Cutout), slot="name", slot="vendor", slot="pn", slot="price", slot="note". */
  children: ReactNode
}

export declare function PartCallout(props: PartCalloutProps): JSX.Element
