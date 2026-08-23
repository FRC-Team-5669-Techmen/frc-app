import type { ElementType, ReactNode } from 'react'

export interface RoleCardProps {
  as?: ElementType
  className?: string
  /**
   * slot="portrait", slot="name", slot="title", slot="subteam" repeated,
   * slot="cert" repeated. A cert child carries data-status="certified" |
   * "in_progress" and optional data-safety, mirroring the app skills model.
   * This component never queries anything.
   */
  children: ReactNode
}

export declare function RoleCard(props: RoleCardProps): JSX.Element
