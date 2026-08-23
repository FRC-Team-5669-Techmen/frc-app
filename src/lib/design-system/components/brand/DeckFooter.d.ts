import type { HTMLAttributes } from 'react'

export type Audience = 'internal' | 'external'

export interface DeckFooterProps extends HTMLAttributes<HTMLElement> {
  /** Short fixed chrome. */
  deckName?: string
  /** Current part name; derived from parts[partIndex] when omitted. */
  part?: string
  /** Part names, in order. Drives the progress rail. Structural. */
  parts?: string[]
  partIndex?: number
  /** LOGICAL sheet number: every state of a build chain carries the same number. */
  sheet?: number | string
  total?: number
  /** Force the audience on this footer alone; otherwise the deck root / section class decides. */
  audience?: Audience
  /** seal (default) or logotype in the left slot. */
  /** The rail mark. Defaults to the logotype; the seal is the opt-in. */
  mark?: 'logotype' | 'seal'
  sealSrc?: string | null
  /** FIRST horizontal full-color reverse PNG. Null renders the empty zone. */
  firstLogoSrc?: string | null
}

export declare function DeckFooter(props: DeckFooterProps): JSX.Element
