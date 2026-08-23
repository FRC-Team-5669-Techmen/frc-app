import type { ElementType, ReactNode } from 'react'

export type CutoutGround = 'shadow' | 'shelf' | 'none'

export interface CutoutProps {
  src?: string
  alt?: string
  /** shadow = resting part, shelf = datum line, none = floating mark (every sponsor logo). */
  ground?: CutoutGround
  /** Always "contain". Passing "cover" THROWS. */
  fit?: 'contain'
  width?: number | string
  height?: number | string
  file?: string
  as?: ElementType
  className?: string
  /** slot="caption"; any other child is the media. */
  children?: ReactNode
}

export declare function Cutout(props: CutoutProps): JSX.Element
