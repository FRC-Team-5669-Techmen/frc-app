// Who can be signed in under fixture mode. Fictional people only.
//
// The ids match the throwaway Postgres harness's fixture members (admin a1,
// mentor b1, students c1/c2, parent d1 linked to c1, unapproved e1), so a row
// a lane seeds here and a row its SQL test inserts there name the same person.
//
// A persona's ROLES are not stored here: they are read from member_roles in the
// fixture store at query time, so promoting someone on /roster under fixture
// mode changes what they can see, the way it does in production.

export const IDS = Object.freeze({
  admin: '00000000-0000-0000-0000-0000000000a1',
  mentor: '00000000-0000-0000-0000-0000000000b1',
  lead: '00000000-0000-0000-0000-0000000000b2',
  student: '00000000-0000-0000-0000-0000000000c1',
  student2: '00000000-0000-0000-0000-0000000000c2',
  exempt: '00000000-0000-0000-0000-0000000000c3',
  parent: '00000000-0000-0000-0000-0000000000d1',
  pending: '00000000-0000-0000-0000-0000000000e1',
})

// key -> who signs in. `exempt` is a student whose profile carries
// geofence_exempt = true, for the check-in path that skips the location fence.
export const PERSONAS = Object.freeze({
  student:  { key: 'student',  id: IDS.student,  email: 'student.one@boscotech.edu', name: 'Sam Student',     label: 'Student (Sam)' },
  student2: { key: 'student2', id: IDS.student2, email: 'student.two@boscotech.edu', name: 'Riley Student',   label: 'Student (Riley)' },
  exempt:   { key: 'exempt',   id: IDS.exempt,   email: 'student.exempt@boscotech.edu', name: 'Casey Exempt', label: 'Student, geofence exempt (Casey)' },
  mentor:   { key: 'mentor',   id: IDS.mentor,   email: 'mentor.test@boscotech.edu', name: 'Max Mentor',      label: 'Mentor (Max)' },
  admin:    { key: 'admin',    id: IDS.admin,    email: 'admin.test@boscotech.edu',  name: 'Ada Admin',       label: 'Admin (Ada)' },
  parent:   { key: 'parent',   id: IDS.parent,   email: 'parent.test@example.com',   name: 'Pat Parent',      label: 'Parent of Sam (Pat)' },
  pending:  { key: 'pending',  id: IDS.pending,  email: 'pending.test@example.com',  name: 'Una Unapproved',  label: 'Unapproved guest (Una)' },
})

export const PERSONA_KEYS = Object.freeze([...Object.keys(PERSONAS), 'signedout'])
export const DEFAULT_PERSONA = 'student'

export const STAFF_ROLES = Object.freeze(['mentor', 'lead', 'admin'])

// The persona object handed to rpc handlers and visibility filters, with roles
// resolved from the store.
export function resolvePersona(key, db) {
  const p = PERSONAS[key]
  if (!p) return null
  const roles = (db?.member_roles ?? []).filter((r) => r.member_id === p.id).map((r) => r.role)
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r))
  return {
    ...p,
    roles,
    isStaff,
    isAdmin: roles.includes('admin'),
    isParent: roles.includes('parent') && !isStaff,
  }
}
