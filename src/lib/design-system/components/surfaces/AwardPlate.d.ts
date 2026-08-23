import type { ElementType, ReactNode } from 'react'

export interface AwardPlateProps {
  as?: ElementType
  className?: string
  /** slot="eyebrow", slot="name", slot="event", slot="year". */
  children: ReactNode
}

export declare function AwardPlate(props: AwardPlateProps): JSX.Element
