#!/usr/bin/env node
// Anthropic's MCP Inspector (CLI mode) against the REAL MCP handler on the SQL
// harness, judged by rows read back from the database, never by the
// Inspector's own output. Run through the harness:
//
//   node tools/sql-harness/run.mjs --tests none --node tools/connector/harness/inspector.mjs
//
// It starts serve.mjs, then drives: tools/list; a read (todays_signins,
// member_hours); an undo-level write (correct_hours +2) and its row;
// a repeat with the same request_id (one row); undo_last (the reverse row);
// a confirm-level write (correct_hours -1) that previews and writes nothing,
// then commits with its confirm_token; call_app on a generated entry, which
// asks first; and a request with a bad bearer, refused with 401.
//
// Needs network for `npx @modelcontextprotocol/inspector@0.17.2` the first time.
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PORT = 8790 + Math.floor(Math.random() * 100)
const URL = `http://127.0.0.1:${PORT}/mcp`
const INSPECTOR = '@modelcontextprotocol/inspector@0.17.2'
const SAM = '00000000-0000-0000-0000-0000000000c1'

const server = spawn(process.execPath, [path.join(HERE, 'serve.mjs'), String(PORT)], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] })
const bearer = await new Promise((resolve, reject) => {
  let out = ''
  server.stdout.on('data', (d) => { out += d; const m = /BEARER (\S+)/.exec(out); if (m) resolve(m[1]) })
  setTimeout(() => reject(new Error('serve.mjs did not start')), 20000)
})
const db = new pg.Client({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER ?? 'postgres', database: process.env.PGDATABASE ?? 'frc' })
await db.connect()
const rows = async (sql, p) => (await db.query(sql, p)).rows

function inspect(args, token = bearer) {
  const r = spawnSync('npx', ['-y', INSPECTOR, '--cli', URL, '--transport', 'http', '--header', `Authorization: Bearer ${token}`, ...args], { encoding: 'utf8', timeout: 120000 })
  let json = null
  try { json = JSON.parse(r.stdout) } catch { json = null }
  return { json, out: r.stdout, err: r.stderr, status: r.status }
}
const call = (tool, kv, token) => {
  const res = inspect(['--method', 'tools/call', '--tool-name', tool, ...Object.entries(kv).flatMap(([k, v]) => ['--tool-arg', `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`])], token)
  const text = res.json?.content?.[0]?.text
  let body = null
  try { body = JSON.parse(text) } catch { body = text ?? null }
  return { ...res, body, isError: res.json?.isError }
}

let passed = 0
let total = 0
const check = (name, ok, detail = '') => { total += 1; if (ok) passed += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ` -- ${detail}` : ''}`) }
const adj = async () => (await rows(`select hours::float as h, reason from public.hour_adjustments where member_id = $1 and reason like '%Inspector%' order by created_at, hours`, [SAM]))
const audits = async () => (await rows(`select tool, function_name, status, undo is not null as has_undo, undo_of is not null as is_undo from public.connector_audit order by started_at`))

try {
  const list = inspect(['--method', 'tools/list'])
  check('tools/list over Streamable HTTP lists the registry tools', list.json?.tools?.length >= 15 && list.json.tools.some((t) => t.name === 'correct_hours'), list.err || list.out.slice(0, 200))

  const today = call('todays_signins', { said: 'who is here today' })
  check('a read (todays_signins) answers ok', today.body?.status === 'ok', JSON.stringify(today.body).slice(0, 200))
  const hours = call('member_hours', { said: 'how many hours does Sam have', member: 'Sam' })
  check('member_hours resolves "Sam" and reads standing as him', hours.body?.status === 'ok' && hours.body.member === 'Sam Student', JSON.stringify(hours.body).slice(0, 200))

  const before = await adj()
  const w = call('correct_hours', { said: 'give Sam two build hours', member: 'Sam', hours: 2, category: 'build', reason: 'Inspector credit', request_id: 'insp-1' })
  const afterW = await adj()
  check('an undo-level write runs at once and lands one row', w.body?.status === 'done' && afterW.length === before.length + 1 && afterW.at(-1).h === 2, JSON.stringify(w.body).slice(0, 200))
  const again = call('correct_hours', { said: 'give Sam two build hours', member: 'Sam', hours: 2, category: 'build', reason: 'Inspector credit', request_id: 'insp-1' })
  check('the same request_id again answers repeated and writes nothing', again.body?.status === 'repeated' && (await adj()).length === afterW.length, JSON.stringify(again.body).slice(0, 200))

  const u = call('undo_last', { said: 'undo that' })
  const afterU = await adj()
  check('undo_last writes the reverse row (-2)', u.body?.status === 'done' && afterU.length === afterW.length + 1 && afterU.at(-1).h === -2, JSON.stringify(u.body).slice(0, 300))

  const p = call('correct_hours', { said: 'take an hour off Sam', member: 'Sam', hours: -1, category: 'build', reason: 'Inspector debit', request_id: 'insp-2' })
  const afterP = await adj()
  check('lowering hours previews, hands back a confirm_token, and writes nothing', p.body?.status === 'preview' && !!p.body.confirm_token && afterP.length === afterU.length, JSON.stringify(p.body).slice(0, 200))
  const c = call('correct_hours', { said: 'take an hour off Sam', member: 'Sam', hours: -1, category: 'build', reason: 'Inspector debit', request_id: 'insp-2', confirm_token: p.body?.confirm_token })
  const afterC = await adj()
  check('the confirm_token commits it, one row of -1', c.body?.status === 'done' && afterC.length === afterP.length + 1 && afterC.at(-1).h === -1, JSON.stringify(c.body).slice(0, 200))

  const g = call('call_app', { said: 'log a safety violation for Sam', name: 'staff_log_safety', args: { p_member: 'Sam', p_rule: 'Safety glasses', p_note: 'Inspector' } })
  const safety = await rows(`select count(*)::int as n from public.safety_violations where note = 'Inspector'`)
  check('a generated entry through call_app asks first and writes nothing', g.body?.status === 'preview' && safety[0].n === 0, JSON.stringify(g.body).slice(0, 200))

  const gap = call('report_gap', { said: 'make a bus seating chart', what_is_missing: 'There is no seating chart' })
  const fb = await rows(`select count(*)::int as n from public.feedback where route = 'connector'`)
  check('report_gap files one report to the feedback inbox, marked connector', gap.body?.status === 'done' && fb[0].n === 1, JSON.stringify(gap.body).slice(0, 200))

  const a = await audits()
  check('the audit log holds one row per write (credit, its undo, debit, gap), the credit naming its reverse', a.filter((x) => x.status === 'done').length === 4 && a.some((x) => x.tool === 'correct_hours' && x.has_undo) && a.some((x) => x.is_undo), JSON.stringify(a))

  const bad = inspect(['--method', 'tools/list'], 'not-a-real-token')
  check('a bad bearer is refused (no tools listed)', !bad.json?.tools, bad.out.slice(0, 120))
} finally {
  server.kill()
  await db.end()
}
console.log(`connector inspector: ${passed}/${total} checks passed`)
process.exit(passed === total ? 0 : 1)
