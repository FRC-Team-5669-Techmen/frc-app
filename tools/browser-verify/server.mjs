/**
 * Boots `vite` for the harness and tears it down again.
 *
 * MODE `dsspec`, NOT the default. `src/supabase.js` calls `createClient` at
 * module load, and the app shell imports it, so a dev server with no
 * VITE_SUPABASE_URL cannot render any route at all -- including `/_ds`, which
 * touches no Supabase itself. `.env.dsspec` is TRACKED for exactly this reason
 * and carries placeholders pointing at a port nothing listens on (127.0.0.1:54329).
 *
 * Expect one blocked request to that port per page. The harness blocks every
 * non-loopback request anyway, and 54329 is loopback, so it is aborted by the
 * `--strictPort` server never answering rather than by the route filter; the
 * resulting console error is in `IGNORED_CONSOLE` in the route specs, named
 * rather than swept under a blanket pattern.
 *
 * The dev server is polled on a REAL ROUTE rather than trusted from its banner:
 * vite prints "ready" before the module graph can answer, and a route that
 * 500s on boot would otherwise be measured as a page.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

async function probe(url, { timeoutMs = 2000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function startDevServer({ port = 5199, host = '127.0.0.1', bootTimeoutMs = 180_000, quiet = true, probePath = '/_ds' } = {}) {
  const origin = `http://${host}:${port}`;

  const already = await probe(origin);
  if (already !== null) {
    return { origin, port, alreadyRunning: true, stop: async () => {}, log: () => '(reused an already-running server)' };
  }

  if (!existsSync(new URL('../../node_modules/vite', import.meta.url))) {
    throw new Error('node_modules/vite is missing. Run `npm install` first.');
  }
  if (!existsSync(new URL('../../.env.dsspec', import.meta.url))) {
    throw new Error('.env.dsspec is missing. It is tracked; the harness needs it to boot the app shell.');
  }

  const lines = [];
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)),
      '--mode', 'dsspec',
      '--port', String(port),
      '--host', host,
      '--strictPort',
    ],
    { cwd: REPO, env: { ...process.env, FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const grab = (buf) => {
    const s = buf.toString();
    lines.push(s);
    if (!quiet) process.stderr.write(s);
  };
  child.stdout.on('data', grab);
  child.stderr.on('data', grab);

  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });

  const started = Date.now();
  while (Date.now() - started < bootTimeoutMs) {
    if (exited) throw new Error(`vite exited early (code=${exited.code} signal=${exited.signal}):\n${lines.join('')}`);
    const status = await probe(`${origin}${probePath}`, { timeoutMs: 5000 });
    if (status !== null) {
      return {
        origin,
        port,
        alreadyRunning: false,
        bootMs: Date.now() - started,
        firstProbeStatus: status,
        log: () => lines.join(''),
        stop: async () => {
          child.kill('SIGTERM');
          await new Promise((r) => setTimeout(r, 400));
          if (exited === null) child.kill('SIGKILL');
        },
      };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill('SIGKILL');
  throw new Error(`vite did not answer within ${bootTimeoutMs}ms:\n${lines.join('')}`);
}
