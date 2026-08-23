import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, useMemo } from 'react'
import { cx } from '../cx.js'

/**
 * FirstName — the FIRST name in text, enforced.
 *
 *   • FIRST is always all capitals and italic (CSS). Weight is inherited, so it
 *     is never bolded except inside fully bolded text.
 *   • It carries a superscript ® on FIRST USE per deck, tracked separately for
 *     the heading channel and the body channel, as the guidelines require.
 *   • Program names: FIRST® Robotics Competition, FIRST® LEGO® League,
 *     FIRST® Tech Challenge (LEGO takes its own first-use ®).
 *   • Plural and possessive forms are REFUSED, never rendered.
 *
 * Usage: <FirstName /> (the bare word), <FirstName>FIRST Robotics Competition</FirstName>,
 * or the shorthand <FirstName program="frc" />. channel="heading" | "body" (default body).
 *
 * Wrap a deck in <FirstNameScope audience="internal|external"> to scope the
 * first-use registry to that deck. External audience makes enforcement
 * mandatory: a refused form throws instead of rendering a fault marker.
 *
 * The registry is an external store. Each instance claims its terms in a
 * layout effect (after commit, before paint, in document order) against a
 * stable per-instance identity and reads the verdict through
 * useSyncExternalStore. Claims are NOT made during render: React StrictMode
 * renders twice and useId differs between those passes on a client root, so a
 * render-time claim leaves a ghost holder and nothing ever carries the mark.
 */

const ALLOWED = new Map([
  ['first', [{ t: 'first' }]],
  ['first robotics competition', [{ t: 'first' }, ' Robotics Competition']],
  ['first tech challenge', [{ t: 'first' }, ' Tech Challenge']],
  ['first lego league', [{ t: 'first' }, ' ', { t: 'lego' }, ' League']],
  ['first lego league challenge', [{ t: 'first' }, ' ', { t: 'lego' }, ' League Challenge']],
  ['first lego league explore', [{ t: 'first' }, ' ', { t: 'lego' }, ' League Explore']],
  ['first lego league discover', [{ t: 'first' }, ' ', { t: 'lego' }, ' League Discover']],
])

const PROGRAM_TEXT = {
  first: 'FIRST',
  frc: 'FIRST Robotics Competition',
  ftc: 'FIRST Tech Challenge',
  fll: 'FIRST LEGO League',
}

/** Normalize and classify the requested text. Exported so it can be tested. */
export function classifyFirstName(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim()
  const key = raw.toLowerCase()
  if (!raw) return { ok: false, reason: 'empty', raw }
  if (ALLOWED.has(key)) return { ok: true, parts: ALLOWED.get(key), raw }
  if (/(^|\s)first['’]s?\b/.test(key) || /['’]s$/.test(key) || /s['’]$/.test(key)) return { ok: false, reason: 'possessive', raw }
  if (/^firsts\b/.test(key) || (key.endsWith('s') && ALLOWED.has(key.slice(0, -1)))) return { ok: false, reason: 'plural', raw }
  return { ok: false, reason: 'unknown', raw }
}

class FirstUseRegistry {
  constructor() {
    this.holders = new Map()
    this.listeners = new Set()
    this.subscribe = (fn) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  }
  emit() { for (const l of this.listeners) l() }
  claim(channel, term, owner) {
    const k = `${channel}:${term}`
    const h = this.holders.get(k)
    if (h == null) { this.holders.set(k, owner); this.emit(); return true }
    return h === owner
  }
  release(channel, term, owner) {
    const k = `${channel}:${term}`
    if (this.holders.get(k) === owner) { this.holders.delete(k); this.emit() }
  }
  holds(channel, term, owner) { return this.holders.get(`${channel}:${term}`) === owner }
  reset() { this.holders.clear(); this.emit() }
}

const defaultRegistry = new FirstUseRegistry()
const FirstNameContext = createContext({ audience: 'internal', registry: defaultRegistry })

export function FirstNameScope({ audience = 'internal', children }) {
  const value = useMemo(() => ({ audience, registry: new FirstUseRegistry() }), [audience])
  return <FirstNameContext.Provider value={value}>{children}</FirstNameContext.Provider>
}

export function useFirstNameScope() {
  return useContext(FirstNameContext)
}

export function FirstName({ program, channel = 'body', className, children, ...rest }) {
  const { audience, registry } = useContext(FirstNameContext)
  // No program and no children means the bare name: <FirstName /> renders FIRST.
  const childText = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : ''
  const text = program ? PROGRAM_TEXT[program] ?? program : children == null ? 'FIRST' : childText
  const result = classifyFirstName(text)
  const terms = result.ok ? result.parts.filter((p) => typeof p === 'object').map((p) => p.t) : []
  const termsKey = terms.join(',')

  const owner = useRef(null)
  if (owner.current === null) owner.current = {}

  // "1"/"0" per term, in term order. A string snapshot compares by value.
  const snapshot = useSyncExternalStore(
    registry.subscribe,
    () => terms.map((t) => (registry.holds(channel, t, owner.current) ? '1' : '0')).join(''),
    () => '',
  )

  useLayoutEffect(() => {
    if (!result.ok || terms.length === 0) return undefined
    const me = owner.current
    for (const t of terms) registry.claim(channel, t, me)
    return () => { for (const t of terms) registry.release(channel, t, me) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, channel, termsKey, result.ok])

  if (!result.ok) {
    const message = `FirstName refused "${result.raw}": ${result.reason} form. Use FIRST, FIRST Robotics Competition, FIRST Tech Challenge, or FIRST LEGO League, never plural or possessive.`
    if (audience === 'external') throw new Error(message)
    if (typeof console !== 'undefined') console.error(message)
    return (
      <span className={cx('frc-first frc-first-refused', className)} data-frc="FirstName" data-refused={result.reason} {...rest}>
        <span className="frc-first-fault">FIRST name misuse: {result.reason}</span>
      </span>
    )
  }

  const firstFor = Object.fromEntries(terms.map((t, i) => [t, snapshot[i] === '1']))
  return (
    <span className={cx('frc-first', className)} data-frc="FirstName" data-channel={channel} {...rest}>
      {result.parts.map((part, i) => {
        if (typeof part === 'string') return <span key={i}>{part}</span>
        const word = part.t === 'first' ? 'FIRST' : 'LEGO'
        const reg = firstFor[part.t] === true
        return (
          <span key={i} className={part.t === 'first' ? 'frc-first-word' : 'frc-first-mark'} data-first-use={reg ? '' : undefined}>
            {word}
            {reg ? <sup className="frc-first-reg" aria-label="registered">®</sup> : null}
          </span>
        )
      })}
    </span>
  )
}
