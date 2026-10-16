// Job claiming, gated on the IDEA certifications mirror (migration 0012,
// decision 27 answered 2026-10-14).
//
// A job may name ONE IDEA certification code (task_idea_cert_requirements).
// A member may claim it only while the mirror holds an active, unexpired row
// for their lowercased sign-in email and that code. The DATABASE enforces it
// (claim_task in supabase/migrations/0012_jobs_idea_cert_gate.sql); this file
// only decides what the Jobs page shows, using the same rule ideaCerts.js
// already holds for /certifications (isHeld), so the page and the claim path
// cannot disagree about what counts as held.
//
// Until 0012 is pasted the requirement table does not exist, and the Jobs page
// keeps the old member_skills path exactly as it was: jobCertMode() is the one
// switch, read from the error code (src/schemaMissing.js), never the message.
//
// Pure module: no React, no Supabase import (tests/job-certs.test.js).

import { isSchemaMissing } from './schemaMissing.js'
import { isHeld, normEmail } from './ideaCerts.js'

export const JOB_CERT_REQ_SELECT = 'task_id, code, source'
export const JOB_CERT_CATALOG_SELECT = 'code, name, level, category, active, sort_order'
export const JOB_CERT_HOLDER_SELECT = 'serial, email, code, status, expires_at'

// Where certifications are earned and proved. Nothing in this app awards one.
export const IDEA_CERTS_URL = 'https://ideabosco.com/certifications'
export function ideaVerifyUrl(serial) {
  return `${IDEA_CERTS_URL}/verify?serial=${encodeURIComponent(String(serial ?? ''))}`
}

// 'idea'  the requirement table answered (0012 applied): gate on the mirror
// 'old'   the table is missing (0012 not applied): keep the member_skills path
// A real error (permission, network) is NOT a reason to fall back to the old
// gate, which the database no longer runs once 0012 is in: it is 'idea' with
// the error surfaced by the caller.
export function jobCertMode(reqError) {
  return isSchemaMissing(reqError) ? 'old' : 'idea'
}

// task_id -> { code, source }. A job with no row has no requirement; a row
// with a null code is a decided "no requirement" (admin cleared it, or the
// carry-over found no unambiguous code).
export function requirementMap(rows = []) {
  const m = new Map()
  for (const r of rows ?? []) {
    if (r && r.task_id) m.set(r.task_id, { code: r.code ?? null, source: r.source ?? null })
  }
  return m
}

export function requiredCode(reqMap, taskId) {
  return reqMap?.get?.(taskId)?.code ?? null
}

// The codes the signed-in member holds right now, from THEIR OWN mirror rows.
// The caller asks only for rows under its own email; the email filter here is
// a second guard, so a row for anyone else can never make a job look claimable.
export function heldCodes(holders = [], email, now = Date.now()) {
  const me = normEmail(email)
  const out = new Set()
  if (!me) return out
  for (const h of holders ?? []) {
    if (h && h.email != null && normEmail(h.email) !== me) continue
    if (isHeld(h, now)) out.add(h.code)
  }
  return out
}

export function canClaimIdea(code, held) {
  return !code || !!held?.has?.(code)
}

// What the page says about a job's requirement, from the catalog.
//   missing  the code is no longer in the IDEA catalog (nobody can claim it
//            until an admin changes it)
//   retired  the code is in the catalog but marked inactive
export function describeRequirement(code, catalogByCode) {
  if (!code) return null
  const c = catalogByCode?.get?.(code)
  if (!c) return { code, name: null, state: 'missing' }
  return { code, name: c.name ?? null, state: c.active === false ? 'retired' : 'current' }
}

// The admin picker's options: every ACTIVE catalog code, in IDEA's order,
// plus the job's current code when it is retired or missing so an edit never
// silently drops it.
export function pickerOptions(catalog = [], currentCode = null) {
  const active = [...(catalog ?? [])]
    .filter(c => c && c.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || (a.level ?? 0) - (b.level ?? 0)
      || String(a.code).localeCompare(String(b.code)))
    .map(c => ({ code: c.code, label: `${c.code} · ${c.name}` }))
  if (currentCode && !active.some(o => o.code === currentCode)) {
    const c = (catalog ?? []).find(x => x && x.code === currentCode)
    active.unshift({
      code: currentCode,
      label: c ? `${currentCode} · ${c.name} (retired in IDEA)` : `${currentCode} (no longer in IDEA)`,
    })
  }
  return active
}
