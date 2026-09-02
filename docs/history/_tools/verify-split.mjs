#!/usr/bin/env node
// The control for the 2026-09-02 split of CLAUDE.md's "Last reviewed" paragraph.
//
// Until that date the whole engineering history of this repo lived on ONE line
// of CLAUDE.md (line 128, 109,839 bytes, ~50 bundles back to 2026-06-18), which
// every session rewrote. It is now one file per bundle under `docs/history/`,
// each carrying `record_order` = its position in that paragraph (1 = the
// newest bundle, which the paragraph opened with).
//
// This script reassembles every `record_order`-carrying file, in order, from
// the bytes that follow each file's front matter, and compares the result
// against the paragraph as it stood the moment before the split. It must be
// byte-identical: the split added front matter and nothing else. Unlike
// idea-app's split there is no `## <title>` heading to synthesize -- the
// paragraph had none, so a body is a raw slice and the titles live only in
// front matter.
//
// The reference is pinned two ways, because either can be unavailable:
//   * `_source/claude-md-log-2026-09-02.txt` -- the frozen copy, committed
//     beside the entries, which gives a real diff on failure.
//   * REFERENCE_SHA256 -- pinned here, so editing the frozen copy itself is
//     caught too. A run that can do neither reports that it verified
//     nothing, and exits 1.
//
// Run: npm run history:verify
//
// Ported in shape from pina-hash/idea-app docs/history/_tools/verify-split.mjs.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEntries, HISTORY_DIR } from './front-matter.mjs';

const SOURCE_PATH = join(HISTORY_DIR, '_source', 'claude-md-log-2026-09-02.txt');
// sha256 of CLAUDE.md line 128 (with its trailing newline) at abf7182, the
// commit this branch was cut from, measured with `sed -n 128p CLAUDE.md | sha256sum`.
const REFERENCE_SHA256 = 'b85db0a6aa3588f5d12b8c85a159ade43b36327f1f8e9c327d6bca9c15e4aa59';
const REFERENCE_BYTES = 109839;
// The frozen file is CLAUDE.md line 128 verbatim, so it opens with the label
// `Last reviewed: `. That label belonged to the LINE, not to any bundle, so the
// split cut it off and it is re-added here. Without it the compare below would
// be off by fifteen characters at byte 0 and would say nothing about the rest.
const LABEL = 'Last reviewed: ';
const REFERENCE_ENTRIES = 50;

const problems = [];
const fail = (msg) => problems.push(msg);

const entries = readEntries();
const record = entries.filter((e) => Number.isInteger(e.record_order));

// --- structural checks the reassembly cannot make on its own ----------------

const seen = new Map();
for (const e of entries) {
  if (seen.has(e.file)) fail(`duplicate filename: ${e.file}`);
  seen.set(e.file, e);
  if (!e.title) fail(`${e.file}: no title in front matter`);
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) fail(`${e.file}: date is missing or not YYYY-MM-DD`);
  if (!e.file.startsWith('record-') && Number.isInteger(e.record_order)) {
    fail(`${e.file}: carries record_order but is not a pre-split archive file. record_order belongs only to the ${REFERENCE_ENTRIES} entries the split produced.`);
  }
  if (e.file.startsWith('record-') && !Number.isInteger(e.record_order)) {
    fail(`${e.file}: uses the reserved record- prefix without a record_order.`);
  }
  if (!e.file.startsWith('record-') && e.body.startsWith('Earlier')) {
    fail(`${e.file}: a post-split entry must not imitate the paragraph's "Earlier ..." chaining; start at the first real sentence.`);
  }
}

record.sort((a, b) => a.record_order - b.record_order);
record.forEach((e, i) => {
  if (e.record_order !== i + 1) fail(`record_order is not 1..N contiguous: expected ${i + 1}, found ${e.record_order} (${e.file})`);
});
if (record.length !== REFERENCE_ENTRIES) {
  fail(`entry count moved: the split produced ${REFERENCE_ENTRIES} archive entries, found ${record.length}`);
}

// --- the reassembly ---------------------------------------------------------

const rebuilt = LABEL + record.map((e) => e.body).join('');
const rebuiltBytes = Buffer.byteLength(rebuilt, 'utf8');
const rebuiltSha = createHash('sha256').update(rebuilt, 'utf8').digest('hex');

console.log(`entries reassembled : ${record.length} (expected ${REFERENCE_ENTRIES})`);
console.log(`reassembled bytes   : ${rebuiltBytes} (expected ${REFERENCE_BYTES})`);
console.log(`reassembled sha256  : ${rebuiltSha}`);
console.log(`reference sha256    : ${REFERENCE_SHA256}`);

let checkedAgainstSource = false;
try {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  checkedAgainstSource = true;
  const sourceSha = createHash('sha256').update(source, 'utf8').digest('hex');
  if (sourceSha !== REFERENCE_SHA256) {
    fail(`the frozen source ${SOURCE_PATH} no longer hashes to the pinned value (${sourceSha}). It is a record of what CLAUDE.md said on 2026-09-02 and must not be edited.`);
  }
  if (source === rebuilt) {
    console.log(`source byte compare : IDENTICAL against _source/claude-md-log-2026-09-02.txt`);
  } else {
    const a = join(tmpdir(), 'history-reference.txt');
    const b = join(tmpdir(), 'history-reassembled.txt');
    writeFileSync(a, source);
    writeFileSync(b, rebuilt);
    // Point at the first differing byte so a one-character drift is found
    // without diffing 110KB by eye.
    let at = 0;
    while (at < source.length && at < rebuilt.length && source[at] === rebuilt[at]) at += 1;
    fail(`reassembly differs from the frozen source at byte ${at} (source: ${JSON.stringify(source.slice(at, at + 60))} / rebuilt: ${JSON.stringify(rebuilt.slice(at, at + 60))}). Wrote ${a} and ${b}; diff them.`);
  }
} catch (err) {
  if (!checkedAgainstSource) {
    console.log(`source byte compare : unavailable (${String(err.message).split('\n')[0]})`);
  }
}

const shaOk = rebuiltSha === REFERENCE_SHA256;
console.log(`sha256 compare      : ${shaOk ? 'IDENTICAL' : 'DIFFERENT'}`);
if (!shaOk) fail('reassembled sha256 does not match the pinned pre-split paragraph.');

if (!checkedAgainstSource && !shaOk) fail('neither reference was reachable: this run verified nothing.');

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\nOK: the split is lossless. Every byte of the pre-split paragraph is present, in order, across ${record.length} entries (${entries.length - record.length} written since).`);
