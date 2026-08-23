import type { ElementType, ReactNode } from 'react'

export type Alliance = 'red' | 'blue'

export interface ScoutTableProps {
  defaultActive?: string | null
  className?: string
  /** slot="col" per column, optional slot="caption", then ScoutRow children. */
  children: ReactNode
}

export interface ScoutRowProps {
  id?: string
  /** Alliance colors resolve only on the FIELD ground; the word always shows. */
  alliance?: Alliance
  className?: string
  onClick?: (e: unknown) => void
  /** slot="team", then slot="cell" per column. */
  children: ReactNode
}

export declare function ScoutTable(props: ScoutTableProps): JSX.Element
export declare function ScoutRow(props: ScoutRowProps): JSX.Element
