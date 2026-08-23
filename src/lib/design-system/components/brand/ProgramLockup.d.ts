import type { HTMLAttributes } from 'react'

export type Program = 'frc' | 'ftc' | 'fll'
export type LockupOrientation = 'horizontal' | 'vertical'

export interface ProgramLockupProps extends HTMLAttributes<HTMLDivElement> {
  program?: Program
  orientation?: LockupOrientation
  /** Program logo, full-color reverse, used as supplied. Null renders the empty slot. */
  src?: string | null
}

export declare function ProgramLockup(props: ProgramLockupProps): JSX.Element
