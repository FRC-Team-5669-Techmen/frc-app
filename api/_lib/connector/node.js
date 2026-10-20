// Vercel Node functions take (req, res); the connector's handlers take a web
// Request and answer a web Response. These two adapters are the whole bridge.
import { randomBytes } from 'node:crypto'
import { supabaseConnectorBackend } from './backend.js'
import { memoryLimiter } from './oauth.js'
import { isSchemaMissing } from './errors.js'

/** The production origin, from the request (Vercel sets x-forwarded-host). */
export function originOf(req) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost'
  const proto = req.headers['x-forwarded-proto'] ?? (String(host).startsWith('localhost') || String(host).startsWith('127.') ? 'http' : 'https')
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`
}

export async function toRequest(req, origin) {
  const chunks = []
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) {
      // Vercel parsed the body already; hand it back as text.
      const type = String(req.headers['content-type'] ?? '')
      chunks.push(Buffer.from(type.includes('urlencoded') ? new URLSearchParams(req.body).toString() : JSON.stringify(req.body)))
    } else if (req.body !== undefined) {
      chunks.push(Buffer.from(req.body))
    } else {
      for await (const c of req) chunks.push(Buffer.from(c))
    }
  }
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v))
  return new Request(new URL(req.url, origin), { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
}

export async function sendResponse(res, response) {
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  const buf = Buffer.from(await response.arrayBuffer())
  res.end(buf)
}

let deps
/** The production collaborators, built once per instance. */
export function productionDeps() {
  deps ??= {
    backend: supabaseConnectorBackend(),
    now: () => Date.now(),
    random: (n) => randomBytes(n),
    fetch: (...a) => fetch(...a),
    limiter: memoryLimiter(),
    isSchemaMissing,
  }
  return deps
}
