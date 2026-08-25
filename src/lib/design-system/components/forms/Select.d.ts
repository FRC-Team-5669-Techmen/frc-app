import type { ComponentPropsWithoutRef, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'

/**
 * SLOT ELEMENTS: any legal element may be written for a slot. The component pins
 * the display, font and margin it needs on the class it paints, so `<span>`,
 * `<h2>` and `<p>` render the same box and the element carries only semantics.
 * Enforced by `ds:audit` check 31.
 */
export interface SelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'children'> {
  invalid?: boolean
  /** slot="label", slot="hint", and ordinary <option> children. */
  children?: ReactNode
}

export declare const Select: ForwardRefExoticComponent<SelectProps & RefAttributes<HTMLSelectElement>>
