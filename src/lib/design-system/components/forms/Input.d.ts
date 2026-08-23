import type { ComponentPropsWithoutRef, ElementType, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'children' | 'size'> {
  /** "input" (default) or "textarea". */
  as?: ElementType
  mono?: boolean
  size?: 'md' | 'lg'
  invalid?: boolean
  /** slot="label", slot="hint". The placeholder is short chrome and stays a prop. */
  children?: ReactNode
}

export declare const Input: ForwardRefExoticComponent<InputProps & RefAttributes<HTMLInputElement | HTMLTextAreaElement>>
