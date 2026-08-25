import type { ElementType, ReactNode } from 'react'

export type MatchPhase = 'auto' | 'teleop'

/** 0:20 autonomous, 2:20 teleop, with each phase's warning threshold. */
export declare const MATCH_PHASES: Record<MatchPhase, { seconds: number; label: string; warnAt: number }>

/** Seconds to M:SS. */
export declare function formatClock(seconds: number): string

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface MatchClockProps {
  phase?: MatchPhase
  /** Seconds left. Omitted, the clock renders the FULL phase duration. */
  remaining?: number
  /** Copper below this many seconds. Defaults per phase. */
  warnAt?: number
  as?: ElementType
  className?: string
  /** Optional slot="phase" override and slot="note". */
  children?: ReactNode
}

export declare function MatchClock(props: MatchClockProps): JSX.Element
