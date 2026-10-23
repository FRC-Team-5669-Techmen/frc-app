// Speaking a note into a text box (the sign-out note, handbook Section 7),
// through the browser's own speech recognition. Pure: no React, no DOM, so
// tests/dictation.test.js drives it with recorded event shapes. The app keeps
// no audio; only the words land in the field.
//
// WHY IT EXISTS (feedback 3c11c621, 2026-10-22: "voice input is broken and
// either does not do anything or repeats"). The old handler joined EVERY
// result in the event and appended it on every event, so a phone that sends
// the same final twice, or a list of growing finals, wrote the sentence two or
// three times; and every refusal (microphone blocked, nothing heard, the
// service refused inside an installed app) ended silently, so the button
// looked dead.
//
// FinalResults is ported in design from idea-app's src/lib/feedback/dictation.ts
// (pina-hash/idea-app, the FinalResults class, read 2026-10-22). Chrome on
// Android, per react-speech-recognition's fixture: each growing guess arrives
// marked FINAL with confidence exactly 0, the real final follows with a real
// confidence, and that final is often delivered again, identical. Rules, keyed
// on what the event says, never on a user-agent sniff:
//   1. A final with confidence exactly 0 is provisional: shown, held, and
//      committed only if nothing confirms it (a higher index arrives, or the
//      session ends).
//   2. An identical re-send of the last committed final, with nothing heard
//      in between, is dropped.
//   3. A final that extends the last one adds only its new words.
// Otherwise a final is committed exactly as it arrived, which keeps desktop
// output identical to the plain resultIndex walk.

const wordKey = (w) => String(w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const wordsOf = (text) => String(text ?? '').trim().split(/\s+/).map((raw) => ({ raw, key: wordKey(raw) })).filter((w) => w.key !== '')

export class FinalResults {
  constructor() {
    this.last = null    // word keys of the last committed final
    this.heard = false  // an interim or provisional result arrived since
    this.held = null    // { index, text } a provisional final
  }

  /** One `result` event -> { commits: string[], interim: string }. */
  take(ev) {
    const commits = []
    let interim = ''
    const results = ev?.results ?? []
    for (let i = ev?.resultIndex ?? 0; i < results.length; i++) {
      if (this.held && i > this.held.index) this.release(commits)
      const r = results[i]
      const alt = r?.[0]
      const text = alt?.transcript ?? ''
      if (!r?.isFinal) {
        interim += text
        if (text.trim()) this.heard = true
        continue
      }
      if (alt?.confidence === 0) {
        this.held = { index: i, text }
        interim += text
        if (text.trim()) this.heard = true
        continue
      }
      if (this.held && this.held.index <= i) this.held = null
      const out = this.decide(text)
      if (out !== null) commits.push(out)
    }
    if (this.held && this.held.index < (ev?.resultIndex ?? 0)) interim = this.held.text + interim
    return { commits, interim }
  }

  /** The session ended: a guess nothing confirmed is committed, not lost. */
  flush() {
    const commits = []
    this.release(commits)
    return commits
  }

  release(commits) {
    const held = this.held
    this.held = null
    if (!held) return
    const out = this.decide(held.text)
    if (out !== null) commits.push(out)
  }

  decide(text) {
    const words = wordsOf(text)
    if (!words.length) return text
    const keys = words.map((w) => w.key)
    const last = this.last
    if (last && !this.heard) {
      const ext = keys.length >= last.length && last.every((k, i) => keys[i] === k)
      if (ext && keys.length === last.length) return null
      if (ext) {
        this.last = keys
        return words.slice(last.length).map((w) => w.raw).join(' ')
      }
    }
    this.last = keys
    this.heard = false
    return text
  }
}

/** Add spoken words to what is already in the field: never removes a character. */
export function appendSpoken(existing, words, max = Infinity) {
  const add = String(words ?? '').trim()
  if (!add) return existing
  const base = String(existing ?? '')
  const out = base.trim() ? `${base.replace(/\s+$/, '')} ${add}` : add
  return out.slice(0, max)
}

/** Every refusal in the person's terms, each saying what to do next. */
export function dictationErrorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked for this app. Allow it in your browser settings, or type your note.'
    case 'audio-capture':
      return 'No microphone was found. Type your note instead.'
    case 'no-speech':
      return 'Nothing was heard. Tap the mic and try again, or type your note.'
    case 'network':
      return 'Speaking needs a connection. Type your note instead.'
    case 'aborted':
      return null
    default:
      return 'Speaking stopped. Type your note instead.'
  }
}

/**
 * One listening session over a SpeechRecognition constructor. Never restarts
 * itself: an `end` is the end (a self-restart loop is how a phone chimes and
 * repeats). onCommit(text) for each piece of new words, onInterim(text) for
 * words still being heard, onState({ listening, error }).
 */
export function startDictation(Ctor, { lang = 'en-US', onCommit, onInterim, onState }) {
  const finals = new FinalResults()
  let heardAny = false
  let error = null
  let ended = false
  const r = new Ctor()
  r.lang = lang
  r.interimResults = true
  r.continuous = false
  r.maxAlternatives = 1
  r.onresult = (ev) => {
    const { commits, interim } = finals.take(ev)
    for (const c of commits) { if (c.trim()) { heardAny = true; onCommit?.(c) } }
    onInterim?.(interim)
  }
  r.onerror = (ev) => { error = ev?.error ?? 'unknown' }
  r.onend = () => {
    if (ended) return
    ended = true
    for (const c of finals.flush()) { if (c.trim()) { heardAny = true; onCommit?.(c) } }
    onInterim?.('')
    const msg = error ? dictationErrorMessage(error) : (heardAny ? null : dictationErrorMessage('no-speech'))
    onState?.({ listening: false, error: msg })
  }
  try {
    r.start()
    onState?.({ listening: true, error: null })
  } catch {
    ended = true
    onState?.({ listening: false, error: dictationErrorMessage('unknown') })
  }
  return { stop: () => { try { r.stop() } catch { /* already stopped */ } }, recognizer: r }
}
