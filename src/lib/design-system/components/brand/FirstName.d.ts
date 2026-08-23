import type { HTMLAttributes, ReactNode } from 'react'

export type FirstNameChannel = 'heading' | 'body'
export type FirstNameProgram = 'first' | 'frc' | 'ftc' | 'fll'
export type FirstNameRefusal = 'empty' | 'possessive' | 'plural' | 'unknown'

export interface FirstNameProps extends HTMLAttributes<HTMLSpanElement> {
  /** Shorthand for the program name. */
  program?: FirstNameProgram
  /** First-use tracking channel. Headings and body copy each get their own ®. */
  channel?: FirstNameChannel
  /**
   * One of: FIRST, FIRST Robotics Competition, FIRST Tech Challenge, FIRST LEGO League
   * (or a division: Challenge / Explore / Discover). Omitted = FIRST.
   * Plural and possessive forms are refused.
   */
  children?: string
}

export interface FirstNameClassification {
  ok: boolean
  reason?: FirstNameRefusal
  raw: string
}

export declare function FirstName(props: FirstNameProps): JSX.Element
export declare function classifyFirstName(text: unknown): FirstNameClassification

export interface FirstNameScopeProps {
  /** external makes enforcement mandatory: a refused form throws. */
  audience?: 'internal' | 'external'
  children?: ReactNode
}
export declare function FirstNameScope(props: FirstNameScopeProps): JSX.Element
export declare function useFirstNameScope(): { audience: 'internal' | 'external'; registry: unknown }
