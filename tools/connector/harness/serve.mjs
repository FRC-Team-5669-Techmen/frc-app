#!/usr/bin/env node
// The REAL MCP handler (api/_lib/connector/mcp.js) on a local HTTP port, over
// the SQL harness database, for the MCP Inspector. Prints the bearer token it
// minted for the fixture admin. Dev only.
//
//   node tools/sql-harness/run.mjs --tests none --keep        # note PGHOST/PGPORT
//   PGHOST=... PGPORT=... node tools/connector/harness/serve.mjs [port]
//   npx @modelcontextprotocol/inspector --cli --transport http \
//     --server-url http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>" --method tools/list
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { handleMcp } from '../../../api/_lib/connector/mcp.js'
import { sha256Hex } from '../../../api/_lib/connector/crypto.js'
import { localBackend } from './local-backend.mjs'

const PORT = Number(process.argv[2] ?? 8787)
const ADMIN = { id: '00000000-0000-0000-0000-0000000000a1', email: 'admin.test@boscotech.edu' }
const backend = await localBackend()
await backend.pool.query('update public.connector_settings set allowed_member = $1, enabled = true where id', [ADMIN.id])
const bearer = randomBytes(32).toString('base64url')
await backend.createToken({ userId: ADMIN.id, email: ADMIN.email, clientId: 'inspector', label: 'MCP Inspector (local)', scope: 'app', accessHash: sha256Hex(bearer), refreshHash: sha256Hex(`r-${bearer}`), accessExpiresAt: Date.now() + 3600_000, refreshExpiresAt: Date.now() + 86400_000 })
const deps = { backend, now: () => Date.now(), random: (n) => randomBytes(n), fetch, limiter: { take: () => true }, isSchemaMissing: () => false }
const origin = `http://127.0.0.1:${PORT}`

createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  const request = new Request(new URL(req.url, origin), { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
  const response = req.url.startsWith('/mcp') ? await handleMcp(request, origin, deps) : new Response('not found', { status: 404 })
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await response.arrayBuffer()))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${origin}/mcp`)
  console.log(`BEARER ${bearer}`)
})
