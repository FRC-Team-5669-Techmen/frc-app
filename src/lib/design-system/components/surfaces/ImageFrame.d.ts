import type { ElementType, ReactNode } from 'react'

export type ImageKind = 'photo' | 'screenshot' | 'render' | 'equipment' | 'drawing' | 'portrait'
export type ImageShape = 'rect' | 'brackets' | 'round'
export type BleedSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ImageFrameProps {
  src?: string
  alt?: string
  /** What the image IS. It picks the default shape. */
  kind?: ImageKind
  /** Override the shape the kind implies. */
  shape?: ImageShape
  /** Feather one edge into the ground. true means "right". Guarded: refused on a screenshot. */
  bleed?: boolean | BleedSide
  /** CSS aspect-ratio for the plate, e.g. "16 / 10". */
  ratio?: string
  height?: number | string
  /** Expected asset path, shown in the empty state. */
  file?: string
  as?: ElementType
  className?: string
  /** slot="caption"; any other child is the media. */
  children?: ReactNode
}

export declare function ImageFrame(props: ImageFrameProps): JSX.Element
