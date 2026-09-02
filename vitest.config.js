import { defineConfig } from 'vitest/config'

/**
 * Deliberately standalone, NOT an extension of vite.config.js.
 *
 * The app's config mounts `vite-plugin-pwa` in `injectManifest` mode, which
 * compiles `src/sw.js` and writes a precache manifest. None of that is needed
 * to import a pure module, and all of it is startup cost and failure modes a
 * test run would pay on every invocation.
 *
 * There is no `environment: 'jsdom'` and no DOM here ON PURPOSE. Everything in
 * `tests/` drives PURE modules -- `src/hoursUtils.js`, `src/hoursResolve.js`,
 * `src/accountability.js`, `src/categories.js`, and the Discord calendar
 * engine, none of which import React or Supabase. The moment a test needs to
 * render a component it needs a DOM, a component testing library, and a
 * decision about which of those; that is a separate bundle, and the browser
 * pass (`npm run verify:browser`) covers rendered surfaces in a real Chromium
 * where geometry and paint are real. A jsdom/happy-dom environment added
 * speculatively invites geometry assertions that read zero and pass vacuously.
 *
 * `pool: 'forks'` rather than the default threads: `scripts/discord/
 * calendar-sync.test.mjs` is driven as a child process by
 * `tests/legacy-suites.test.js`, and spawning from a worker thread is the
 * shape most likely to be flaky under a loaded runner.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
