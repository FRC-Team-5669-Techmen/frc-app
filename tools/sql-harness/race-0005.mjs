#!/usr/bin/env node
/**
 * The last-seat race, with two real sessions (0005_event_family_hub).
 *
 * Run by tools/sql-harness/run.mjs --node, which hands it a live server in
 * PGHOST/PGPORT/PGDATABASE and the psql binary in PSQL. An SQL test cannot do
 * this: it is one transaction in one session, and a race needs two.
 *
 * Setup (committed, in a schema of its own so nothing else sees it): one
 * event, one day, one car with ONE seat, two families coming that day, each
 * with a token. The one-minor rule is switched off for this event so the
 * only rule in play is capacity.
 *
 * Two shapes, both through hub_family_call as service_role, exactly as the
 * event-family Edge Function calls it:
 *   overlap   session 1 claims and HOLDS its transaction open for 1.5 s;
 *             session 2 claims 0.3 s later. Session 2 must wait on the car
 *             row's lock, then count session 1's seat and be refused.
 *   together  both start at the same instant, 25 times over. Every time,
 *             exactly one wins.
 * Each trial ends by counting the car's seats: never more than one.
 *
 * Prints PASS/FAIL lines and `race 0005: N/N passed`. Exits 1 on any FAIL.
 * The mutation proof: drop FOR UPDATE from the car lookup at the top of
 * public._hub_claim (run.mjs --mutate, find/replace on that one statement)
 * and both shapes must FAIL. Measured 2026-10-04: 0/2, with two seats in the
 * one-seat car in all 25 simultaneous pairs and in the overlap.
 */
import { spawn, execFileSync } from 'node:child_process';

const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();

function session(script) {
  return new Promise((resolve) => {
    const p = spawn(PSQL, [...base, '-v', 'ON_ERROR_STOP=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => resolve({ out: out.trim(), err: err.trim() }));
    p.stdin.end(script);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} race 0005 · ${label} -- ${detail}`);
};

// ── setup ───────────────────────────────────────────────────────────────────
const setup = sql(`
  with ev as (
    insert into public.hub_events (title, one_minor_rule) values ('race-0005', false) returning id),
  d as (
    insert into public.hub_days (event_id, day_date, venue_closes_at)
    select id, current_date + 30, now() + interval '30 days' from ev returning id, event_id),
  students as (
    select p.id, row_number() over (order by p.id) as k from public.profiles p
     where not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor','lead','admin'))
     limit 2),
  inv as (
    insert into public.hub_invites (event_id, student_id)
    select d.event_id, s.id from d, students s returning id, student_id),
  ans as (
    insert into public.hub_day_answers (invite_id, day_id, attending)
    select inv.id, d.id, 'yes' from inv, d returning invite_id),
  car as (
    insert into public.hub_cars (event_id, day_id, run, driver_label, seats, description)
    select d.event_id, d.id, 'to', 'Race driver', 1, 'one-seat coupe' from d returning id)
  select (select id from car) || ' ' || string_agg(inv.id::text, ' ' order by inv.student_id) from inv`);
const [car, invA, invB] = setup.split(' ');
const tokA = sql(`select public._hub_mint_token('${invA}')`);
const tokB = sql(`select public._hub_mint_token('${invB}')`);

const claim = (tok, holdMs = 0) => `
  begin;
  set local role service_role;
  select coalesce(
    (select 'won' from (select public.hub_family_call('${tok}', 'claim_seat', '{"car_id":"${car}"}'::jsonb)) x),
    'none');
  ${holdMs ? `select pg_sleep(${holdMs / 1000});` : ''}
  commit;`;
const seats = () => Number(sql(`select count(*) from public.hub_seats where car_id = '${car}'`));
const reset = () => sql(`delete from public.hub_seats where car_id = '${car}'`);
const outcome = (r) => (r.out.includes('won') ? 'won' : (r.err.match(/hub:[a-z_]+/) || [r.err.split('\n')[0] || 'nothing'])[0]);

// ── overlap: session 2 must wait on the lock and be refused ────────────────
{
  reset();
  const t0 = Date.now();
  const s1 = session(claim(tokA, 1500));
  await wait(300);
  const t2 = Date.now();
  const s2 = session(claim(tokB));
  const [r1, r2] = await Promise.all([s1, s2]);
  const waited = Date.now() - t2;
  const n = seats();
  check('overlap: the first claim wins, the second waits for it and is refused "car_full"',
    outcome(r1) === 'won' && outcome(r2) === 'hub:car_full' && n === 1 && waited >= 900,
    `first ${outcome(r1)}, second ${outcome(r2)} after waiting ${waited} ms; seats in the one-seat car: ${n}`);
  if (r2.err && !r2.err.includes('hub:car_full')) console.log(`  second session said: ${r2.err.split('\n')[0]}`);
  void t0;
}

// ── together: 25 simultaneous pairs ─────────────────────────────────────────
{
  let wins = 0; let full = 0; let over = 0; let other = 0;
  for (let i = 0; i < 25; i += 1) {
    reset();
    const [r1, r2] = await Promise.all([session(claim(tokA)), session(claim(tokB))]);
    const o = [outcome(r1), outcome(r2)];
    const n = seats();
    if (n > 1) over += 1;
    if (o.filter((x) => x === 'won').length === 1 && o.includes('hub:car_full') && n === 1) wins += 1;
    else if (n <= 1) full += 1; else other += 1;
  }
  check('together: 25 simultaneous pairs, exactly one winner and one "car_full" every time, never two seats',
    wins === 25 && over === 0, `${wins}/25 clean; ${over} over capacity; ${full + other} other`);
}

// ── clean up (the race event is the only thing it made) ────────────────────
sql(`delete from public.hub_events where title = 'race-0005'`);

const passed = results.filter(Boolean).length;
console.log(`race 0005: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
