import type { ElementType, ReactNode } from 'react'

export type CalloutTone = 'accent' | 'ok' | 'warn' | 'fault' | 'quiet'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface CalloutProps {
  /** A shop hazard is NOT a tone here. Use SafetyNote. */
  tone?: CalloutTone
  /** Inlined Lucide SVG element. */
  icon?: ReactNode
  as?: ElementType
  className?: string
  /** slot="title"; everything else is the body. */
  children: ReactNode
}

export declare function Callout(props: CalloutProps): JSX.Element
