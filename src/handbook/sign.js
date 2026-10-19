// Handbook progress and signing rules. Pure: no React, no Supabase.

import { LESSONS, HANDBOOK_VERSION } from './lessons.js'

// Same three values as handbook_ack_role_chk in
// supabase/migrations/0013_handbook_acknowledgments.sql.
export const SIGNER_ROLES = ['student', 'parent', 'mentor']

// Which agreement a member signs. Staff sign as mentors even when they also
// hold another role; a parent who is not staff signs the parent lines;
// everyone else signs the student lines.
export function signerRoleFor(roles) {
  const has = r => roles.includes(r)
  if (has('mentor') || has('lead') || has('admin')) return 'mentor'
  if (has('parent')) return 'parent'
  return 'student'
}

// Students pass every lesson before signing (Section 24 is their agreement
// that they read and will follow it). Parents and mentors may sign once they
// have read it; the lessons stay open to them.
export function mustPassLessons(signerRole) {
  return signerRole === 'student'
}

export const storageKey = (userId) => `techmen.handbook.${HANDBOOK_VERSION}.${userId || 'anon'}`

export function emptyProgress() {
  return { passed: {}, answers: {} }
}

// A stored blob is untrusted: keep only lesson ids that exist and answers in
// range, so a renamed lesson or an old version cannot count toward signing.
export function cleanProgress(raw) {
  const out = emptyProgress()
  if (!raw || typeof raw !== 'object') return out
  const ids = new Set(LESSONS.map(l => l.id))
  for (const [id, v] of Object.entries(raw.passed || {})) if (ids.has(id) && v === true) out.passed[id] = true
  for (const [k, v] of Object.entries(raw.answers || {})) {
    const [id, qi] = k.split(':')
    if (ids.has(id) && (qi === '0' || qi === '1') && Number.isInteger(v) && v >= 0 && v < 3) out.answers[k] = v
  }
  // A lesson counts as passed only if both its answers are right.
  for (const l of LESSONS) {
    const right = l.questions.every((q, i) => out.answers[`${l.id}:${i}`] === q.a)
    if (right) out.passed[l.id] = true
    else delete out.passed[l.id]
  }
  return out
}

export function answer(progress, lessonId, qi, choice) {
  const next = { passed: { ...progress.passed }, answers: { ...progress.answers, [`${lessonId}:${qi}`]: choice } }
  return cleanProgress(next)
}

export function passedCount(progress) {
  return LESSONS.filter(l => progress.passed[l.id]).length
}
