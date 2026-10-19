#!/usr/bin/env node
// Paragraph coverage for a CLAUDE.md split: proves every paragraph of an OLD CLAUDE.md
// still exists, verbatim, in the new CLAUDE.md, in docs/subsystems/, or in a file named
// with --also. Written 2026-10-19 for the splits that moved paragraphs out of
// CLAUDE.md: frc-app docs/history/claude-md-split-frc.md and fll-app
// docs/history/claude-md-split-fll.md.
//
//   node tools/claude-md-coverage.mjs --old <rev>:CLAUDE.md [--also <file>]...
//   node tools/claude-md-coverage.mjs --old /path/to/old-CLAUDE.md [--also <file>]...
//
// A "paragraph" (unit) is: one bullet or numbered item with its continuation lines, one
// table row, one heading, one line inside a code block, or a run of other non-blank
// lines. Each unit must appear as an exact substring of the corpus. Exit 0 only when
// every unit is found.
//
// Positive control, run every time: a unit with a sentinel appended must NOT be found,
// and every unit from the old file must be found in the old file itself. Without those,
// a matcher that always says yes (or always no) would pass.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
let oldSpec = null;
const also = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--old') oldSpec = args[++i];
  else if (args[i] === '--also') also.push(args[++i]);
}
if (!oldSpec) {
  console.error('usage: --old <rev>:CLAUDE.md | <file> [--also <file>]...');
  process.exit(2);
}

const oldText = existsSync(oldSpec)
  ? readFileSync(oldSpec, 'utf8')
  : execFileSync('git', ['show', oldSpec], { encoding: 'utf8', maxBuffer: 64 << 20 });

function units(text) {
  const out = [];
  let para = [];
  let inCode = false;
  const flush = () => { if (para.length) out.push(para.join('\n')); para = []; };
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) { flush(); out.push(line); inCode = !inCode; continue; }
    if (inCode) { if (line.trim()) out.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^(#|\|)/.test(line)) { flush(); out.push(line); continue; }
    // A list item starts a unit; its indented continuation lines join it.
    if (/^\s*([-*]|\d+\.) /.test(line)) flush();
    para.push(line);
  }
  flush();
  return out;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []);
}

const files = ['CLAUDE.md', ...walk('docs/subsystems'), ...also];
const corpus = files.map((f) => readFileSync(f, 'utf8')).join('\n\u0000\n');

const all = units(oldText);
// Positive controls.
const selfMiss = all.filter((u) => !oldText.includes(u));
if (selfMiss.length) { console.error(`control failed: ${selfMiss.length} units not found in their own source`); process.exit(1); }
const sentinel = all.find((u) => u.length > 40) + ' COVERAGE-SENTINEL-NOT-PRESENT';
if (corpus.includes(sentinel)) { console.error('control failed: the sentinel unit was found'); process.exit(1); }

const missing = all.filter((u) => !corpus.includes(u));
const words = (s) => s.split(/\s+/).filter(Boolean).length;
console.log(`searched: ${files.length} files`);
console.log(`old CLAUDE.md: ${words(oldText)} words, new CLAUDE.md: ${words(readFileSync('CLAUDE.md', 'utf8'))} words`);
for (const u of missing) console.log(`MISSING: ${u.slice(0, 160).replace(/\n/g, ' ')}`);
console.log(`paragraph coverage: ${all.length - missing.length}/${all.length} units found verbatim`);
process.exit(missing.length ? 1 : 0);
