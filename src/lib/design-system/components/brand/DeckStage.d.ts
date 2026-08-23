import type { ElementType, HTMLAttributes } from 'react'

export interface DeckStageTones {
  /** The active sheet's `--bg0` — the stage fill. */
  bg0: string
  /** The active sheet's `--edge` — the canvas, letterbox and thumbnail frame. */
  edge: string
}

export interface DeckStageProps extends HTMLAttributes<HTMLElement> {
  /** Keyboard navigation (arrows, PageUp/Down, Home, End, T for the rail). Default true. */
  nav?: boolean
  /** Scale the stage to fit its `.frc-letterbox`. Default true; a no-op with no letterbox. */
  fit?: boolean
  /** Build and repaint a `[data-deck-thumbs]` rail if the deck has one. Default true. */
  thumbs?: boolean
  /** Called after every repaint with the tones just applied. For proofs and tests. */
  onPaint?: (tones: DeckStageTones) => void
  /** Element to render; defaults to `span`. It is hidden either way. */
  as?: ElementType
}

/**
 * Mount exactly ONCE per deck. Renders nothing visible; paints the canvas,
 * letterbox and thumbnail frames from the ACTIVE sheet's `--bg0` and `--edge`.
 */
export declare function DeckStage(props: DeckStageProps): JSX.Element
