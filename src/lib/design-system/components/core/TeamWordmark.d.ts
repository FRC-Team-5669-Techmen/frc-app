import type { ElementType, HTMLAttributes } from 'react'

export interface TeamWordmarkProps extends HTMLAttributes<HTMLElement> {
  /** Show the 5669 numeral after the name. */
  number?: boolean
  /** Font size in px (structural). */
  size?: number
  /** Element to render; defaults to `span`. */
  as?: ElementType
}

/** Typeset TECHMEN · 5669. Not the logotype asset. */
export declare function TeamWordmark(props: TeamWordmarkProps): JSX.Element
