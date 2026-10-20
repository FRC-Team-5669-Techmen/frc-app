// Hashes and random tokens for the connector's own OAuth server.
// Ported from idea-app src/lib/server/connector/crypto.ts.
import { createHash, randomBytes } from 'node:crypto'

export const sha256Hex = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')

/** 32 random bytes, base64url. `random` is injectable so a test is deterministic. */
export function opaqueToken(random = randomBytes) {
  return Buffer.from(random(32)).toString('base64url')
}

/** RFC 7636: the challenge is 43 to 128 unreserved characters. */
export const PKCE_CHALLENGE = /^[A-Za-z0-9\-._~]{43,128}$/

export function pkceMatches(verifier, challenge) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier ?? '')) return false
  return createHash('sha256').update(verifier, 'ascii').digest('base64url') === challenge
}

/** JSON with object keys sorted, so equal arguments hash equally. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}
