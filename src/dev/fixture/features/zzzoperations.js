// Rendering stand-ins only. Native SQL proves caller scope, time and grants.
const ok = (data = null) => ({ data, error: null })
const no = (message = 'Not permitted', code = '42501') => ({ data: null, error: { code, message } })
const rows = (c, t) => c.db[t] ?? []
const name = (c, id) => { const p = rows(c, 'profiles').find(p => p.id === id); return p?.nickname || p?.full_name || 'Member' }
const eligible = c => c.user && rows(c, 'profiles').some(p => p.id === c.user.id && p.approved && ['active', 'folded'].includes(p.status)) && c.persona.roles.some(r => ['student', 'mentor', 'lead', 'admin'].includes(r)) && (!c.persona.isParent || c.persona.isStaff)
const mentor = c => eligible(c) && (c.persona.roles.includes('mentor') || c.persona.isAdmin)
const activeVenues = c => rows(c, 'event_checkin_venues').filter(v => v.enabled).flatMap(v => {
 const e = rows(c, 'events').find(e => e.id === v.event_id && e.kind === 'competition' && Date.parse(e.starts_at) <= c.now.getTime() && Date.parse(e.ends_at) > c.now.getTime())
 return e ? [{ ...v, id: e.id, title: e.title, ends_at: e.ends_at, exempt: rows(c, 'event_geo_exemptions').some(x => x.event_id === e.id && x.member_id === c.user?.id && Date.parse(x.expires_at) > c.now.getTime()) }] : []
})
export default {
 migration: '0051',
 creates: { tables: ['parent_service_people', 'parent_service_sessions', 'event_checkin_venues', 'event_geo_exemptions', 'role_rotation_members'], rpcs: ['staff_parent_service', 'staff_save_parent_service', 'staff_event_checkin', 'staff_save_event_venue', 'staff_set_event_geo_exempt', 'my_event_checkin_venues', 'event_venue_checkin', 'mentor_set_rotation_member', 'mentor_rotation_data'] },
 visible: Object.fromEntries(['parent_service_people', 'parent_service_sessions', 'event_checkin_venues', 'event_geo_exemptions', 'role_rotation_members'].map(t => [t, () => false])),
 rpcs: {
  staff_parent_service: c => c.persona.isStaff ? ok({ students: rows(c, 'profiles').filter(p => rows(c, 'member_roles').some(r => r.member_id === p.id && r.role === 'student')).map(p => ({ id: p.id, name: name(c, p.id) })), parents: rows(c, 'parent_service_people').filter(p => p.event_id === c.args.p_event).map(p => ({ ...p, student: name(c, p.student_id), sessions: rows(c, 'parent_service_sessions').filter(s => s.guardian_id === p.id) })) }) : no(),
  staff_save_parent_service: c => {
   if (!c.persona.isStaff) return no()
   const a = c.args
   let parent = rows(c, 'parent_service_people').find(p => p.id === a.p_parent && p.event_id === a.p_event)
   if (!parent && a.p_parent) return no('Parent is not on this event', '22023')
   if (!parent) { parent = { id: c.uuid(), event_id: a.p_event, student_id: a.p_student, school_id: a.p_school_id, name: a.p_name }; c.engine.insertRow('parent_service_people', parent) }
   if (a.p_delete) { const s = rows(c, 'parent_service_sessions').find(s => s.id === a.p_session && s.guardian_id === parent.id); if (!s) return no('Session not found', '22023'); c.engine.deleteRows('parent_service_sessions', s2 => s2.id === s.id); return ok(s.id) }
   if (Date.parse(a.p_end) <= Date.parse(a.p_start)) return no('End must follow start', '22023')
   const s = { id: a.p_session || c.uuid(), guardian_id: parent.id, starts_at: a.p_start, ends_at: a.p_end }
   if (rows(c, 'parent_service_sessions').some(x => x.guardian_id === parent.id && x.id !== s.id && Date.parse(x.starts_at) < Date.parse(s.ends_at) && Date.parse(x.ends_at) > Date.parse(s.starts_at))) return no('This overlaps another entry for this parent', '22023')
   if (a.p_session) c.engine.updateRows('parent_service_sessions', x => x.id === s.id && x.guardian_id === parent.id, s)
   else c.engine.insertRow('parent_service_sessions', s)
   return ok(s.id)
  },
  staff_event_checkin: c => c.persona.isStaff ? ok({ venue: rows(c, 'event_checkin_venues').find(v => v.event_id === c.args.p_event) || null, exemptions: rows(c, 'event_geo_exemptions').filter(x => x.event_id === c.args.p_event).map(x => ({ ...x, name: name(c, x.member_id), active: activeVenues(c).some(v => v.id === x.event_id && v.exempt) })) }) : no(),
  staff_save_event_venue: c => {
   if (!c.persona.isStaff) return no()
   const v = { event_id: c.args.p_event, latitude: c.args.p_lat, longitude: c.args.p_lon, enabled: c.args.p_enabled }
   if (rows(c, 'event_checkin_venues').some(x => x.event_id === v.event_id)) c.engine.updateRows('event_checkin_venues', x => x.event_id === v.event_id, v)
   else c.engine.insertRow('event_checkin_venues', v)
   return ok()
  },
  staff_set_event_geo_exempt: c => {
   if (!c.persona.isStaff) return no()
   const a = c.args, e = rows(c, 'events').find(e => e.id === a.p_event)
   if (!e || Date.parse(e.ends_at) <= c.now.getTime()) return no('Choose an event that has not ended', '22023')
   c.engine.deleteRows('event_geo_exemptions', x => x.event_id === e.id && x.member_id === a.p_member)
   if (a.p_exempt) c.engine.insertRow('event_geo_exemptions', { event_id: e.id, member_id: a.p_member, expires_at: e.ends_at })
   return ok()
  },
  my_event_checkin_venues: c => eligible(c) ? ok(activeVenues(c)) : no(),
  event_venue_checkin: c => {
   if (!eligible(c)) return no()
   const a = c.args, v = activeVenues(c).find(v => v.id === a.p_event)
   if (!v) return no('Event check-in is not active', '22023')
   if (!v.exempt && (a.p_lat == null || a.p_lon == null || a.p_accuracy > 100)) return no('Precise location required', '22023')
   const id = c.uuid(); c.engine.insertRow('attendance_events', { id, user_id: c.user.id, type: 'in', event_time: c.now.toISOString(), location: `event:${v.id}`, method: 'nfc', category: 'competition', geo_ok: !v.exempt, verified: false, manual_entry: false }); return ok(id)
  },
  mentor_set_rotation_member: c => {
   if (!mentor(c)) return no('Mentors only')
   const v = { member_id: c.args.p_member, strong: c.args.p_strong, newer: c.args.p_newer }
   if (rows(c, 'role_rotation_members').some(x => x.member_id === v.member_id)) c.engine.updateRows('role_rotation_members', x => x.member_id === v.member_id, v)
   else c.engine.insertRow('role_rotation_members', v)
   return ok()
  },
  mentor_rotation_data: c => {
   if (!mentor(c)) return no('Mentors only')
   const day = c.now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }), season = rows(c, 'seasons').filter(s => s.start_date <= day && s.end_date >= day).sort((a, b) => b.start_date.localeCompare(a.start_date))[0] || null
   return ok({ season, members: rows(c, 'profiles').filter(p => p.approved && p.status === 'active' && rows(c, 'member_roles').some(r => r.member_id === p.id && r.role === 'student') && !rows(c, 'member_roles').some(r => r.member_id === p.id && ['mentor', 'admin'].includes(r.role))).map(p => ({ id: p.id, name: name(c, p.id), strong: rows(c, 'role_rotation_members').find(d => d.member_id === p.id)?.strong ?? false, newer: rows(c, 'role_rotation_members').find(d => d.member_id === p.id)?.newer ?? false, attendance: rows(c, 'attendance_events').filter(a => a.user_id === p.id), verified_outs: rows(c, 'signout_requests').filter(s => s.member_id === p.id && s.status === 'approved').map(s => s.out_event_id), reviews: rows(c, 'session_reviews').filter(r => r.user_id === p.id), logs: rows(c, 'logged_hours').filter(l => l.member_id === p.id && l.status === 'verified') })) })
  },
 },
}
