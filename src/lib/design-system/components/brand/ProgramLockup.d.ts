import type { HTMLAttributes } from 'react'

export type Program = 'frc' | 'ftc' | 'fll'
export type LockupOrientation = 'horizontal' | 'vertical'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ProgramLockupProps extends HTMLAttributes<HTMLDivElement> {
  program?: Program
  orientation?: LockupOrientation
  /** Program logo, full-color reverse, used as supplied. Null renders the empty slot. */
  src?: string | null
}

export declare function ProgramLockup(props: ProgramLockupProps): JSX.Element
