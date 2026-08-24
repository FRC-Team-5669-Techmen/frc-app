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
  /**
   * The rail mark. Defaults to the logotype. `seal` is the opt-in for a rail
   * whose sheet body is not already carrying one; `mark` is the winged helmet
   * alone (MarkGlyph variant="auto"), no lettering.
   */
  mark?: 'logotype' | 'seal' | 'mark'
  sealSrc?: string | null
  /** FIRST horizontal full-color reverse PNG. Null renders the empty zone. */
  firstLogoSrc?: string | null
}

export declare function DeckFooter(props: DeckFooterProps): JSX.Element
