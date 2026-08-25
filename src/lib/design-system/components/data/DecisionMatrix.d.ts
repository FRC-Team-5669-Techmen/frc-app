import type { ElementType, ReactNode } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
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
