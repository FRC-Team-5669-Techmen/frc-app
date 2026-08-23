import type { ElementType, ReactNode } from 'react'

export type StatTone = 'default' | 'hero' | 'ok' | 'warn' | 'fault'

export interface StatBlockProps {
  /** hero adds the rationed glow (zero on paper, by alias). */
  tone?: StatTone
  size?: 'md' | 'sm'
  as?: ElementType
  className?: string
  /** slot="value", slot="unit", slot="label", slot="note". */
  children: ReactNode
}

export declare function StatBlock(props: StatBlockProps): JSX.Element
