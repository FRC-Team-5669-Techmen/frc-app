import type { ReactElement } from 'react'

export interface DeckStepInfo {
  /** The sheet element whose step changed. */
  sheet: Element
  /** The resolved step group inside it. */
  group: Element
  /** 1-based step now showing. */
  step: number
  /** Items in the group. */
  total: number
}

export interface DeckStepsProps {
  /**
   * Bind ArrowRight / PageDown and ArrowLeft / PageUp. Default true. Set false
   * for an embedded deck — a demo card, a proof — that must not swallow the
   * page's own arrow keys.
   */
  nav?: boolean
  /** Called on every step change. Instrumentation only; nothing depends on it. */
  onStep?: (info: DeckStepInfo) => void
  /** Element the invisible marker node renders as. Default 'span'. */
  as?: keyof JSX.IntrinsicElements
  className?: string
}

/**
 * Stepped reveal for a deck. Behaviour, not appearance: mount it ONCE per deck,
 * beside DeckStage, and it renders nothing.
 *
 * OPT-IN PER SHEET, with no pattern API change:
 *   <GallerySheet data-steps>            — DeckSteps finds the list itself
 *   <div data-step-group>…</div>         — names the container outright
 *
 * A sheet with neither behaves exactly as it does today.
 */
export declare function DeckSteps(props: DeckStepsProps): ReactElement | null
