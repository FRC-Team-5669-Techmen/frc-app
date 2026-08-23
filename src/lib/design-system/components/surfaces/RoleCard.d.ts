import type { ElementType, ReactNode } from 'react'

export type RoleCardDensity = 'default' | 'compact'

export interface RoleCardProps {
  as?: ElementType
  /**
   * How tight the card runs. The card sets its OWN type scale, padding and
   * gaps from this — a deck never sets font-size, padding or gap on a RoleCard
   * or on anything inside one.
   *
   *   "default" (the default) — media beside the text, full scale. Up to about
   *     four cards on a sheet.
   *   "compact" — media above the text, smaller scale and tighter box. Six or
   *     more cards on one sheet.
   *
   * A grid of cards goes in a wrapper carrying the `frc-role-grid` class,
   * which owns the columns and the gutter for both densities.
   */
  density?: RoleCardDensity
  /**
   * Filename the empty media slot names, e.g. "rivera-portrait.png". Slot
   * chrome, not copy. Omit it and the empty slot reads "Empty portrait slot".
   */
  mediaFile?: string
  className?: string
  /**
   * slot="media" (an image — a `Cutout` or a round `ImageFrame`; slot="portrait"
   * is the original name and still works), slot="name", slot="title",
   * slot="subteam" repeated, slot="cert" repeated, slot="note" for one short
   * line under the certs. A cert child carries data-status="certified" |
   * "in_progress" and optional data-safety, mirroring the app skills model.
   * The media slot is optional: left empty it renders the system's marked empty
   * slot. This component never queries anything.
   */
  children: ReactNode
}

export declare function RoleCard(props: RoleCardProps): JSX.Element
