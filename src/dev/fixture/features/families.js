// Fixture: families and records (supabase/migrations/0017_families_and_records.sql,
// src/FamilyPage.jsx, src/EmergencyInfoPage.jsx, src/DriverDocsPage.jsx,
// src/TeamBoardsPage.jsx, the checklist / training / letter cards on
// /standing, the change feed on /handbook). Contract: src/dev/fixture/README.md.
//
// A TEST-ONLY port of 0017's checks that proves the pages, never the rules:
// those are proven by 0017_families_and_records_rls_test.sql. The storage
// read rule (a staff member opens a file only after logging a view) is not
// modelled; the log row is.
//
// Seed: the handbook's first version; SAFE-1 and RESP-1 required for all;
// Riley's emergency information on file; Programming rated yellow this week.

const D = 24 * 3_600_000
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const iso = (t) => new Date(t).toISOString()
const rows = (db, t) => db[t] ?? []
const refuse = (message, code = 'P0001') => ({ data: null, error: { code, message, details: null, hint: null } })
const ok = (data) => ({ data, error: null })
const laDate = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const monday = (t) => {
  const d = new Date(`${laDate(t)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
const isStaff = (p) => !!p?.isStaff
const linked = (db, parent, student) => rows(db, 'guardian_links').some((g) => g.parent_id === parent && g.student_id === student)
const nameOf = (db, id) => { const p = rows(db, 'profiles').find((x) => x.id === id); return (p?.nickname || p?.full_name || 'Member').trim() }

const PERSONA_EMAILS = {
  '00000000-0000-0000-0000-0000000000c1': 'student.one@boscotech.edu',
  '00000000-0000-0000-0000-0000000000c2': 'student.two@boscotech.edu',
  '00000000-0000-0000-0000-0000000000c3': 'student.exempt@boscotech.edu',
}
const holds = (db, member, code, now) => rows(db, 'idea_cert_holders').some((h) => h.email === PERSONA_EMAILS[member] && h.code === code
  && h.status === 'active' && !(h.expires_at && Date.parse(h.expires_at) <= ms(now)))

function training(db, member, now) {
  const subs = rows(db, 'profiles').find((p) => p.id === member)?.subteams ?? []
  return rows(db, 'subteam_training').filter((t) => !t.subteam || subs.includes(t.subteam))
    .map((t) => ({ code: t.code, subteam: t.subteam ?? null, required: !!t.required, held: holds(db, member, t.code, now) }))
}

function onboarding(db, member, now) {
  const item = (k) => rows(db, 'onboarding_items').some((o) => o.member_id === member && o.item === k)
  const app = rows(db, 'member_applications').filter((a) => a.member_id === member).sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))[0]
  const joined = app?.submitted_at ? laDate(app.submitted_at) : laDate(ms(now) - 30 * D)
  const items = [
    { key: 'first_registration', label: 'Registered with FIRST; a parent accepted the Consent and Release', by: 'member', done: item('first_registration') },
    { key: 'discord', label: 'Joined the team Discord', by: 'member', done: item('discord') },
    { key: 'groupme', label: 'A parent joined the GroupMe', by: 'member', done: item('groupme') },
    { key: 'safe1', label: 'Passed SAFE-1', by: 'record', done: holds(db, member, 'SAFE-1', now) },
    { key: 'resp1', label: 'Passed RESP-1', by: 'record', done: holds(db, member, 'RESP-1', now) },
    { key: 'medical', label: 'A parent entered emergency information', by: 'record', done: rows(db, 'member_medical').some((m) => m.member_id === member) },
    { key: 'student_signed', label: 'You signed the handbook', by: 'record', done: rows(db, 'handbook_acknowledgments').some((a) => a.member_id === member && a.signer_role === 'student') },
    { key: 'parent_signed', label: 'A parent signed the handbook', by: 'record', done: item('parent_signed') || rows(db, 'parent_acknowledgments').some((a) => a.member_id === member) },
    { key: 'buddy', label: 'Met your sub-team and your veteran buddy', by: 'staff', done: item('buddy') },
  ]
  const due = new Date(Date.parse(`${joined}T12:00:00Z`) + 14 * D).toISOString().slice(0, 10)
  return { items, done: items.every((x) => x.done), joined, due, version: rows(db, 'handbook_versions').sort((a, b) => b.published_at.localeCompare(a.published_at))[0]?.version }
}

const isStudent = (db, id) => rows(db, 'member_roles').some((r) => r.member_id === id && r.role === 'student')
  && !rows(db, 'member_roles').some((r) => r.member_id === id && ['mentor', 'admin'].includes(r.role))

function saveMedical(engine, member, p, by, byName) {
  if (!String(p.contact1_name ?? '').trim() || !String(p.contact1_phone ?? '').trim() || !String(p.contact2_name ?? '').trim() || !String(p.contact2_phone ?? '').trim()) {
    return refuse('Two emergency contacts, each with a name and phone', '22023')
  }
  engine.deleteRows('member_medical', (m) => m.member_id === member)
  const keys = ['contact1_name', 'contact1_phone', 'contact1_relation', 'contact2_name', 'contact2_phone', 'contact2_relation', 'conditions', 'allergies', 'medicines', 'carried_meds']
  const row = { member_id: member, updated_by: by, updated_by_name: byName }
  for (const k of keys) row[k] = String(p[k] ?? '').trim() || null
  return ok(engine.insertRow('member_medical', row))
}

export default {
  migration: '0017',
  creates: {
    tables: ['member_medical', 'driver_documents', 'driver_document_views', 'media_exceptions', 'subteam_status_reports', 'subteam_training',
      'onboarding_items', 'parent_acknowledgments', 'handbook_versions', 'letter_contributions'],
    rpcs: ['save_medical', 'register_driver_document', 'log_driver_document_view', 'delete_driver_document', 'staff_set_media_exception',
      'set_subteam_status', 'shop_tools_allowed', 'mark_onboarding', 'publish_handbook_version', 'staff_confirm_contribution', 'member_extras',
      'onboarding_deadline_check', 'family_call', 'staff_send_family_link', 'staff_emergency_sheet'],
    columns: { standing_settings: ['training_due', 'checklist_days'] },
  },

  seed: ({ ids, now }) => {
    const t = ms(now)
    return {
      handbook_versions: [{ version: '2026-10-20', summary: 'First version of the member handbook.', major: true, safety: false, effective_at: '2026-10-20T07:00:00.000Z', published_at: iso(t - 2 * D) }],
      subteam_training: [{ subteam: null, code: 'SAFE-1', required: true }, { subteam: null, code: 'RESP-1', required: true }],
      member_medical: [{ member_id: ids.student2, contact1_name: 'Dana Student', contact1_phone: '626-555-0110', contact2_name: 'Lee Student', contact2_phone: '626-555-0111', allergies: 'Peanuts', updated_by_name: 'Dana Student' }],
      subteam_status_reports: [{ week_start: monday(t), subteam: 'Programming', status: 'yellow', note: 'Vision code is a week behind', reported_by: ids.mentor }],
    }
  },

  visible: {
    member_medical: ({ row, user, persona, db }) => isStaff(persona) || linked(db, user?.id, row.member_id),
    driver_documents: ({ row, user, persona }) => row.owner_id === user?.id || isStaff(persona),
    driver_document_views: ({ persona }) => isStaff(persona),
    media_exceptions: ({ row, user, persona, db }) => isStaff(persona) || row.member_id === user?.id
      || (rows(db, 'profiles').find((p) => p.id === user?.id)?.subteams ?? []).includes('Media'),
    onboarding_items: ({ row, user, persona, db }) => row.member_id === user?.id || isStaff(persona) || linked(db, user?.id, row.member_id),
    parent_acknowledgments: ({ row, user, persona, db }) => row.member_id === user?.id || isStaff(persona) || linked(db, user?.id, row.member_id),
    letter_contributions: ({ row, user, persona, db }) => row.member_id === user?.id || isStaff(persona) || linked(db, user?.id, row.member_id),
  },

  rpcs: {
    save_medical: ({ args, db, user, persona, engine }) => {
      if (!(isStaff(persona) || linked(db, user?.id, args.p_member))) return refuse('A parent or a staff mentor enters emergency information', '42501')
      return saveMedical(engine, args.p_member, args.p ?? {}, user.id, nameOf(db, user.id))
    },
    register_driver_document: ({ args, user, engine }) => {
      if (String(args.p_path).split('/')[0] !== user.id) return refuse('Upload under your own folder', '42501')
      return ok(engine.insertRow('driver_documents', { owner_id: user.id, driver_name: args.p_driver_name, kind: args.p_kind, path: args.p_path }))
    },
    log_driver_document_view: ({ args, db, user, persona, engine }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const d = rows(db, 'driver_documents').find((x) => x.id === args.p_doc)
      if (!d) return refuse('Not found', 'P0002')
      engine.insertRow('driver_document_views', { doc_id: d.id, viewer_id: user.id })
      return ok(d.path)
    },
    delete_driver_document: ({ args, db, user, persona, engine }) => {
      const d = rows(db, 'driver_documents').find((x) => x.id === args.p_doc)
      if (!d) return refuse('Not found', 'P0002')
      if (d.owner_id !== user.id && !isStaff(persona)) return refuse('Not yours', '42501')
      engine.deleteRows('driver_documents', (x) => x.id === d.id)
      return ok(d.path)
    },
    staff_set_media_exception: ({ args, user, persona, engine }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      engine.deleteRows('media_exceptions', (m) => m.member_id === args.p_member)
      if (args.p_on) engine.insertRow('media_exceptions', { member_id: args.p_member, note: args.p_note || null, set_by: user.id })
      return ok(1)
    },
    set_subteam_status: ({ args, db, user, persona, engine, now }) => {
      const lead = rows(db, 'member_roles').some((r) => r.member_id === user?.id && r.role === 'lead')
      if (!isStaff(persona) && !lead) return refuse('Leaders and mentors only', '42501')
      const wk = monday(ms(now))
      engine.deleteRows('subteam_status_reports', (r) => r.week_start === wk && r.subteam === args.p_subteam)
      return ok(engine.insertRow('subteam_status_reports', { week_start: wk, subteam: args.p_subteam, status: args.p_status, note: args.p_note || null, reported_by: user.id }))
    },
    shop_tools_allowed: ({ args, db, user, now }) => {
      const m = args.p_member || user.id
      return ok(!isStudent(db, m) || onboarding(db, m, now).done)
    },
    mark_onboarding: ({ args, user, persona, engine }) => {
      if (['parent_signed', 'buddy'].includes(args.p_item) && !isStaff(persona)) return refuse('A mentor ticks this one', '42501')
      if (args.p_member !== user.id && !isStaff(persona)) return refuse('Only for yourself', '42501')
      engine.deleteRows('onboarding_items', (o) => o.member_id === args.p_member && o.item === args.p_item)
      if (args.p_done) engine.insertRow('onboarding_items', { member_id: args.p_member, item: args.p_item, marked_by: user.id, note: args.p_note || null })
      return ok(1)
    },
    publish_handbook_version: ({ args, db, user, persona, engine, now }) => {
      if (!persona?.isAdmin) return refuse('Admin only', '42501')
      if (rows(db, 'handbook_versions').some((v) => v.version === args.p_version)) return refuse('duplicate key value violates unique constraint "handbook_versions_pkey"', '23505')
      const v = engine.insertRow('handbook_versions', { version: args.p_version, summary: args.p_summary, major: !!args.p_major, safety: !!args.p_safety,
        effective_at: iso(ms(now) + (args.p_safety ? 0 : 7 * D)), published_by: user.id, published_at: iso(ms(now)) })
      for (const p of rows(db, 'profiles').filter((x) => x.approved && (x.status ?? 'active') === 'active')) {
        engine.insertRow('member_notices', { member_id: p.id, kind: 'handbook', title: `Handbook updated: version ${v.version}`, body: v.summary, created_by: user.id })
      }
      return ok(v)
    },
    staff_confirm_contribution: ({ args, user, persona, engine, now }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const t = new Date(ms(now))
      const sy = `${t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1}-08-01`
      engine.deleteRows('letter_contributions', (l) => l.member_id === args.p_member && l.season_start === sy)
      if (args.p_on) engine.insertRow('letter_contributions', { member_id: args.p_member, season_start: sy, confirmed_by: user.id, note: args.p_note || null })
      return ok(1)
    },
    member_extras: ({ args, db, user, persona, now }) => {
      const m = args.p_member
      if (!(m === user?.id || isStaff(persona) || linked(db, user?.id, m))) return refuse('Not allowed', '42501')
      const o = onboarding(db, m, now)
      const tr = training(db, m, now)
      const sy = (() => { const t = new Date(ms(now)); return `${t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1}-08-01` })()
      const letter = [
        { key: 'standing', label: 'A full season with no meetings or hours probation', met: !rows(db, 'standing_records').some((r) => r.member_id === m && ['meetings', 'hours', 'removal'].includes(r.kind)) },
        { key: 'build_hours', label: '10 signed-in hours every build-season week', met: true, detail: '0 short weeks' },
        { key: 'competitions', label: 'Every competition, every day', met: !rows(db, 'event_attendance').some((a) => a.member_id === m && a.status === 'absent'), detail: '' },
        { key: 'role', label: 'An assigned role at a competition or hosted event', met: rows(db, 'event_roles').some((r) => r.member_id === m) },
        { key: 'conduct', label: 'At most one safety violation and no written warning', met: rows(db, 'safety_violations').filter((v) => v.member_id === m).length <= 1 && !rows(db, 'discipline_records').some((d) => d.member_id === m && d.level !== 'verbal') },
        { key: 'grades', label: 'A 2.0 GPA or higher at every grade check', met: !rows(db, 'grade_checks').some((g) => g.member_id === m && g.below) },
        { key: 'training', label: 'SAFE-1, RESP-1 and sub-team training complete', met: tr.every((x) => !x.required || x.held) },
        { key: 'volunteer', label: '10 volunteer hours, FLL included', met: false, detail: 'not counted in fixture mode' },
        { key: 'contribution', label: 'A clear contribution to your sub-team, confirmed by its lead and a mentor', met: rows(db, 'letter_contributions').some((l) => l.member_id === m && l.season_start === sy) },
      ]
      return ok({ onboarding: o, training: tr, letter, shop_tools: !isStudent(db, m) || o.done,
        medical_on_file: rows(db, 'member_medical').some((x) => x.member_id === m), photo_exception: rows(db, 'media_exceptions').some((x) => x.member_id === m) })
    },
    onboarding_deadline_check: ({ persona }) => (persona?.isAdmin ? ok(0) : refuse('Admin only', '42501')),
    family_call: ({ args, db, engine, now }) => {
      const a = rows(db, 'member_applications').find((x) => x.parent_token === args.p_token)
      if (!a) return refuse('This link is not valid', 'P0002')
      const m = a.member_id
      const ver = rows(db, 'handbook_versions').sort((x, y) => y.published_at.localeCompare(x.published_at))[0]?.version
      const p = args.p_args ?? {}
      if (args.p_action === 'summary') {
        const open = rows(db, 'standing_records').filter((r) => r.member_id === m && ['open', 'proposed'].includes(r.status))
        const med = rows(db, 'member_medical').find((x) => x.member_id === m) ?? null
        return ok({ student: nameOf(db, m), parent_name: a.parent_name, onboarding: onboarding(db, m, now), medical: med, version: ver,
          signed: rows(db, 'parent_acknowledgments').some((x) => x.application_id === a.id && x.version === ver),
          standing: { label: open.length ? 'probation' : 'good', records: open, weeks: rows(db, 'standing_weeks').filter((w) => w.member_id === m) } })
      }
      if (args.p_action === 'medical_save') {
        const r = saveMedical(engine, m, p, null, p.by_name || a.parent_name || 'Parent')
        return r.error ? r : ok({ ok: true })
      }
      if (args.p_action === 'groupme') {
        if (!rows(db, 'onboarding_items').some((o) => o.member_id === m && o.item === 'groupme')) engine.insertRow('onboarding_items', { member_id: m, item: 'groupme', note: 'From the family link' })
        return ok({ ok: true })
      }
      if (args.p_action === 'sign') {
        if (p.version !== ver) return refuse('Sign the current version', '22023')
        if (!rows(db, 'parent_acknowledgments').some((x) => x.application_id === a.id && x.version === ver)) {
          engine.insertRow('parent_acknowledgments', { application_id: a.id, member_id: m, version: ver, parent_name: p.name })
        }
        return ok({ ok: true })
      }
      return refuse('Unknown action', '22023')
    },
    staff_send_family_link: ({ args, db, persona, engine }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const a = rows(db, 'member_applications').find((x) => x.member_id === args.p_member)
      if (!a) return refuse('No application on file', 'P0002')
      if (args.p_rotate) engine.updateRows('member_applications', (x) => x.id === a.id, { parent_token: crypto.randomUUID() })
      engine.insertRow('notice_outbox', { to_email: a.parent_email, subject: 'Techmen 5669: your family link', body: 'link', member_id: args.p_member, kind: 'family_link' })
      return ok(1)
    },
    staff_emergency_sheet: ({ db, persona }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      return ok(rows(db, 'profiles').filter((p) => isStudent(db, p.id) && p.approved !== false && (p.status ?? 'active') === 'active').map((p) => {
        const m = rows(db, 'member_medical').find((x) => x.member_id === p.id)
        return { member_id: p.id, name: nameOf(db, p.id), contact1: m ? `${m.contact1_name} ${m.contact1_phone}` : null, contact2: m ? `${m.contact2_name} ${m.contact2_phone}` : null,
          conditions: m?.conditions ?? null, allergies: m?.allergies ?? null, medicines: m?.medicines ?? null, carried_meds: m?.carried_meds ?? null, updated_at: m?.updated_at ?? null }
      }).sort((a, b) => a.name.localeCompare(b.name)))
    },
  },
}
