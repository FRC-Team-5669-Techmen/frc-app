import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// The build id the feedback widget stamps on a report: the deploying commit on
// Vercel, the local HEAD otherwise, 'dev' when neither is available.
function buildId() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

// Fixture mode (`vite --mode fixture`, npm run dev:fixture): every import of
// src/supabase.js resolves to the in-memory fake in src/dev/fixture/client.js.
// This plugin is not even constructed in any other mode, so a production build
// cannot reach the fixture -- see src/dev/fixture/README.md.
function fixtureSupabase() {
  const real = fileURLToPath(new URL('./src/supabase.js', import.meta.url))
  const fake = fileURLToPath(new URL('./src/dev/fixture/client.js', import.meta.url))
  return {
    name: 'techmen-fixture-supabase',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/(^|\/)supabase(\.js)?$/.test(source) || source.startsWith('@')) return null
      const hit = await this.resolve(source, importer, { ...options, skipSelf: true })
      return hit && path.normalize(hit.id) === real ? fake : null
    },
  }
}

function realNodeModules() {
  try { return realpathSync(path.join(ROOT, 'node_modules')) } catch { return path.join(ROOT, 'node_modules') }
}

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_APP_BUILD': JSON.stringify(buildId()),
  },
  // Fixture mode serves on 5401 unless FIXTURE_PORT or --port says otherwise,
  // and refuses to drift to another port: a test aimed at 5401 must not
  // silently drive some other server that happened to be there.
  server: mode === 'fixture'
    ? {
        host: '127.0.0.1',
        port: Number(process.env.FIXTURE_PORT) || 5401,
        strictPort: true,
        // A git worktree may symlink node_modules to another checkout; the
        // fonts then resolve outside the project and dev answers 403 for them.
        fs: { allow: [searchForWorkspaceRoot(ROOT), realNodeModules()] },
      }
    : undefined,
  // ...and keeps its dependency pre-bundle out of node_modules/.vite, which a
  // checkout's other dev servers share: two configs alternating there make
  // each re-optimize on every boot. One directory per checkout, under tmp.
  cacheDir: mode === 'fixture'
    ? path.join(os.tmpdir(), 'techmen-vite-fixture', createHash('sha256').update(ROOT).digest('hex').slice(0, 12))
    : undefined,
  plugins: [
    mode === 'fixture' && fixtureSupabase(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Techmen · 5669',
        short_name: 'Techmen',
        description: 'Team shop check-in and check-out',
        theme_color: '#0A0B0D',
        background_color: '#0A0B0D',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
}))
