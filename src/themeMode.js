// THE THEME SWITCH: Light, Dark or System, chosen by each person on their own
// device. Dark stays the default (every current user has only ever seen dark).
//
// Pure functions plus two thin DOM helpers; no React, no Supabase, so the
// account menu and the profile can both import it without pulling anything
// else. The check-in fast path imports NOTHING from here: the theme is put on
// <html data-theme> before first paint by the inline script in index.html.
//
// DUPLICATE, ON PURPOSE (CLAUDE.md working convention 7): that inline script
// repeats resolveTheme() in a few bytes, because it must run before any module
// loads. tests/theme-mode.test.js runs the script itself against every choice
// and both system preferences and requires it to agree with resolveTheme(), so
// the two copies cannot drift without a red test.

export const THEME_KEY = 'techmen:theme'
export const THEME_CHOICES = Object.freeze(['light', 'dark', 'system'])
export const DEFAULT_CHOICE = 'dark'
// The browser chrome color for each resolved theme (meta theme-color).
export const THEME_COLOR = Object.freeze({ dark: '#0A0B0D', light: '#FFFFFF' })

/** A stored value, or anything else, to one of the three choices. */
export function normalizeChoice(raw) {
  return THEME_CHOICES.includes(raw) ? raw : DEFAULT_CHOICE
}

/** The choice and the system preference, to the theme actually painted. */
export function resolveTheme(choice, prefersLight = false) {
  const c = normalizeChoice(choice)
  if (c === 'system') return prefersLight ? 'light' : 'dark'
  return c
}

export function readChoice(storage = globalThis.localStorage) {
  try { return normalizeChoice(storage?.getItem(THEME_KEY)) } catch { return DEFAULT_CHOICE }
}

export function writeChoice(choice, storage = globalThis.localStorage) {
  const c = normalizeChoice(choice)
  try { storage?.setItem(THEME_KEY, c) } catch { /* private window: this visit only */ }
  return c
}

export function systemPrefersLight() {
  try { return !!globalThis.matchMedia?.('(prefers-color-scheme: light)').matches } catch { return false }
}

/** Paint a resolved theme onto the document. */
export function applyTheme(resolved, doc = globalThis.document) {
  if (!doc?.documentElement) return
  const theme = resolved === 'light' ? 'light' : 'dark'
  doc.documentElement.dataset.theme = theme
  const meta = doc.querySelector?.('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}

const listeners = new Set()

/** Store a choice, paint it now, and tell every mounted switch. */
export function setThemeChoice(choice) {
  const c = writeChoice(choice)
  applyTheme(resolveTheme(c, systemPrefersLight()))
  for (const fn of listeners) fn(c)
  return c
}

/**
 * Subscribe a switch to choice changes (another switch, another tab, or the
 * system flipping while the choice is System). Returns the unsubscribe.
 */
export function subscribeTheme(fn) {
  listeners.add(fn)
  const onStorage = (e) => {
    if (e.key !== THEME_KEY) return
    const c = readChoice()
    applyTheme(resolveTheme(c, systemPrefersLight()))
    fn(c)
  }
  let mq = null
  const onSystem = () => { if (readChoice() === 'system') applyTheme(resolveTheme('system', systemPrefersLight())) }
  try {
    globalThis.addEventListener?.('storage', onStorage)
    mq = globalThis.matchMedia?.('(prefers-color-scheme: light)') ?? null
    mq?.addEventListener?.('change', onSystem)
  } catch { /* no window */ }
  return () => {
    listeners.delete(fn)
    try {
      globalThis.removeEventListener?.('storage', onStorage)
      mq?.removeEventListener?.('change', onSystem)
    } catch { /* no window */ }
  }
}
