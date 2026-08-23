import type { ElementType, HTMLAttributes, ReactNode } from 'react'

export type StencilSize = 'h1' | 'display' | 'hero'

export interface StencilTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading element; defaults to `h1`. */
  as?: ElementType
  size?: StencilSize
  /** Uppercase opt-in. Sentence case is the default per the casing rule. */
  caps?: boolean
  /** The stencil bridge cut through the letterforms. */
  bridge?: boolean
  /** Hero glow (already zero on paper by alias). */
  glow?: boolean
  children: ReactNode
}

export declare function StencilTitle(props: StencilTitleProps): JSX.Element
