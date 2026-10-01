// The plugin list fixture mode runs: core first, then every features/*.js
// default export in file-name order, each named after its file. An empty
// features/ directory is fine.
//
// Its own module so the browser shell (client.js) and the node test that seeds
// every plugin (tests/fixture-seed.test.js) load the SAME list in the same
// order, rather than each keeping a copy of this glob. import.meta.glob is
// Vite's, and vitest runs through Vite, so it resolves the same way in both.

import core from './core.js'

const modules = import.meta.glob('./features/*.js', { eager: true })

export const FEATURES = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, mod]) => ({ name: path.replace(/^.*\/|\.js$/g, ''), ...(mod?.default ?? {}) }))

export const PLUGINS = [core, ...FEATURES]
