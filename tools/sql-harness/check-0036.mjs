#!/usr/bin/env node
/**
 * Proof for 0036_role_board_my_shifts.sql (ledger 0029), run against the
 * harness's live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/check-0036.mjs
 *
 * 0036 changes no grant and no policy, so it has no _rls_test.sql sibling
 * (supabase/migrations/README.md rule 3). It changes one function body, and
 * this proves it, each claim with its opposite on the same fixture:
 *
 *   1. A board with unfilled boxes is listed for every member (as before).
 *   2. Once every box is filled, it is listed for a member who holds an
 *      assigned slot, and NOT for a member who holds none (or only a backup).
 *   3. next_shift_at is that member's earliest assigned slot not yet over,
 *      and skips a slot that has ended.
 *   4. anon still cannot call it (the restated grants changed nothing).
 *
 * Every write runs inside begin ... rollback. Prints PASS/FAIL lines and
 * `check 0036: N/N passed`; exits 1 on any failure.
 */
import { execFileSync, spawnSync } from 'node:child_process';

const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();
const as = (uid) => `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '${uid}', true);\nset local role authenticated;\n`;

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total += 1; if (ok) pass += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`) };

const EV = '36000000-0000-4000-9000-000000000001';
const HOLDER = '36000000-0000-4000-8000-000000000001', BACKUP = '36000000-0000-4000-8000-000000000002', NONE = '36000000-0000-4000-8000-000000000003';
const S_PAST = '36000000-0000-4000-a000-000000000001', S_NEXT = '36000000-0000-4000-a000-000000000002', S_LATER = '36000000-0000-4000-a000-000000000003';

const setup = `
insert into auth.users (id, email) values ('${HOLDER}', 'c36.1@boscotech.edu'), ('${BACKUP}', 'c36.2@boscotech.edu'), ('${NONE}', 'c36.3@boscotech.edu') on conflict do nothing;
insert into public.profiles (id) values ('${HOLDER}'), ('${BACKUP}'), ('${NONE}') on conflict do nothing;
update public.profiles set approved = true, status = 'active', full_name = 'Check ' || id::text where id::text like '36000000-%';
insert into public.member_roles (member_id, role) select id, 'student' from public.profiles where id::text like '36000000-%' on conflict do nothing;
insert into public.events (id, title, kind, starts_at, ends_at) values ('${EV}', 'check 0036', 'competition', now() - interval '3 hours', now() + interval '2 days');
insert into public.role_slots (id, event_id, day, label, starts_at, ends_at, needs) values
 ('${S_PAST}', '${EV}', current_date, 'Earlier', now() - interval '3 hours', now() - interval '2 hours', '{"scout":1}'),
 ('${S_NEXT}', '${EV}', current_date, 'Next', now() + interval '1 hour', now() + interval '2 hours', '{"scout":1}'),
 ('${S_LATER}', '${EV}', current_date, 'Later', now() + interval '3 hours', null, '{"scout":1}');
insert into public.role_requests (slot_id, member_id, role, status) values
 ('${S_PAST}', '${HOLDER}', 'scout', 'assigned'), ('${S_NEXT}', '${HOLDER}', 'scout', 'assigned'), ('${S_LATER}', '${BACKUP}', 'scout', 'backup');
`;
// One transaction: setup, then reads as each member, then rollback.
function probe(extra, who) {
  const script = `begin;\n${setup}\n${extra}\n${as(who)}select coalesce((select e->>'next_shift_at' from jsonb_array_elements(public.role_board_open_events()) e where e->>'event_id' = '${EV}'), case when exists (select 1 from jsonb_array_elements(public.role_board_open_events()) e where e->>'event_id' = '${EV}') then 'listed-no-next' else 'absent' end);\nrollback;\n`;
  const r = spawnSync(PSQL, [...base], { input: script, encoding: 'utf8' });
  if (r.status !== 0) return `ERROR ${r.stderr.trim().split('\n').pop()}`;
  return r.stdout.trim().split('\n').pop();
}

// 1. Later is unfilled (only a backup): listed for everyone.
const holder1 = probe('', HOLDER), none1 = probe('', NONE);
check('unfilled board listed for a member holding a slot', holder1 !== 'absent', holder1);
check('unfilled board listed for a member holding none', none1 !== 'absent', none1);

// 2. Fill Later with someone else: every box covered.
const fill = `insert into auth.users (id, email) values ('36000000-0000-4000-8000-000000000009', 'c36.9@boscotech.edu') on conflict do nothing;
insert into public.profiles (id, approved, status) values ('36000000-0000-4000-8000-000000000009', true, 'active') on conflict do nothing;
insert into public.role_requests (slot_id, member_id, role, status) values ('${S_LATER}', '36000000-0000-4000-8000-000000000009', 'scout', 'assigned');`;
const holder2 = probe(fill, HOLDER), backup2 = probe(fill, BACKUP), none2 = probe(fill, NONE);
check('full board still listed for a member with an assigned slot', holder2 !== 'absent', holder2);
check('full board NOT listed for a member with only a backup', backup2 === 'absent', backup2);
check('full board NOT listed for a member with nothing', none2 === 'absent', none2);

// 3. next_shift_at: the Next slot, not the one that has ended.
const nextAt = sql(`select to_char(now() + interval '1 hour', 'YYYY-MM-DD"T"HH24')`);
check('next_shift_at is the earliest assigned slot not yet over', String(holder2).replace(' ', 'T').startsWith(nextAt), `${holder2} vs ${nextAt}`);
const pastAt = sql(`select to_char(now() - interval '3 hours', 'YYYY-MM-DD"T"HH24')`)
check('next_shift_at skips the slot that ended', !String(holder2).replace(' ', 'T').startsWith(pastAt), `${holder2} vs ended ${pastAt}`);

// 4. anon cannot call it; authenticated can.
const anon = spawnSync(PSQL, [...base], { input: `begin; set local role anon; select public.role_board_open_events(); rollback;`, encoding: 'utf8' });
check('anon is refused', anon.status !== 0 && /permission denied/.test(anon.stderr), anon.stderr.trim().split('\n').pop());
const authd = spawnSync(PSQL, [...base], { input: `begin; ${as(HOLDER)} select public.role_board_open_events() is not null; rollback;`, encoding: 'utf8' });
check('authenticated may call it (positive control)', authd.status === 0 && authd.stdout.trim().endsWith('t'), authd.stderr.trim());

console.log(`check 0036: ${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
