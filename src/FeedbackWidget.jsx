import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { REPORT_TYPES, TRIED_MAX, buildReport, submitReport, summarizeUserAgent } from './feedbackModel'
import './FeedbackWidget.css'

// The global feedback button. Mounted ONCE in App.jsx's ProtectedLayout, so it
// rides along with the NavBar on every authenticated page instead of being
// wired into each one. The check-in fast paths sit OUTSIDE that layout by
// design, so they stay untouched.
//
// Deliberately self-contained: it imports nothing from the admin page. A member
// writes the message and, if they like, a type and what they tried; everything
// else (route, viewport, user agent, build, author) is gathered at submit time
// and shown in the panel before it is sent.
//
// THE TYPE IS OPTIONAL. Mr. Pina reported on 2026-09-03 that he should be able
// to send feedback without picking one, so nothing is preselected and Send is
// live as soon as there is a message. Tapping a chosen type again clears it.
//
// MIGRATION 0002 MAY NOT BE APPLIED YET, and this insert works today. So the
// write goes through submitReport's ladder (src/feedbackModel.js): if the new
// `tried` / `build` columns are missing, both are folded into the message and
// the report is resent without them; if the old NOT NULL on category refuses an
// untyped report, it is resent as the old neutral 'feedback'. The member sees
// none of that -- the report simply saves.

// The client build, stamped by vite.config.js. Read defensively: a build that
// predates the stamp, or a dev server without it, still files a report.
const BUILD = import.meta.env.VITE_APP_BUILD || 'unknown'

const MAX_IMAGES = 6
const MAX_BYTES  = 10 * 1024 * 1024   // 10 MB per image

// Storage extension from the file name, falling back to the MIME subtype --
// a pasted screenshot arrives as "image.png" in most browsers but as a blob
// with no useful name in some, and a path with no extension is a nuisance to
// open later.
function extFor(file) {
  const fromName = (file.name || '').split('.').pop()
  if (fromName && fromName !== file.name && fromName.length <= 5) return fromName.toLowerCase()
  const sub = (file.type || '').split('/')[1]
  return (sub || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
}

export default function FeedbackWidget({ session }) {
  const uid = session?.user?.id
  const { pathname } = useLocation()

  const [open, setOpen]         = useState(false)
  const [type, setType]         = useState('')
  const [message, setMessage]   = useState('')
  const [tried, setTried]       = useState('')
  const [images, setImages]     = useState([])   // { id, file, url }
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  const fileRef = useRef(null)
  const panelRef = useRef(null)

  // Object URLs are revoked at the three moments the preview genuinely stops
  // being shown -- remove, reset, unmount -- and never on a queue change. An
  // effect keyed on `images` would revoke the whole previous array every time
  // one file is added, which breaks every preview already on screen. The ref
  // exists only so the unmount cleanup can see the final queue without
  // re-subscribing.
  const imagesRef = useRef(images)
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => () => { imagesRef.current.forEach(i => URL.revokeObjectURL(i.url)) }, [])

  const reset = useCallback(() => {
    setImages(prev => { prev.forEach(i => URL.revokeObjectURL(i.url)); return [] })
    setType(''); setMessage(''); setTried(''); setError(''); setDone(false); setDragging(false)
  }, [])

  function close() { setOpen(false); reset() }

  // Escape closes, matching every other dismissable surface in the app.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])   // eslint-disable-line react-hooks/exhaustive-deps

  // One funnel for all three input paths (picker, drop, paste) so the queue,
  // the caps and the previews behave identically no matter how a file arrived.
  const addFiles = useCallback(list => {
    const incoming = [...list].filter(f => f && f.type.startsWith('image/'))
    if (!incoming.length) return
    setError('')
    setImages(prev => {
      const room = MAX_IMAGES - prev.length
      if (room <= 0) { setError(`Up to ${MAX_IMAGES} images per report.`); return prev }
      const kept = []
      for (const f of incoming.slice(0, room)) {
        if (f.size > MAX_BYTES) { setError(`"${f.name || 'image'}" is over 10 MB and was skipped.`); continue }
        kept.push({ id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f) })
      }
      if (incoming.length > room) setError(`Up to ${MAX_IMAGES} images per report.`)
      return kept.length ? [...prev, ...kept] : prev
    })
  }, [])

  function removeImage(id) {
    setImages(prev => {
      const hit = prev.find(i => i.id === id)
      if (hit) URL.revokeObjectURL(hit.url)
      return prev.filter(i => i.id !== id)
    })
  }

  // Paste is bound to the whole panel, not just the attach area, so a
  // screenshot on the clipboard lands whether the caret is in the textarea or
  // nowhere in particular -- that is the fastest path from "saw a bug" to
  // "filed it" and the one most likely to be used.
  function onPaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length) { e.preventDefault(); addFiles(files) }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer?.files ?? [])
  }

  async function uploadImage(file) {
    const path = `report/${uid}/${crypto.randomUUID()}.${extFor(file)}`
    const { error: err } = await supabase.storage
      .from('feedback')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
    if (err) throw err
    return path
  }

  async function submit(e) {
    e.preventDefault()
    if (!message.trim() || busy) return
    setBusy(true); setError('')
    try {
      // Images first: a row that names a path which failed to upload is worse
      // than a submit that reports the failure and keeps the queue intact.
      const imagePaths = []
      for (const img of images) imagePaths.push(await uploadImage(img.file))

      const payload = buildReport({
        memberId:  uid,
        type:      type || null,
        message,
        tried,
        imagePaths,
        route:     pathname,
        viewport:  `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        build:     BUILD,
      })
      const { error: err } = await submitReport(p => supabase.from('feedback').insert(p), payload)
      if (err) throw err
      setDone(true)
      setTimeout(() => { setOpen(false); reset() }, 1600)
    } catch (err) {
      setError(err.message || 'Could not send that. Try again.')
    }
    setBusy(false)
  }

  if (!uid) return null

  const browser = summarizeUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)

  return (
    <>
      <button
        type="button"
        className={`fb-launch${open ? ' fb-launch-open' : ''}`}
        aria-label={open ? 'Close feedback' : 'Send feedback'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open
            ? <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>
            : <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.3-.5L3 21l1.7-4.5A8.2 8.2 0 0 1 3.6 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8.4 8.4z" /><line x1="8.5" y1="10" x2="15.5" y2="10" /><line x1="8.5" y1="13.5" x2="13" y2="13.5" /></>
          }
        </svg>
      </button>

      {open && (
        <form
          ref={panelRef}
          className="fb-panel"
          onSubmit={submit}
          onPaste={onPaste}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false) }}
          onDrop={onDrop}
        >
          <div className="fb-head">
            <span className="fb-title">Send feedback</span>
            <span className="fb-route">{pathname}</span>
          </div>

          {done ? (
            <p className="fb-done">Sent. Thank you.</p>
          ) : (
            <>
              <span className="fb-label" id="fb-type-label">Type (optional)</span>
              <div className="fb-cats" role="group" aria-labelledby="fb-type-label">
                {REPORT_TYPES.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    title={t.hint}
                    className={`fb-cat${type === t.key ? ' fb-cat-on' : ''}`}
                    aria-pressed={type === t.key}
                    onClick={() => setType(prev => (prev === t.key ? '' : t.key))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <label className="fb-label" htmlFor="fb-message">What happened?</label>
              <textarea
                id="fb-message"
                className="fb-text"
                rows={4}
                placeholder="What happened, or what would make this better?"
                value={message}
                onChange={e => setMessage(e.target.value)}
              />

              <label className="fb-label" htmlFor="fb-tried">What did you try? (optional)</label>
              <textarea
                id="fb-tried"
                className="fb-text fb-text-tried"
                rows={2}
                maxLength={TRIED_MAX}
                placeholder="Reloaded the page, tried another page, asked someone else..."
                value={tried}
                onChange={e => setTried(e.target.value)}
              />

              <div
                className={`fb-drop${dragging ? ' fb-drop-over' : ''}`}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
              >
                <span className="fb-drop-label">
                  Drop, paste, or click to attach a screenshot
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="fb-file"
                  onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                />
              </div>

              {!!images.length && (
                <div className="fb-thumbs">
                  {images.map(img => (
                    <div key={img.id} className="fb-thumb">
                      <img src={img.url} alt="" />
                      <button
                        type="button"
                        className="fb-thumb-x"
                        aria-label="Remove image"
                        onClick={() => removeImage(img.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* What travels with the report, shown before it is sent: nothing
                  is gathered that the member cannot see here. */}
              <p className="fb-context">
                Sent with it: {pathname} · {typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`}
                {browser ? ` · ${browser}` : ''} · build {BUILD}
              </p>

              {error && <p className="fb-error">{error}</p>}

              <button
                type="submit"
                className="fb-submit"
                disabled={busy || !message.trim()}
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            </>
          )}
        </form>
      )}
    </>
  )
}
