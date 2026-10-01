import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import {
  ANNOUNCE_CHANNELS, ANNOUNCE_LIMITS, DEFAULT_ANNOUNCE_CHANNEL, POLL_DURATION_PRESETS,
  activeRoles, buildAnnouncePayload, classifyInvoke, composeContent, normalizeDraft,
  sortRoles, splitMentions, validateDraft, validateRoleRow,
} from './discordAnnounce'
import './AnnouncePage.css'

// /announce -- an admin posts to the team Discord: a message, optional role
// pings, an optional poll or embed. Admin-only, matching the Edge Function,
// which checks is_admin() itself; the gate here is a courtesy.
//
// THE PREVIEW IS THE PAYLOAD. Everything on the right-hand side is rendered
// from buildAnnouncePayload in src/discordAnnounce.js, the same builder the
// function runs (a byte-for-byte copy, drift-tested). "Check with server" asks
// the function for ITS payload and says whether the two match.
//
// Every state the setup can be in is a sentence, never a broken page:
//   migration 0003 not applied     the whole page says "not set up yet"
//   role table empty               "add roles first", and a post with no pings
//   function not deployed          compose and preview work; Send is off
//   bot secrets missing            the function names them; Send is off

const STATUS_LABEL = { pending: 'Pending', sent: 'Sent', failed: 'Failed', unknown: 'Unconfirmed' }
const ROLE_SELECT = 'id, name, role_id, active, sort_order, notes'
const LOG_SELECT = 'id, created_at, sender_name, channel_name, content, role_names, embed, poll, status, discord_message_id, error'

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function durationLabel(hours) {
  const preset = POLL_DURATION_PRESETS.find(p => p.hours === hours)
  if (preset) return preset.label
  return hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`
}

// A fresh idempotency key per confirm step. randomUUID needs a secure context,
// which every deployed and local origin here is; the fallback is the same
// version-4 shape from getRandomValues.
function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// One call to the function, classified. A non-2xx arrives as a
// FunctionsHttpError whose context is the Response, so the body is read from
// there; a missing function shows up as a fetch error or a 404.
async function invokeAnnounce(body) {
  if (!supabase.functions?.invoke) return classifyInvoke({ errorName: 'FunctionsFetchError' })
  try {
    const { data, error } = await supabase.functions.invoke('discord-announce', { body })
    if (!error) return classifyInvoke({ status: 200, body: data })
    const res = error.context
    let status = null
    let parsed = null
    if (res && typeof res.status === 'number') {
      status = res.status
      try { parsed = await res.json() } catch { parsed = null }
    }
    return classifyInvoke({ errorName: error.name, status, body: parsed })
  } catch (err) {
    return classifyInvoke({ errorName: err?.name === 'TypeError' ? 'FunctionsFetchError' : err?.name })
  }
}

function friendlyRoleError(error) {
  if (error?.code === '23505') return 'That role id or name is already on the list.'
  if (error?.code === '23514') return 'A role id is 17 to 20 digits, and a name is 1 to 100 characters.'
  if (error?.code === '42501') return 'Only an admin can change the role list.'
  return error?.message || 'The change was not saved.'
}

function Chip({ on, onClick, children, disabled = false, title }) {
  return (
    <button type="button" className={`an-chip${on ? ' an-chip-on' : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

function Count({ n, max }) {
  return <span className={`an-count${n > max ? ' an-count-over' : ''}`}>{n}/{max}</span>
}

// ── Preview: what Discord will show, rendered from the payload itself ─────────
function Preview({ payload, roles, channel }) {
  const parts = splitMentions(payload.content ?? '', roles)
  const pinged = payload.allowed_mentions.roles
    .map(id => roles.find(r => r.role_id === id)?.name ?? id)
  const empty = !payload.content && !payload.embeds && !payload.poll
  return (
    <section className="an-preview" aria-label="Preview">
      <div className="an-preview-head">
        <span className="an-section-label">Preview</span>
        <span className="an-mono">#{channel}</span>
      </div>
      <div className="an-msg">
        <div className="an-msg-author">Team bot <span className="an-bot-tag">BOT</span></div>
        {empty && <p className="an-muted">Nothing to send yet.</p>}
        {payload.content && (
          <p className="an-msg-text">
            {parts.map((p, i) => (p.type === 'role'
              ? <span key={i} className={`an-mention${p.known ? '' : ' an-mention-unknown'}`}>@{p.name}</span>
              : <span key={i}>{p.text}</span>))}
          </p>
        )}
        {payload.embeds?.map((e, i) => (
          <div key={i} className="an-embed">
            {e.title && <div className="an-embed-title">{e.title}</div>}
            {e.description && <div className="an-embed-desc">{e.description}</div>}
          </div>
        ))}
        {payload.poll && (
          <div className="an-poll">
            <div className="an-poll-q">{payload.poll.question.text}</div>
            <div className="an-poll-meta">
              {payload.poll.allow_multiselect ? 'Select one or more answers' : 'Select one answer'}
            </div>
            <ul className="an-poll-answers">
              {payload.poll.answers.map((a, i) => <li key={i}>{a.poll_media.text}</li>)}
            </ul>
            <div className="an-poll-meta">Open for {durationLabel(payload.poll.duration)}</div>
          </div>
        )}
      </div>
      <p className="an-notifies">
        {pinged.length ? <>Notifies <strong>{pinged.map(n => `@${n}`).join(', ')}</strong>.</> : 'Notifies nobody.'}
        {' '}@everyone and @here never notify from here.
      </p>
      <details className="an-json">
        <summary>Exact payload</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </section>
  )
}

// ── What the server said about a dry run ──────────────────────────────────────
function DryRun({ result, localPayload }) {
  if (!result) return null
  if (result.loading) return <p className="an-muted">Asking the server…</p>
  if (result.kind !== 'ok') return <p className="an-note an-note-bad">{result.message}</p>
  const b = result.body
  const same = JSON.stringify(b.payload) === JSON.stringify(localPayload)
  return (
    <div className="an-dry">
      <p className={`an-note ${same ? 'an-note-good' : 'an-note-bad'}`}>
        {same ? 'The server built exactly this payload.' : 'The server built a DIFFERENT payload from this preview. Do not send; report it.'}
      </p>
      {!b.guild_checked && b.missing?.length > 0 && (
        <p className="an-note">Not checked against the Discord server: needs {b.missing.join(', ')}.</p>
      )}
      {b.guild_checked && (
        <ul className="an-checks">
          <li className={b.channel?.found ? 'an-ok' : 'an-bad'}>#{b.channel?.name} {b.channel?.found ? 'found' : 'not found'}</li>
          {(b.roles ?? []).map(r => (
            <li key={r.role_id} className={r.found ? (r.mentionable ? 'an-ok' : 'an-warn') : 'an-bad'}>
              @{r.name} {r.found ? (r.mentionable ? 'found, mentionable' : 'found, NOT mentionable') : 'not in the server'}
            </li>
          ))}
        </ul>
      )}
      {(b.problems ?? []).map((p, i) => <p key={`p${i}`} className="an-note an-note-bad">{p}</p>)}
      {(b.warnings ?? []).map((w, i) => <p key={`w${i}`} className="an-note">{w}</p>)}
    </div>
  )
}

// ── The role table editor ─────────────────────────────────────────────────────
function RoleEditor({ roles, onChanged }) {
  const blank = { name: '', role_id: '', notes: '', sort_order: '' }
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)   // row id
  const [edit, setEdit] = useState(blank)
  const [armed, setArmed] = useState(null)       // row id armed for delete
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const nextSort = roles.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 10

  async function write(promise, after) {
    setBusy(true)
    const { error } = await promise
    setBusy(false)
    if (error) { setMsg(friendlyRoleError(error)); return }
    setMsg('')
    after?.()
    onChanged()
  }

  function add(e) {
    e.preventDefault()
    const errs = validateRoleRow(form)
    if (errs.length) { setMsg(errs.join(' ')); return }
    write(
      supabase.from('discord_announce_roles').insert({
        name: form.name.trim(),
        role_id: form.role_id.trim(),
        notes: form.notes.trim() || null,
        sort_order: form.sort_order === '' ? nextSort : Number(form.sort_order) || 0,
      }),
      () => setForm(blank),
    )
  }

  function saveEdit(id) {
    const errs = validateRoleRow(edit)
    if (errs.length) { setMsg(errs.join(' ')); return }
    write(
      supabase.from('discord_announce_roles').update({
        name: edit.name.trim(),
        role_id: edit.role_id.trim(),
        notes: edit.notes.trim() || null,
        sort_order: Number(edit.sort_order) || 0,
      }).eq('id', id),
      () => setEditing(null),
    )
  }

  return (
    <section className="an-card" id="announce-roles">
      <div className="an-card-head">
        <h2 className="an-h2">Discord roles</h2>
        <span className="an-muted">{roles.length} on the list</span>
      </div>
      <p className="an-help">
        The roles an announcement may ping. Fill in each one from Discord itself: turn on
        User Settings &gt; Advanced &gt; Developer Mode, then Server Settings &gt; Roles,
        right-click a role and choose Copy Role ID. Never type an id from memory or guess one;
        the send checks every id against the server and refuses one it cannot find.
      </p>

      {roles.length > 0 && (
        <ul className="an-roles">
          {sortRoles(roles).map(r => {
            // Off means active === false, the same reading activeRoles() gives
            // the chips: a row whose active is missing must not be offered as
            // a chip while its own row says Inactive.
            const off = r.active === false
            return (
            <li key={r.id} className={`an-role${off ? ' an-role-off' : ''}`}>
              {editing === r.id ? (
                <div className="an-role-edit">
                  <input className="an-input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} aria-label="Role name" />
                  <input className="an-input an-mono" value={edit.role_id} inputMode="numeric" onChange={e => setEdit({ ...edit, role_id: e.target.value })} aria-label="Role id" />
                  <input className="an-input an-num" value={edit.sort_order} inputMode="numeric" onChange={e => setEdit({ ...edit, sort_order: e.target.value })} aria-label="Sort order" />
                  <input className="an-input" value={edit.notes} placeholder="Notes" onChange={e => setEdit({ ...edit, notes: e.target.value })} aria-label="Notes" />
                  <div className="an-row-actions">
                    <button type="button" className="an-btn an-btn-go" disabled={busy} onClick={() => saveEdit(r.id)}>Save</button>
                    <button type="button" className="an-btn" disabled={busy} onClick={() => { setEditing(null); setMsg('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="an-role-main">
                    <span className="an-role-name">{r.name}</span>
                    <span className="an-mono an-role-id">{r.role_id}</span>
                    {off && <span className="an-pill">Inactive</span>}
                    {r.notes && <span className="an-role-notes">{r.notes}</span>}
                  </div>
                  <div className="an-row-actions">
                    <button type="button" className="an-btn" disabled={busy}
                      onClick={() => write(supabase.from('discord_announce_roles').update({ active: off }).eq('id', r.id))}>
                      {off ? 'Activate' : 'Deactivate'}
                    </button>
                    <button type="button" className="an-btn" disabled={busy}
                      onClick={() => { setEditing(r.id); setArmed(null); setMsg(''); setEdit({ name: r.name, role_id: r.role_id, notes: r.notes ?? '', sort_order: String(r.sort_order ?? 0) }) }}>
                      Edit
                    </button>
                    {armed === r.id ? (
                      <button type="button" className="an-btn an-btn-danger" disabled={busy}
                        onClick={() => write(supabase.from('discord_announce_roles').delete().eq('id', r.id), () => setArmed(null))}>
                        Delete {r.name}? Past posts keep their copy.
                      </button>
                    ) : (
                      <button type="button" className="an-btn an-btn-danger" disabled={busy} onClick={() => setArmed(r.id)}>Delete</button>
                    )}
                  </div>
                </>
              )}
            </li>
            )
          })}
        </ul>
      )}

      <form className="an-role-add" onSubmit={add}>
        <label className="an-label">Name in Discord
          <input className="an-input" value={form.name} placeholder="Programming" onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="an-label">Role id
          <input className="an-input an-mono" value={form.role_id} inputMode="numeric" placeholder="17 to 20 digits" onChange={e => setForm({ ...form, role_id: e.target.value })} />
        </label>
        <label className="an-label">Order
          <input className="an-input an-num" value={form.sort_order} inputMode="numeric" placeholder={String(nextSort)} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
        </label>
        <label className="an-label an-label-wide">Notes
          <input className="an-input" value={form.notes} placeholder="Optional" onChange={e => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button type="submit" className="an-btn an-btn-go" disabled={busy}>Add role</button>
      </form>
      {msg && <p className="an-error" role="alert">{msg}</p>}
    </section>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────
export default function AnnouncePage({ hasRole = () => false }) {
  const isAdmin = hasRole('admin')

  const [setup, setSetup] = useState('loading')    // loading | missing | ready | error
  const [loadError, setLoadError] = useState('')
  const [roles, setRoles] = useState([])
  const [log, setLog] = useState([])
  const [fn, setFn] = useState({ kind: 'loading' })

  const [channel, setChannel] = useState(DEFAULT_ANNOUNCE_CHANNEL)
  const [content, setContent] = useState('')
  const [roleIds, setRoleIds] = useState([])
  const [embedOn, setEmbedOn] = useState(false)
  const [embedTitle, setEmbedTitle] = useState('')
  const [embedDesc, setEmbedDesc] = useState('')
  const [pollOn, setPollOn] = useState(false)
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState(['', ''])
  const [hours, setHours] = useState(24)
  const [multi, setMulti] = useState(false)

  const [step, setStep] = useState('compose')      // compose | confirm | result
  const [requestId, setRequestId] = useState(null)
  const [dry, setDry] = useState(null)
  const [result, setResult] = useState(null)
  const [sending, setSending] = useState(false)

  const loadRoles = useCallback(async () => {
    const { data, error } = await supabase.from('discord_announce_roles').select(ROLE_SELECT).order('sort_order')
    if (error) {
      if (isSchemaMissing(error)) { setSetup('missing'); return false }
      setLoadError(error.message); setSetup('error'); return false
    }
    const rows = data ?? []
    setRoles(rows)
    // A role deactivated or deleted while ticked drops out of the selection.
    const live = new Set(activeRoles(rows).map(r => r.role_id))
    setRoleIds(prev => prev.filter(id => live.has(id)))
    setSetup('ready')
    return true
  }, [])

  const loadLog = useCallback(async () => {
    const { data, error } = await supabase.from('discord_announcements').select(LOG_SELECT)
      .order('created_at', { ascending: false }).limit(20)
    if (!error) setLog(data ?? [])
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    let live = true
    ;(async () => {
      const ok = await loadRoles()
      if (!ok || !live) return
      loadLog()
      const status = await invokeAnnounce({ action: 'status' })
      if (live) setFn(status)
    })()
    return () => { live = false }
  }, [isAdmin, loadRoles, loadLog])

  const draft = useMemo(() => normalizeDraft({
    channel,
    content,
    roleIds,
    embed: embedOn ? { title: embedTitle, description: embedDesc } : null,
    poll: pollOn ? { question, answers, durationHours: hours, allowMultiselect: multi } : null,
  }), [channel, content, roleIds, embedOn, embedTitle, embedDesc, pollOn, question, answers, hours, multi])

  const errors = useMemo(() => validateDraft(draft, { roles }), [draft, roles])
  const payload = useMemo(() => buildAnnouncePayload(draft, { roles }), [draft, roles])
  const contentLength = composeContent(draft, roles).length
  const pickable = activeRoles(roles)

  // Any edit invalidates a dry run that described the old draft.
  useEffect(() => { setDry(null) }, [draft])

  // A dry run is tagged with the payload it was asked about, and only shown
  // while the preview still IS that payload. Without the tag, an answer that
  // arrived after an edit (or after a role reload reordered the pings) was
  // compared against the NEW preview and reported a server mismatch nobody
  // caused, telling the admin not to send and to report it.
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload])

  const fnReady = fn.kind === 'ok' && fn.body?.ready === true
  // What the function says is missing. The deployed function always names it
  // when it is not ready; an answer that is ok but neither ready nor naming
  // anything (something else answering at that URL) gets a plain sentence
  // rather than "needs ." with an empty list.
  const fnMissing = Array.isArray(fn.body?.missing) ? fn.body.missing : []
  const notReadyLine = fnMissing.length
    ? `Needs setup before anything can be sent: ${fnMissing.join(', ')}.`
    : 'The announce function answered but did not say it is ready to send.'

  async function checkWithServer() {
    const asked = payloadJson
    setDry({ loading: true, asked })
    const r = await invokeAnnounce({ action: 'preview', draft })
    setDry({ ...r, asked })
  }

  function review() {
    if (errors.length) return
    setRequestId(newRequestId())
    setResult(null)
    setStep('confirm')
  }

  // Re-sending from the confirm step reuses the SAME request id, so a retry
  // after a dropped connection can never post twice: the function refuses a
  // second reservation for it.
  async function send() {
    setSending(true)
    const r = await invokeAnnounce({ action: 'send', request_id: requestId, draft })
    setSending(false)
    setResult(r)
    setStep('result')
    loadLog()
  }

  function backToDraft() {
    setStep('compose')
    setRequestId(null)
    setResult(null)
  }

  function composeAnother() {
    setContent(''); setRoleIds([]); setEmbedOn(false); setEmbedTitle(''); setEmbedDesc('')
    setPollOn(false); setQuestion(''); setAnswers(['', '']); setHours(24); setMulti(false)
    setChannel(DEFAULT_ANNOUNCE_CHANNEL)
    backToDraft()
  }

  if (!isAdmin) {
    return <div className="an-wrap"><p className="an-muted">Admin access required.</p></div>
  }

  const head = (
    <div className="an-head">
      <h1 className="an-title">Announce</h1>
      <p className="an-sub">
        Post to the team Discord as the team bot. Only the roles you tick are notified;
        @everyone and @here can never fire from here. Every send is logged below.
      </p>
    </div>
  )

  if (setup === 'loading') return <div className="an-wrap">{head}<p className="an-muted">Loading…</p></div>

  if (setup === 'missing') {
    return (
      <div className="an-wrap">
        {head}
        <div className="an-card an-setup" data-state="not-set-up">
          <h2 className="an-h2">Not set up yet</h2>
          <p>
            Discord announcements need a database change that has not been applied yet
            (<span className="an-mono">supabase/migrations/0003_discord_announcements.sql</span>).
            Nothing here can be used until it is.
          </p>
        </div>
      </div>
    )
  }

  if (setup === 'error') {
    return <div className="an-wrap">{head}<p className="an-error">Could not load the role list: {loadError}</p></div>
  }

  const resultTone = result?.kind === 'ok' ? 'good' : result?.kind === 'unknown_outcome' ? 'warn' : 'bad'
  const canRetrySame = result && ['not_deployed', 'unreachable', 'error', 'signed_out'].includes(result.kind)

  return (
    <div className="an-wrap">
      {head}

      <div className={`an-status-line an-status-${fn.kind === 'loading' ? 'wait' : fnReady ? 'good' : 'bad'}`} data-state={fn.kind === 'ok' ? (fnReady ? 'ready' : 'needs-setup') : fn.kind}>
        {fn.kind === 'loading' && 'Checking the announce function…'}
        {fn.kind === 'ok' && fnReady && 'Announce function connected.'}
        {fn.kind === 'ok' && !fnReady && `${notReadyLine} You can still compose and preview.`}
        {fn.kind === 'not_deployed' && 'The announce function is not deployed yet. You can compose and preview; sending is off until it is deployed.'}
        {fn.kind === 'needs_setup' && `${fn.message} You can still compose and preview.`}
        {!['loading', 'ok', 'not_deployed', 'needs_setup'].includes(fn.kind) && fn.message}
      </div>

      <div className="an-grid">
        <div className="an-col">
          {step === 'compose' && (
            <section className="an-card" aria-label="Compose">
              <span className="an-section-label">Channel</span>
              <div className="an-chips">
                {ANNOUNCE_CHANNELS.map(c => (
                  <Chip key={c} on={channel === c} onClick={() => setChannel(c)}>#{c}</Chip>
                ))}
              </div>

              <span className="an-section-label">Ping roles</span>
              {pickable.length === 0 ? (
                <p className="an-note" data-state="no-roles">
                  No roles yet. Add roles first in <a href="#announce-roles">Discord roles</a> below,
                  with names and ids copied from Discord. Until then an announcement pings nobody.
                </p>
              ) : (
                <div className="an-chips">
                  {pickable.map(r => (
                    <Chip key={r.role_id} on={roleIds.includes(r.role_id)}
                      onClick={() => setRoleIds(prev => (prev.includes(r.role_id) ? prev.filter(x => x !== r.role_id) : [...prev, r.role_id]))}>
                      @{r.name}
                    </Chip>
                  ))}
                </div>
              )}

              <label className="an-label an-label-block">
                <span className="an-label-row">Message <Count n={contentLength} max={ANNOUNCE_LIMITS.content} /></span>
                <textarea className="an-input an-area" rows={6} value={content} onChange={e => setContent(e.target.value)}
                  placeholder={'SHOP HOURS THIS WEEK\n\nTuesday 3:15 to 6:00'} />
              </label>

              <div className="an-toggles">
                <Chip on={pollOn} onClick={() => { setPollOn(v => !v); if (!pollOn) setEmbedOn(false) }}>Add a poll</Chip>
                <Chip on={embedOn} onClick={() => { setEmbedOn(v => !v); if (!embedOn) setPollOn(false) }}>Add an embed</Chip>
              </div>
              <p className="an-help">A poll and an embed go in separate posts. A poll cannot be edited once it is posted.</p>

              {embedOn && (
                <div className="an-sub-card">
                  <label className="an-label an-label-block">
                    <span className="an-label-row">Embed title <Count n={embedTitle.trim().length} max={ANNOUNCE_LIMITS.embedTitle} /></span>
                    <input className="an-input" value={embedTitle} onChange={e => setEmbedTitle(e.target.value)} />
                  </label>
                  <label className="an-label an-label-block">
                    <span className="an-label-row">Embed text <Count n={embedDesc.trim().length} max={ANNOUNCE_LIMITS.embedDescription} /></span>
                    <textarea className="an-input an-area" rows={4} value={embedDesc} onChange={e => setEmbedDesc(e.target.value)} />
                  </label>
                </div>
              )}

              {pollOn && (
                <div className="an-sub-card">
                  <label className="an-label an-label-block">
                    <span className="an-label-row">Question <Count n={question.trim().length} max={ANNOUNCE_LIMITS.pollQuestion} /></span>
                    <input className="an-input" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Which Saturday works for the pit build?" />
                  </label>
                  <span className="an-section-label">Answers ({ANNOUNCE_LIMITS.pollAnswersMin} to {ANNOUNCE_LIMITS.pollAnswersMax})</span>
                  {answers.map((a, i) => (
                    <div key={i} className="an-answer">
                      <input className="an-input" value={a} aria-label={`Answer ${i + 1}`}
                        onChange={e => setAnswers(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} />
                      <Count n={a.trim().length} max={ANNOUNCE_LIMITS.pollAnswer} />
                      <button type="button" className="an-btn" aria-label={`Remove answer ${i + 1}`}
                        disabled={answers.length <= ANNOUNCE_LIMITS.pollAnswersMin}
                        onClick={() => setAnswers(prev => prev.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="an-btn" disabled={answers.length >= ANNOUNCE_LIMITS.pollAnswersMax}
                    onClick={() => setAnswers(prev => [...prev, ''])}>Add answer</button>
                  <span className="an-section-label">Open for</span>
                  <div className="an-chips">
                    {POLL_DURATION_PRESETS.map(p => (
                      <Chip key={p.hours} on={hours === p.hours} onClick={() => setHours(p.hours)}>{p.label}</Chip>
                    ))}
                  </div>
                  <label className="an-check">
                    <input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} />
                    Allow more than one answer
                  </label>
                </div>
              )}

              {errors.length > 0 && (
                <ul className="an-errors" aria-label="Not ready to send">
                  {errors.map((e, i) => <li key={i}>{e.message}</li>)}
                </ul>
              )}

              <div className="an-actions">
                <button type="button" className="an-btn" onClick={checkWithServer}
                  disabled={errors.length > 0 || dry?.loading || fn.kind === 'not_deployed'}>
                  Check with server
                </button>
                <button type="button" className="an-btn an-btn-go an-btn-big" onClick={review} disabled={errors.length > 0}>
                  Review and send
                </button>
              </div>
              <DryRun result={dry?.asked === payloadJson ? dry : null} localPayload={payload} />
            </section>
          )}

          {step === 'confirm' && (
            <section className="an-card an-confirm" aria-label="Confirm">
              <h2 className="an-h2">Send this?</h2>
              <p>
                Post to <strong>#{draft.channel}</strong> as the team bot
                {payload.allowed_mentions.roles.length > 0
                  ? <>, notifying <strong>{payload.allowed_mentions.roles.map(id => `@${roles.find(r => r.role_id === id)?.name ?? id}`).join(', ')}</strong></>
                  : ', notifying nobody'}.
                {payload.poll && ' The poll cannot be edited once it is posted.'}
                {' '}It cannot be unsent from this page.
              </p>
              {!fnReady && <p className="an-note an-note-bad">Sending is off. {fn.message || notReadyLine}</p>}
              <div className="an-actions">
                <button type="button" className="an-btn" onClick={backToDraft} disabled={sending}>Back to the draft</button>
                <button type="button" className="an-btn an-btn-go an-btn-big" onClick={send} disabled={sending || !fnReady}>
                  {sending ? 'Sending…' : 'Send now'}
                </button>
              </div>
            </section>
          )}

          {step === 'result' && result && (
            <section className={`an-card an-result an-result-${resultTone}`} aria-label="Result" data-state={result.kind}>
              {result.kind === 'ok' ? (
                <>
                  <h2 className="an-h2">Sent</h2>
                  <p>Posted to #{result.body.channel}. Message id <span className="an-mono">{result.body.message_id}</span>.</p>
                  {(result.body.warnings ?? []).map((w, i) => <p key={i} className="an-note">{w}</p>)}
                  {result.body.log_error && <p className="an-note">The post went out, but the log row could not be updated: {result.body.log_error}</p>}
                  <div className="an-actions">
                    <button type="button" className="an-btn an-btn-go an-btn-big" onClick={composeAnother}>Compose another</button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="an-h2">{result.kind === 'unknown_outcome' ? 'Not confirmed' : result.kind === 'already_sent' ? 'Already sent' : 'Not sent'}</h2>
                  <p>{result.message}</p>
                  {result.kind === 'invalid' && result.errors?.length > 1 && (
                    <ul className="an-errors">{result.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
                  )}
                  <div className="an-actions">
                    <button type="button" className="an-btn" onClick={backToDraft}>Back to the draft</button>
                    {canRetrySame && (
                      <button type="button" className="an-btn an-btn-go" onClick={() => setStep('confirm')}>Try again</button>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <div className="an-col an-col-preview">
          <Preview payload={payload} roles={roles} channel={draft.channel} />
        </div>
      </div>

      <RoleEditor roles={roles} onChanged={loadRoles} />

      <section className="an-card" aria-label="Recent announcements">
        <div className="an-card-head">
          <h2 className="an-h2">Recent announcements</h2>
          <button type="button" className="an-btn" onClick={loadLog}>Refresh</button>
        </div>
        {log.length === 0 ? (
          <p className="an-muted">Nothing sent from here yet.</p>
        ) : (
          <ul className="an-log">
            {log.map(r => (
              <li key={r.id} className="an-log-item">
                <div className="an-log-top">
                  <span className={`an-pill an-pill-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  <span className="an-mono">#{r.channel_name}</span>
                  <span>{r.sender_name || '—'}</span>
                  <span className="an-mono an-log-when">{fmtDateTime(r.created_at)}</span>
                </div>
                <p className="an-log-text">
                  {(r.content || '').replace(/<@&\d+>\s*/g, '').trim()
                    || (r.poll ? `Poll: ${r.poll.question?.text ?? ''}` : r.embed?.title || '—')}
                </p>
                {r.role_names?.length > 0 && <p className="an-log-meta">Pinged {r.role_names.map(n => `@${n}`).join(', ')}</p>}
                {r.error && <p className="an-log-meta an-log-error">{r.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
