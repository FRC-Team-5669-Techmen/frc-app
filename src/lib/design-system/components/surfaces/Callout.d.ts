import type { ElementType, ReactNode } from 'react'

export type CalloutTone = 'accent' | 'ok' | 'warn' | 'fault' | 'quiet'

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
