// The sign-out note's voice input (src/dictation.js), feedback 3c11c621:
// "voice input is broken and either does not do anything or repeats".
// Event shapes are the specification's (desktop) and react-speech-recognition's
// Android fixture (each guess a FINAL at confidence 0, the real final after it,
// often sent twice). No phone is in this container: the Android shape is a
// model, not a measurement.
import { describe, it, expect } from 'vitest'
import { FinalResults, appendSpoken, dictationErrorMessage, startDictation } from '../src/dictation.js'

const res = (transcript, isFinal, confidence = 0.9) => Object.assign([{ transcript, confidence }], { isFinal })
const ev = (resultIndex, ...results) => ({ resultIndex, results })

// The handler the app shipped before this fix, kept here as the negative
// control: it joined every result and appended on every event.
function oldHandler(events) {
  let note = ''
  for (const e of events) {
    const said = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim()
    if (said) note = note ? `${note.trim()} ${said}` : said
  }
  return note
}
function newHandler(events) {
  const f = new FinalResults()
  let note = ''
  for (const e of events) for (const c of f.take(e).commits) note = appendSpoken(note, c)
  for (const c of f.flush()) note = appendSpoken(note, c)
  return note
}

const ANDROID = [
  ev(0, res('wired', true, 0)),
  ev(0, res('wired the intake', true, 0)),
  ev(0, res('wired the intake motor', true, 0.92)),
  ev(0, res('wired the intake motor', true, 0.92)),
]
const DESKTOP = [
  ev(0, res('wired the', false)),
  ev(0, res('wired the intake motor', true)),
  ev(1, res('wired the intake motor', true), res(' and tested it', false)),
  ev(1, res('wired the intake motor', true), res(' and tested it with Jordan', true)),
]

describe('FinalResults: each spoken word lands once', () => {
  it('Android growing guesses and a doubled final land the sentence once', () => {
    expect(newHandler(ANDROID)).toBe('wired the intake motor')
  })
  it('negative control: the old handler repeats the same Android events', () => {
    const old = oldHandler(ANDROID)
    expect(old).not.toBe('wired the intake motor')
    expect(old.split('wired').length - 1).toBeGreaterThan(1)
  })
  it('desktop: two finals at two indexes, each once, exactly as said', () => {
    expect(newHandler(DESKTOP)).toBe('wired the intake motor and tested it with Jordan')
  })
  it('negative control: the old handler re-appends earlier results on desktop too', () => {
    expect(oldHandler(DESKTOP)).not.toBe('wired the intake motor and tested it with Jordan')
  })
  it('a growing final with a real confidence adds only its new words', () => {
    expect(newHandler([ev(0, res('cleaned', true)), ev(0, res('cleaned the bench', true))])).toBe('cleaned the bench')
  })
  it('a real repeat (heard again in between) still lands twice', () => {
    expect(newHandler([ev(0, res('done', true)), ev(1, res('done', true), res('done', false)), ev(1, res('done', true), res('done', true))]))
      .toBe('done done')
  })
  it('a provisional guess nothing confirms is kept when the session ends', () => {
    expect(newHandler([ev(0, res('swapped the battery', true, 0))])).toBe('swapped the battery')
  })
  it('interim words are shown, never committed', () => {
    const f = new FinalResults()
    const out = f.take(ev(0, res('still talking', false)))
    expect(out).toEqual({ commits: [], interim: 'still talking' })
    expect(f.flush()).toEqual([])
  })
})

describe('appendSpoken', () => {
  it('adds after what was typed, with one space, never removing a character', () => {
    expect(appendSpoken('Fixed the arm', 'and tested it')).toBe('Fixed the arm and tested it')
    expect(appendSpoken('', 'hello')).toBe('hello')
    expect(appendSpoken('typed ', '  ')).toBe('typed ')
  })
  it('respects the note length limit', () => {
    expect(appendSpoken('abc', 'defgh', 6)).toBe('abc de')
  })
})

// A stand-in recognizer that plays a script of events when started.
function fakeCtor(script, { throwOnStart = false } = {}) {
  return class {
    start() {
      if (throwOnStart) throw new Error('InvalidStateError')
      queueMicrotask(() => {
        for (const step of script) {
          if (step.error) this.onerror?.({ error: step.error })
          else this.onresult?.(step)
        }
        this.onend?.()
      })
    }
    stop() {}
  }
}
const run = (Ctor) => new Promise((resolve) => {
  let note = ''
  const states = []
  startDictation(Ctor, {
    onCommit: (w) => { note = appendSpoken(note, w) },
    onInterim: () => {},
    onState: (s) => { states.push(s); if (!s.listening) resolve({ note, states }) },
  })
})

describe('startDictation: a session never ends silently', () => {
  it('positive control: words heard land, and it ends with no error', async () => {
    const r = await run(fakeCtor(ANDROID))
    expect(r.note).toBe('wired the intake motor')
    expect(r.states[0]).toEqual({ listening: true, error: null })
    expect(r.states.at(-1)).toEqual({ listening: false, error: null })
  })
  it('a blocked microphone says so', async () => {
    const r = await run(fakeCtor([{ error: 'not-allowed' }]))
    expect(r.note).toBe('')
    expect(r.states.at(-1).error).toBe(dictationErrorMessage('not-allowed'))
    expect(r.states.at(-1).error).toMatch(/blocked/)
  })
  it('a session that heard nothing says so instead of doing nothing', async () => {
    const r = await run(fakeCtor([]))
    expect(r.states.at(-1).error).toMatch(/Nothing was heard/)
  })
  it('a start the browser refuses says so', async () => {
    const r = await run(fakeCtor([], { throwOnStart: true }))
    expect(r.states).toHaveLength(1)
    expect(r.states[0].listening).toBe(false)
    expect(r.states[0].error).toMatch(/Type your note/)
  })
  it('one tap is one session: the recognizer is started once and never restarted on end', async () => {
    let starts = 0
    const Base = fakeCtor(ANDROID)
    class Counted extends Base { start() { starts += 1; super.start() } }
    await run(Counted)
    await new Promise((r) => setTimeout(r, 10))
    expect(starts).toBe(1)
  })
})
