import type { ElementType, ReactNode } from 'react'

/** The four transitions. There is no fifth. */
export type SheetTransition = 'shutter' | 'boot' | 'banner' | 'cut' | 'none'

export declare const TRANSITIONS: Record<SheetTransition, string | null>

/** Chrome props every pattern accepts. NONE of these is copy. */
/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SheetBaseProps {
  /** Overrides the pattern's default transition for this instance. */
  transition?: SheetTransition
  /** Thumbnail-rail label, and the screen-reader label when screenLabel is unset. */
  label?: string
  screenLabel?: string
  /** Ambient texture layer names from tokens/surfaces.css. Max one per sheet. */
  ambient?: string | string[]
  /** Ambient opacity knob, 0 to 2. */
  tex?: number
  /** DeckFooter chrome props, or false for the hub sheet. */
  footer?: false | Record<string, unknown>
  /** Marks this sheet the active one on a live stage. */
  active?: boolean
  className?: string
  children: ReactNode
}

export interface SheetProps extends SheetBaseProps {
  kind?: string
  slots?: Record<string, ReactNode>
  as?: ElementType
}

/** Internal. Decks compose PATTERNS, never this. */
export declare function Sheet(props: SheetProps): JSX.Element

export interface SheetHeadProps {
  slots?: Record<string, ReactNode>
  className?: string
}

export declare function SheetHead(props: SheetHeadProps): JSX.Element
