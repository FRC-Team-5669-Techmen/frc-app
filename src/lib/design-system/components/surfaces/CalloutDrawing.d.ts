import type { ElementType, ReactNode } from 'react'

export interface CalloutDrawingProps {
  /** id of the pin raised at rest. */
  defaultActive?: string | null
  as?: ElementType
  className?: string
  /** The media element, CalloutPin children, and slot="caption". */
  children: ReactNode
}

export interface CalloutPinProps {
  /** Percent of the media box. Geometry, not copy. */
  x?: number
  y?: number
  id?: string
  index?: number
  /** Which side the label sits on. */
  side?: 'left' | 'right'
  className?: string
  onClick?: (e: unknown) => void
  /** slot="label" - always rendered, raised on click. */
  children: ReactNode
}

export declare function CalloutDrawing(props: CalloutDrawingProps): JSX.Element
export declare function CalloutPin(props: CalloutPinProps): JSX.Element
