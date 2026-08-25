import type { ElementType, ReactNode } from 'react'

export interface FieldZone {
  id: string
  /** SVG polygon points. Geometry, so it stays an array prop. */
  points: string
  /** Alliance colors resolve only on the FIELD ground. */
  alliance?: 'red' | 'blue'
  /** Label anchor, [x, y] as percentages of the media box. */
  at?: [number, number]
}

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface FieldDiagramProps {
  zones?: FieldZone[]
  viewBox?: string
  /** Grid divisions across the field. */
  grid?: number
  defaultActive?: string | null
  as?: ElementType
  className?: string
  /** slot="zone" with data-zone matching a zone id, and slot="key" legend entries. */
  children?: ReactNode
}

export declare function FieldDiagram(props: FieldDiagramProps): JSX.Element
