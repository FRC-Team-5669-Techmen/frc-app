import type { ComponentPropsWithoutRef, ElementType, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'md' | 'lg'

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'> {
  /** primary = accent fill, secondary = active hairline, ghost = no stroke. */
  variant?: ButtonVariant
  size?: ButtonSize
  /** Inlined Lucide SVG element, leading. */
  icon?: ReactNode
  /** Inlined Lucide SVG element, trailing. */
  iconEnd?: ReactNode
  /** Override the element; defaults to `a` when href is set, else `button`. */
  as?: ElementType
  href?: string
  type?: 'button' | 'submit' | 'reset'
  /** The label. Copy lives in children, never in a prop. */
  children: ReactNode
}

export declare const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement | HTMLAnchorElement>>
