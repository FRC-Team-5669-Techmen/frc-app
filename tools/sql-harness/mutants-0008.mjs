#!/usr/bin/env node
/**
 * Mutation proof for 0008_event_hub_families_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0005,0006,0007,0008 --tests none \
 *     --node tools/sql-harness/mutants-0008.mjs
 *
 * Each mutant breaks ONE rule 0008 adds, almost always in the PERMISSIVE
 * direction (a refusal dropped, a revoke skipped, a grant handed out, a
 * staff check removed), then runs the test and requires the named check(s)
 * to turn FAIL, then restores the rule from the copy it read before changing
 * it (never from git). A mutant that leaves the test green is a hole in the
 * test, and this script fails. Same mechanics as mutants-0005.mjs: a
 * function mutant reads the live definition with pg_get_functiondef,
 * replaces one fragment (which must occur, or the run aborts), executes it,
 * and restores the original definition afterwards.
 *
 * NOT MUTATED, on purpose: hub_staff_place_pair's closing "clear the car's
 * override" update. _hub_claim already clears the car's override when the
 * second seat needs none, so removing that update changes nothing a test
 * could see; the update states the contract where it is relied on.
 *
 * Prints one line per mutant and `mutants 0008: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0008_event_hub_families_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();

function runTest() {
  const r = spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' });
  const fails = new Set();
  let rows = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const c = line.split('\t');
    if (c.length >= 4 && /^(PASS|FAIL|SKIP)$/.test(c[2]) && c[1] !== 'summary') {
      rows += 1;
      if (c[2] === 'FAIL') fails.add(Number(c[0]));
    }
  }
  return { fails, rows, errored: r.status !== 0, err: (r.stderr || '').trim().split('\n').slice(-1)[0] };
}

const fn = (name, sig, find, replace, expect) => ({ name, kind: 'fn', sig, find, replace, expect });
const SAVE = 'public._hub_save(uuid,uuid,text,jsonb,uuid)';
const RMG = 'public._hub_remove_guardian(uuid,text,uuid)';
const RMF = 'public._hub_remove_family(uuid,uuid)';
const PAIR = 'public.hub_staff_place_pair(uuid,uuid,uuid)';

const MUTANTS = [
  // 1. adults
  fn('adults 31 accepted by the save rule', SAVE,
    'not between 0 and 30 then', 'not between 0 and 31 then', [1]),
  { name: 'the 0..30 column check dropped', kind: 'sql',
    apply: 'alter table public.hub_day_answers drop constraint hub_day_answers_adults_chk',
    restore: 'alter table public.hub_day_answers add constraint hub_day_answers_adults_chk check (adults between 0 and 30)',
    expect: [2] },

  // 2. a parent driving for the team
  fn('the drive flag ignored when deciding whether a car exists', 'public._hub_sync_cars(uuid,uuid)',
    'or coalesce(v_flag, false))', 'or false)', [3]),
  fn('no email to mentors when the own student leaving turns the car red', SAVE,
    '    perform public._hub_alert_if_red(s.id);', '    perform 1;', [6]),
  fn('a car being withdrawn still emails "needs a second rider"', 'public._hub_alert_if_red(uuid)',
    "  if coalesce(current_setting('hub.withdrawing_car', true), '') = p_car::text then return; end if;\n", '', [9]),
  fn('the mentor driver list ignores flag drivers', 'public._hub_overview(uuid)',
    "                    and ('driving' in (a.to_mode, a.home_mode) or coalesce(a.drive_to, false) or coalesce(a.drive_home, false)));",
    "                    and 'driving' in (a.to_mode, a.home_mode));", [10]),
  fn('a left flag car blocks attending again (0005 condition restored)', SAVE,
    "                        and not coalesce(case c.run when 'to' then a.drive_to else a.drive_home end, false)) then",
    '                        ) then', [11]),
  fn('progress ignores the drive flags', 'public._hub_progress(uuid)',
    '    v_needs_car := coalesce(d.drive_to, false) or coalesce(d.drive_home, false);', '    v_needs_car := false;', [12]),
  fn('the family page drops drive_to / drive_home', 'public._hub_family_view(uuid,text)',
    "           'drive_to', a.drive_to, 'drive_home', a.drive_home,\n", '', [13]),

  // 3. the one-child rule always on
  { name: 'the one-child rule may be switched off again', kind: 'sql',
    apply: 'alter table public.hub_events drop constraint hub_events_one_minor_rule_on',
    restore: 'alter table public.hub_events add constraint hub_events_one_minor_rule_on check (one_minor_rule)',
    expect: [14] },

  // 4. mail, links, status
  fn('no per-recipient split: one row, one shared link, for the whole family', 'public._hub_enqueue(uuid,text,text[],text,text,uuid,text)',
    '  if p_link_invite is null or coalesce(cardinality(v_to), 0) <= 1 then', '  if true then', [15]),
  fn('an address sent the email under the old single key is sent it again', 'public._hub_enqueue(uuid,text,text[],text,text,uuid,text)',
    '    continue when p_dedupe is not null and exists (', '    continue when false and exists (', [16]),
  fn('a minted link does not record its recipient', 'public.hub_outbox_mint_link(uuid)',
    '    return public._hub_mint_token_for(o.link_invite_id, o.to_emails[1]);', '    return public._hub_mint_token(o.link_invite_id);', [17, 27]),
  fn('invite status read from the old invite:<id> key', 'public._hub_invite_status(uuid)',
    "   where o.link_invite_id = p_invite\n     and o.kind in ('invite', 'welcome', 'added', 'join_request', 'resend', 'lockin_open')",
    "   where o.dedupe_key = 'invite:' || p_invite", [19, 20]),

  // 4. guardians
  fn('hub_add_parent drops the name', 'public.hub_add_parent(text,text,text)',
    '  if v_name is not null then\n    update public.hub_invites', '  if false then\n    update public.hub_invites', [21]),
  fn('hub_join does not record the joining parent\'s name', 'public.hub_join(uuid,uuid,text,text,boolean)',
    '  update public.hub_invites set guardian_names = guardian_names || jsonb_build_object(v_email, v_name)\n   where id = v_invite;\n',
    '', [22]),
  fn('the fetched page carries no me / guardians', 'public.hub_family_call(text,text,jsonb)',
    "      return public._hub_family_view(v_invite, 'family') || public._hub_family_extras(v_invite, p_token);",
    "      return public._hub_family_view(v_invite, 'family');", [22]),
  fn('a removed guardian keeps their links', RMG,
    '  update public.hub_invite_tokens set revoked_at = now()\n   where invite_id = p_invite and email = v_email and revoked_at is null;',
    '  perform 1;', [24, 25]),
  fn('removing one guardian revokes every link of the family', RMG,
    '   where invite_id = p_invite and email = v_email and revoked_at is null;',
    '   where invite_id = p_invite and revoked_at is null;', [24]),
  fn('mail queued to a removed guardian still goes out', RMG,
    "  update public.hub_outbox set status = 'skipped', last_error = 'guardian removed'\n   where link_invite_id = p_invite and status in ('pending', 'failed') and to_emails = array[v_email];",
    '  perform 1;', [25]),
  fn('a removed guardian stays the family contact email', RMG,
    '     set parent_email = null, updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)',
    '     set updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)', [25]),
  fn('the family may remove its last guardian', RMG,
    '  if p_staff is null and cardinality(i.emails) = 1 then', '  if false then', [26]),
  fn('anyone signed in may remove a guardian through the staff entry point', 'public.hub_staff_remove_guardian(uuid,text)',
    '  if not public.is_staff() then', '  if false then', [27]),

  // 5. removing a family
  fn('a family may remove itself after the event', RMF,
    '    if now() >= public._hub_event_end(e.id) then', '    if false then', [28]),
  fn('a family may remove itself after a car it is in has left', RMF,
    '    if exists (select 1 from public.hub_seats st join public.hub_cars ca on ca.id = st.car_id',
    '    if false and exists (select 1 from public.hub_seats st join public.hub_cars ca on ca.id = st.car_id', [29]),
  fn('the family\'s seats vanish without the driver being told', RMF,
    "    perform public._hub_drop_seat(s.car_id, p_invite, 'rider');", '    perform 1;', [30]),
  fn('mentors are not told a family was removed', RMF,
    "  perform public._hub_enqueue(e.id, 'family_removed', public._hub_mentor_emails(e.id),",
    "  perform public._hub_enqueue(e.id, 'family_removed', '{}'::text[],", [30, 33]),
  fn('the invite is kept after removal', RMF,
    "  delete from public.hub_invites where id = p_invite;\n  return jsonb_build_object('ok', true, 'student', v_student);",
    "  return jsonb_build_object('ok', true, 'student', v_student);", [31, 32]),
  fn('anyone signed in may remove a family through the staff entry point', 'public.hub_staff_remove_family(uuid)',
    '  if not public.is_staff() then', '  if false then', [33]),
  { name: 'anon may call hub_staff_remove_family', kind: 'sql',
    apply: 'grant execute on function public.hub_staff_remove_family(uuid) to anon',
    restore: 'revoke execute on function public.hub_staff_remove_family(uuid) from anon',
    expect: [33, 35] },
  { name: 'anon may call hub_staff_remove_guardian', kind: 'sql',
    apply: 'grant execute on function public.hub_staff_remove_guardian(uuid, text) to anon',
    restore: 'revoke execute on function public.hub_staff_remove_guardian(uuid, text) from anon',
    expect: [27, 35] },
  { name: 'an internal helper executable by anon', kind: 'sql',
    apply: 'grant execute on function public._hub_remove_family(uuid, uuid) to anon',
    restore: 'revoke execute on function public._hub_remove_family(uuid, uuid) from anon',
    expect: [35] },

  // 6. mentors seat two at once
  fn('the first seat goes in without the temporary override', PAIR,
    "'pair placement'", 'null', [36]),
  fn('anyone signed in may place a pair', PAIR,
    '  if not public.is_staff() then', '  if false then', [38]),
  { name: 'anon may call hub_staff_place_pair', kind: 'sql',
    apply: 'grant execute on function public.hub_staff_place_pair(uuid, uuid, uuid) to anon',
    restore: 'revoke execute on function public.hub_staff_place_pair(uuid, uuid, uuid) from anon',
    expect: [38, 35] },
  fn('the same student may be placed twice', PAIR,
    '  if p_first is null or p_second is null or p_first = p_second then', '  if p_first is null or p_second is null then', [39]),
  fn('a pair may be placed into a car that already has a rider', PAIR,
    '  if exists (select 1 from public.hub_seats s where s.car_id = p_car) then', '  if false then', [41]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0008: baseline is not green, nothing to measure');
  process.exit(1);
}

let caught = 0;
for (const m of MUTANTS) {
  let restore;
  if (m.kind === 'sql') {
    sql(m.apply);
    restore = () => sql(m.restore);
  } else {
    const def = sql(`select pg_get_functiondef('${m.sig}'::regprocedure)`);
    if (!def.includes(m.find)) {
      console.log(`ABORT mutant "${m.name}": fragment not found in ${m.sig}`);
      process.exit(1);
    }
    const write = (text) => { execFileSync(PSQL, [...base, '-f', '-'], { input: text + '\n;', encoding: 'utf8' }); };
    write(def.replace(m.find, m.replace));
    restore = () => write(def);
  }
  const r = runTest();
  restore();
  const hit = m.expect.filter((n) => r.fails.has(n));
  const ok = hit.length === m.expect.length;
  if (ok) caught += 1;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'} ${m.name} -- FAIL rows: ${[...r.fails].sort((a, b) => a - b).join(', ') || 'none'}; want ${m.expect.join(', ')}${r.errored ? ` (errored: ${r.err})` : ''}`);
}

const after = runTest();
console.log(`after restoring every mutant: ${after.rows} rows, ${after.fails.size} FAIL`);
const allGood = caught === MUTANTS.length && after.fails.size === 0 && !after.errored && after.rows === baseline.rows;
console.log(`mutants 0008: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
