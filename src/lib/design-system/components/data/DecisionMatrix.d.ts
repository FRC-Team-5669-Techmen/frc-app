import type { ElementType, ReactNode } from 'react'

export interface DecisionMatrixProps {
  /** One weight per criterion. ARRAY-ONLY: structure, not copy. */
  weights?: number[]
  /** scores[option][criterion]. ARRAY-ONLY for the same reason. */
  scores?: number[][]
  className?: string
  /** slot="criterion" repeated, slot="option" repeated, optional slot="caption", slot="corner", slot="total". */
  children: ReactNode
}

export declare function DecisionMatrix(props: DecisionMatrixProps): JSX.Element
