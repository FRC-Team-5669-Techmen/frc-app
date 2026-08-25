import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SponsorWallProps {
  as?: ElementType
  className?: string
  /** slot="caption", then SponsorTier children. */
  children: ReactNode
}

export interface SponsorTierProps {
  as?: ElementType
  className?: string
  /**
   * slot="name", then the marks. Every mark must be a Cutout with
   * ground="none"; anything else trips the guard.
   */
  children: ReactNode
}

export declare function SponsorWall(props: SponsorWallProps): JSX.Element
export declare function SponsorTier(props: SponsorTierProps): JSX.Element
