import type { ElementType, ReactNode } from 'react'

export type PipelineState = 'default' | 'done' | 'current' | 'blocked'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface ProcessPipelineProps {
  as?: ElementType
  className?: string
  /** PipelineStep children. Numbers come from position. */
  children: ReactNode
}

export interface PipelineStepProps {
  state?: PipelineState
  /** Set by the pipeline from position; override only to renumber deliberately. */
  index?: number
  as?: ElementType
  className?: string
  /** slot="title", slot="note". */
  children: ReactNode
}

export declare function ProcessPipeline(props: ProcessPipelineProps): JSX.Element
export declare function PipelineStep(props: PipelineStepProps): JSX.Element
