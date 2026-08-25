import type { ComponentPropsWithoutRef, ElementType, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
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
