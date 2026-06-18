// Shared role color vocabulary so the same role reads the same color everywhere.
// Colors live as --role-* tokens in theme.css; this maps role → token and gives
// a small RoleBadge primitive that styles via the shared .role-badge class.

// Display priority: highest authority first (used to pick a single "top" role).
export const ROLE_ORDER = ['admin', 'lead', 'mentor', 'parent', 'student']

export const ROLE_COLOR = {
  admin:   'var(--role-admin)',
  lead:    'var(--role-lead)',
  mentor:  'var(--role-mentor)',
  parent:  'var(--role-parent)',
  student: 'var(--role-student)',
}

export const roleColor = r => ROLE_COLOR[r] || 'var(--steel)'

// The single role to surface for a member who may hold several.
export const topRoleOf = (roles = []) => ROLE_ORDER.find(r => roles.includes(r))

export function RoleBadge({ role, className = '' }) {
  if (!role) return null
  return (
    <span className={`role-badge ${className}`} style={{ '--rc': roleColor(role) }}>
      {role}
    </span>
  )
}
