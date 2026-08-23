import type { ElementType, ReactNode } from 'react'

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
