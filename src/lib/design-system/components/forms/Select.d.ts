import type { ComponentPropsWithoutRef, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'

export interface SelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'children'> {
  invalid?: boolean
  /** slot="label", slot="hint", and ordinary <option> children. */
  children?: ReactNode
}

export declare const Select: ForwardRefExoticComponent<SelectProps & RefAttributes<HTMLSelectElement>>
