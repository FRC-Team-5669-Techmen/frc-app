// FRC5669DesignSystem — icons.
// Lucide, inlined as 24x24 stroked SVG on currentColor. Stroke width, caps and
// joins come from .frc-icon (effects.css). No icon dependency is added; paths
// are the Lucide originals (ISC). No emoji anywhere in the system.
import { cx } from '../cx.js'

export function LucideIcon({ className, title, children, ...rest }) {
  return (
    <svg
      className={cx('frc-icon', className)}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export const IconChevronRight = (p) => <LucideIcon {...p}><path d="m9 18 6-6-6-6" /></LucideIcon>
export const IconChevronDown  = (p) => <LucideIcon {...p}><path d="m6 9 6 6 6-6" /></LucideIcon>
export const IconArrowRight   = (p) => <LucideIcon {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></LucideIcon>
export const IconCheck        = (p) => <LucideIcon {...p}><path d="M20 6 9 17l-5-5" /></LucideIcon>
export const IconX            = (p) => <LucideIcon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></LucideIcon>
export const IconTriangleAlert = (p) => <LucideIcon {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></LucideIcon>
export const IconPlay         = (p) => <LucideIcon {...p}><polygon points="6 3 20 12 6 21 6 3" /></LucideIcon>
export const IconWrench       = (p) => <LucideIcon {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></LucideIcon>
export const IconCircle       = (p) => <LucideIcon {...p}><circle cx="12" cy="12" r="10" /></LucideIcon>
export const IconRotateCcw    = (p) => <LucideIcon {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></LucideIcon>
