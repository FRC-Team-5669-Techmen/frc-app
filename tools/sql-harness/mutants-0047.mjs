// 0047 permissive mutation proof. Restores from the in-memory original after each mutant.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)
const MIG = path.join(REPO, 'supabase', 'migrations', '0047_core_tour.sql')
const TEST = path.join(
  REPO,
  'supabase',
  'migrations',
  '0047_core_tour_rls_test.sql',
)
const PSQL = process.env.PSQL || 'psql'
const ORIGINAL = readFileSync(MIG, 'utf8')
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0047-'))

function paste(text) {
  const f = path.join(TMP, 'm.sql')
  writeFileSync(f, text)
  execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function runTest() {
  const r = spawnSync(
    PSQL,
    ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST],
    { encoding: 'utf8' },
  )
  const fails = new Set()
  let rows = 0
  for (const line of (r.stdout || '').split('\n')) {
    const c = line.split('\t')
    if (
      c.length >= 4 &&
      /^(PASS|FAIL|SKIP)$/.test(c[2]) &&
      c[1] !== 'summary'
    ) {
      rows += 1
      if (c[2] === 'FAIL') fails.add(Number(c[0]))
    }
  }
  return { fails, rows, errored: r.status !== 0 }
}

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  [
    'other members read completions',
    'and (member_id=(select auth.uid()) or public.is_staff())',
    'and true',
    [4, 5],
  ],
  [
    'inactive reads own completion',
    "exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.status='active')",
    'true',
    [11],
  ],
  [
    'unapproved or inactive writes',
    "if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.status='active'\n   and exists(select 1 from public.member_roles mr where mr.member_id=p.id and mr.role in ('student','parent','mentor','lead','admin')))\n then",
    'if false then',
    [9, 10, 18],
  ],
  [
    'any track claim',
    "if (p_track='mentor' and not staff)\n or (not staff and public.has_role('parent') and p_track<>'parent')\n or (p_track='parent' and (staff or not public.has_role('parent'))) then",
    'if false then',
    [7, 8],
  ],
  [
    'mentor roster open to members',
    "if not public.is_staff() or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.status='active') then",
    'if false then',
    [15, 16, 17],
  ],
  [
    'direct client write grants',
    'grant select on table public.tour_completions to authenticated;',
    'grant all on table public.tour_completions to authenticated;',
    [22],
  ],
  [
    'anon reads',
    'grant select on table public.tour_completions to authenticated;',
    'grant select on table public.tour_completions to authenticated, anon;',
    [23],
  ],
  [
    'anon completes',
    'grant execute on function public.tour_complete_core(text,integer), public.tour_completion_overview(integer) to authenticated;',
    'grant execute on function public.tour_complete_core(text,integer), public.tour_completion_overview(integer) to authenticated, anon;',
    [24, 25],
  ],
  ['staff read removed', 'or public.is_staff())', 'or false)', [29]],
  [
    'service role gets client grants',
    'grant select on table public.tour_completions to authenticated;',
    'grant select on table public.tour_completions to authenticated, service_role;',
    [28],
  ],
  [
    'student parent track claim',
    "or (p_track='parent' and (staff or not public.has_role('parent')))",
    'or false',
    [33],
  ],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(
    `baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`,
  )
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) {
    console.log(`MISSING  ${name}: the find text is not in 0047`)
    continue
  }
  paste(ORIGINAL.replace(find, () => replace))
  const r = runTest()
  const hit = want.every((n) => r.fails.has(n))
  if (hit) caught += 1
  console.log(
    `${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`,
  )
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) {
    console.log(`restore not green after "${name}"`)
    process.exit(1)
  }
}
console.log(`mutants 0047: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
