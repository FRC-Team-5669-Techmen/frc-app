// Shared reader for `docs/history/` entry files.
//
// Every file in `docs/history/` is one entry: a small YAML front-matter block
// between `---` fences, then a blank line, then the entry body verbatim. For
// the 50 `record-` files the 2026-09-02 split produced, the body is a byte-exact
// slice of the old `CLAUDE.md` "Last reviewed" paragraph (frozen at
// `_source/claude-md-log-2026-09-02.txt`), so those bodies carry no heading of
// their own and start mid-sentence with the word "Earlier" -- that is the
// original text, not a defect. Entries written after the split start at their
// first real sentence and may use `##` headings inside the body.
//
// Ported from pina-hash/idea-app docs/history/_tools/front-matter.mjs. The
// parser is deliberately tiny and handles only the shapes this directory uses
// (scalars, quoted flow lists, and one block list). It is not a YAML
// implementation and must not become one -- if an entry needs a shape this
// cannot read, the entry is wrong, not the parser.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HISTORY_DIR = new URL('../', import.meta.url).pathname;

const FENCE = '---';

function unquote(raw) {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return s;
}

function flowList(raw) {
  const s = raw.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return [];
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === '"' && inner[i - 1] !== '\\') quoted = !quoted;
    if (c === ',' && !quoted) {
      out.push(unquote(cur));
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(unquote(cur));
  return out.filter((x) => x.length > 0);
}

/** Split one entry file into { meta, body }. `body` is byte-exact. */
export function parseEntry(text, file) {
  const lines = text.split('\n');
  if (lines[0] !== FENCE) throw new Error(`${file}: does not open with a --- front-matter fence`);
  const close = lines.indexOf(FENCE, 1);
  if (close < 0) throw new Error(`${file}: front matter is never closed`);
  if (lines[close + 1] !== '') throw new Error(`${file}: front matter must be followed by exactly one blank line`);

  const meta = { file, subsystems: [], migrations: [], branches: [], commits: [] };
  let blockKey = null;
  for (const line of lines.slice(1, close)) {
    const block = /^ {2}- (.*)$/.exec(line);
    if (block && blockKey) {
      meta[blockKey].push(unquote(block[1]));
      continue;
    }
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${file}: front-matter line not understood: ${line}`);
    const [, key, rest] = m;
    if (rest === '') {
      blockKey = key;
      meta[key] = [];
      continue;
    }
    blockKey = null;
    if (rest.trim().startsWith('[')) meta[key] = flowList(rest);
    else if (key === 'record_order') meta[key] = Number(rest.trim());
    else meta[key] = unquote(rest);
  }

  // The body is everything after the fence and the single blank line, verbatim.
  const consumed = lines.slice(0, close + 2).reduce((n, l) => n + l.length + 1, 0);
  const body = text.slice(consumed);
  return { meta, body };
}

/** Read every entry file. Tooling (`_tools/`) and the frozen source (`_source/`) are skipped. */
export function readEntries(dir = HISTORY_DIR) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md') && !d.name.startsWith('_') && d.name !== 'README.md')
    .map((d) => d.name)
    .sort();
  return files.map((name) => {
    const text = readFileSync(join(dir, name), 'utf8');
    const { meta, body } = parseEntry(text, name);
    return { ...meta, body };
  });
}
