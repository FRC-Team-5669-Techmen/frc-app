-- ============================================================
-- 0005_event_family_hub -- a per-event FAMILY HUB for offsite competitions:
-- a two-phase family form (sign-up, then lock-in), a carpool board, a food
-- board, an Event info tab, and a mentor command page. Generic: the next
-- offsite event is entered as data. Beach Blitz 2026 is seeded by 0006.
--
-- APPLY: by hand, once, in the Supabase SQL editor, BEFORE the pages can use
-- it. Re-runnable: a second paste changes nothing. Then 0006 (the Beach Blitz
-- seed), then 0005_event_family_hub_rls_test.sql (rollback-safe) and read its
-- result grid; every row should say PASS.
--
-- WHO USES IT, AND HOW EACH REACHES THE DATA
--   * FAMILIES have NO account (Gmail and other non-school email; the app's
--     sign-in auto-approves only boscotech.edu / boscotech.net). Each student
--     gets ONE invite per event; its emailed link, /e/<token>, is the family's
--     only credential. The page never touches a table: every read and write
--     goes through the event-family Edge Function (verify_jwt = false, a
--     capability URL like parent-response), which runs as the service role
--     and calls ONE function here, public.hub_family_call(token, action,
--     args). That function resolves the token and applies every rule.
--   * STUDENTS (signed in) read the boards through public.hub_member_board(),
--     the same sanitized board a family sees. Students never write.
--   * STAFF (is_staff()) read and write everything: setup tables directly
--     (RLS is_staff()), family answers and car moves through
--     public.hub_staff_call(), which runs THE SAME rule functions as a family.
--   * Parent-role accounts get no special path; they use their link.
--
-- EVERY RULE LIVES HERE, in SECURITY DEFINER functions with a pinned
-- search_path: seat capacity, the one-minor rule, consent-gated visibility,
-- edit windows, phase completeness. The Edge Function only forwards; the
-- client only renders. Nothing is implemented twice in production code. (The
-- fixture model in src/dev/fixture/features/eventhub.js is a test-only port
-- of these functions, so fixture mode can drive the pages without a
-- database; it says so at its top.)
--
-- TOKENS. 128 random bits (pgcrypto gen_random_bytes, schema "extensions",
-- the Supabase default), base64url, 22 characters. ONLY the SHA-256 hash is
-- stored (public.hub_invite_tokens), so a read of any table yields no working
-- link. An invite may carry several live tokens: every email that carries a
-- link mints a fresh one at send time (a hash cannot be turned back into the
-- link it came from), and a token is never revoked by a later email, so the
-- second parent's copy keeps working. Staff can revoke every token of one
-- invite ("reset_links").
--
-- PRIVACY AND RETENTION
--   * A pickup spot is stored ONLY with a consent timestamp (CHECK), and is
--     visible only to staff, to the family that asked, to drivers who offered
--     pickups that day while the request is open, and to the ONE accepting
--     driver after.
--   * A driver's phone is visible only to families with a seat in that car,
--     only while the driver's consent timestamp is set. A rider family's phone
--     is visible to their driver only with that family's own consent.
--   * Allergy NAMES are staff-only. Families see per-meal counts by allergen
--     and their own entry.
--   * 14 days after an event ends, hub_retention_sweep() (daily pg_cron, pure
--     SQL, no secret) clears every pickup spot and both phone consents.
--
-- EDIT WINDOWS (families; staff are not windowed except where a rule says)
--   * a day's answers: until that day's venue close;
--   * a seat, and a car offer: until that car is marked Left for that run;
--   * a food claim: until its meal starts;
--   * everything: read-only once the event ends (the last day's venue close).
--   The phase deadlines lock NOTHING: "continuing or editing must never be
--   annoying, through every deadline". They only drive reminders and status.
--
-- THE ONE-MINOR RULE (Archdiocese of LA handbook 12.3.2; per-event switch,
-- ON by default). Read as: no car run may hold an adult and exactly one minor
-- who is not the adult's own child -- i.e. a car whose driver's own student
-- is NOT aboard that run must carry zero, or two or more, other students. A
-- claim or pickup acceptance that would create that state is refused with the
-- reason. A rider LEAVING into it is allowed, but the car turns red ("Needs a
-- second rider"), mentors are emailed, and it cannot be marked Left until it
-- is fixed or a staff override is recorded with a reason. A home-pickup leg
-- counts on its own: a driver without their own student aboard cannot accept
-- a single pickup.
--
-- EMAIL. Rules decide WHO is emailed and WHAT it says; they write rows to
-- public.hub_outbox. The Edge Function sends them over the existing Gmail
-- SMTP secrets (GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM, APP_URL) after
-- every family action and on an hourly pg_cron tick (shared secret in an
-- x-cron-secret header, the discord_calendar.sql pattern, its own private
-- config row so filling it in activates nothing else). A link is minted at
-- SEND time by hub_outbox_mint_link(), so no raw token is ever stored.
--
-- WHY IT DOES NOT HANG OFF public.events. A schedule row is one time window,
-- staff-written, and fanned out to Discord, push, the calendar feed and the
-- week-ahead post, none of which knows a hub field; staff cancel an event by
-- DELETING its row. A hub carries several days with their own meet times,
-- runs, meals and an anonymous-family access model, and must outlive a
-- deleted calendar row. So it is its own table, and seeding it (0006) posts
-- nothing anywhere.
--
-- WHAT UNDOES IT. Nothing deployed before this file reads these objects, so
-- dropping them returns production to its prior state (every family answer
-- and car is lost with them):
--   select cron.unschedule('event-hub-tick') where exists (select 1 from cron.job where jobname = 'event-hub-tick');
--   select cron.unschedule('event-hub-retention') where exists (select 1 from cron.job where jobname = 'event-hub-retention');
--   drop function if exists ... (every public.hub_* and public._hub_* function);
--   drop table if exists public.hub_outbox, public.hub_resend_log,
--     public.hub_food_claims, public.hub_pickups, public.hub_seats,
--     public.hub_cars, public.hub_day_answers, public.hub_responses,
--     public.hub_invite_tokens, public.hub_invites, public.hub_food_needs,
--     public.hub_meals, public.hub_days, public.hub_events;
--   drop table if exists private.event_hub_config;
-- pgcrypto is deliberately not dropped: Supabase ships it.
--
-- ASSUMES: public.profiles (approved, status, full_name, nickname),
-- public.member_roles, public.is_staff() (skills_catalog.sql),
-- public.has_role(text) (platform_migration.sql), public.seasons,
-- public.member_applications (parent_email, parent_two_contact), auth.users,
-- pgcrypto in schema "extensions", pg_cron and pg_net (push_notifications.sql).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- First, before anything is created: say what is missing in words, not as a
-- raw "relation does not exist" halfway down the file.
do $assumes$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.member_roles') is null
     or to_regclass('public.member_applications') is null or to_regclass('public.seasons') is null
     or to_regprocedure('public.is_staff()') is null or to_regprocedure('public.has_role(text)') is null then
    raise exception 'Cannot apply 0005: profiles, member_roles, member_applications, seasons, is_staff() and has_role(text) must exist first';
  end if;
  if to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'Cannot apply 0005: pgcrypto is not in schema "extensions" (extensions.gen_random_bytes is missing)';
  end if;
end
$assumes$;

-- ── 1. Setup: events, days, meals, food needs ───────────────────────────────

create table if not exists public.hub_events (
  id                        uuid        primary key default gen_random_uuid(),
  title                     text        not null check (length(btrim(title)) between 1 and 120),
  venue_name                text,
  venue_address             text,
  map_url                   text,
  timezone                  text        not null default 'America/Los_Angeles',
  phase1_due_at             timestamptz,
  lockin_opens_at           timestamptz,
  lockin_due_at             timestamptz,
  one_minor_rule            boolean     not null default true,
  driver_paperwork_required boolean     not null default false,
  -- Resource links by key (site, agenda, halloween, rules, awards, shirt,
  -- store, volunteer, stream, hotel, first_registration, school_form,
  -- medication_form, team_list, parent_channel). A blank key is "not set".
  links                     jsonb       not null default '{}'::jsonb
                              check (jsonb_typeof(links) = 'object'),
  -- The Event info tab: { "sections": [ { "key", "title", "lines": [text] } ] }.
  -- A line "label | value" renders as a row; a value that is a URL is a link.
  info                      jsonb       not null default '{}'::jsonb
                              check (jsonb_typeof(info) = 'object'),
  -- Who gets the "a seat or food item was dropped" / red-car mail. Empty:
  -- every admin's sign-in email.
  alert_emails              text[]      not null default '{}',
  created_by                uuid        references public.profiles(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table if not exists public.hub_days (
  id                 uuid        primary key default gen_random_uuid(),
  event_id           uuid        not null references public.hub_events(id) on delete cascade,
  day_date           date        not null,
  -- The order of the sign-up form's Days step (boards run in date order).
  position           int         not null default 0,
  title              text        not null default '',
  -- A short card shown BEFORE the attendance question (Friday's evening note).
  intro              text,
  meet_at            timestamptz,
  meet_place         text,
  last_car_out_at    timestamptz,
  captain_id         uuid        references public.profiles(id) on delete set null,
  target_arrival_at  timestamptz,
  doors_at           timestamptz,
  venue_opens_at     timestamptz,
  venue_closes_at    timestamptz not null,
  pits_close_at      timestamptz,
  drive_to_range     text,
  drive_home_range   text,
  miles_to           numeric(6,1),
  miles_home         numeric(6,1),
  ask_pit_setup      boolean     not null default false,
  -- "Getting to Bosco Tech" (ride from home) is asked on this day.
  ask_school_ride    boolean     not null default true,
  -- [{ "key", "label", "default": bool }] -- Friday's two ride-home choices.
  home_options       jsonb       not null default '[]'::jsonb
                       check (jsonb_typeof(home_options) = 'array'),
  notes              text,
  constraint hub_days_event_date_uniq unique (event_id, day_date)
);

create table if not exists public.hub_meals (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.hub_events(id) on delete cascade,
  day_id      uuid        not null references public.hub_days(id) on delete cascade,
  label       text        not null check (length(btrim(label)) between 1 and 80),
  starts_at   timestamptz not null,
  truck_note  text,
  position    int         not null default 0
);

create table if not exists public.hub_food_needs (
  id        uuid primary key default gen_random_uuid(),
  meal_id   uuid not null references public.hub_meals(id) on delete cascade,
  label     text not null check (length(btrim(label)) between 1 and 120),
  quantity  int  not null default 1 check (quantity between 1 and 99),
  -- "starter, review before sending": seeded guesses a mentor should check.
  starter   boolean not null default false,
  position  int  not null default 0
);

-- ── 2. Invites and their tokens ─────────────────────────────────────────────

create table if not exists public.hub_invites (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.hub_events(id) on delete cascade,
  student_id  uuid        not null references public.profiles(id) on delete cascade,
  -- Lowercased. The current-season application's parent_email, plus
  -- parent_two_contact when that free-text field holds an email. Staff edit.
  emails      text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  constraint hub_invites_event_student_uniq unique (event_id, student_id)
);

create table if not exists public.hub_invite_tokens (
  token_hash  bytea       primary key check (octet_length(token_hash) = 32),
  invite_id   uuid        not null references public.hub_invites(id) on delete cascade,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists hub_invite_tokens_invite_idx on public.hub_invite_tokens (invite_id);

-- ── 3. Family answers ───────────────────────────────────────────────────────

create table if not exists public.hub_responses (
  invite_id                uuid        primary key references public.hub_invites(id) on delete cascade,
  -- The nights (by the date of the evening) the family stays near the venue.
  -- null = not answered; '{}' = "No, driving each day".
  staying_nights           date[],
  allergies_none           boolean,
  allergens                text[]      not null default '{}'
                             check (allergens <@ array['peanut','tree_nut','milk','egg','wheat','soy','fish','shellfish','sesame']::text[]),
  allergy_other            text        check (allergy_other is null or length(allergy_other) <= 300),
  dietary                  text        check (dietary is null or length(dietary) <= 300),
  medication               boolean,
  parent_name              text        check (parent_name is null or length(parent_name) <= 120),
  parent_phone             text        check (parent_phone is null or length(parent_phone) <= 40),
  parent_email             text        check (parent_email is null or length(parent_email) <= 200),
  emergency_name           text        check (emergency_name is null or length(emergency_name) <= 120),
  emergency_phone          text        check (emergency_phone is null or length(emergency_phone) <= 40),
  first_reg_done           boolean,
  school_form_done         boolean,
  -- Consents are timestamps: when they were given, cleared when withdrawn and
  -- by the 14-day retention sweep.
  driver_phone_consent_at  timestamptz,
  rider_phone_consent_at   timestamptz,
  driver_25                boolean,
  driver_licensed          boolean,
  driver_paperwork_at      timestamptz,
  driver_paperwork_by      uuid        references public.profiles(id) on delete set null,
  updated_at               timestamptz not null default now(),
  staff_updated_by         uuid        references public.profiles(id) on delete set null
);

create table if not exists public.hub_day_answers (
  invite_id            uuid        not null references public.hub_invites(id) on delete cascade,
  day_id               uuid        not null references public.hub_days(id) on delete cascade,
  attending            text        check (attending in ('yes', 'no', 'unsure')),
  adults               smallint    check (adults between 0 and 4),
  pit_setup            boolean,
  home_option          text        check (home_option is null or length(home_option) <= 40),
  -- Getting to Bosco Tech: 'self' or 'pickup' (a ride from home).
  school_mode          text        check (school_mode in ('self', 'pickup')),
  -- Bosco Tech to the venue, and home. null = the default (carpool, or
  -- 'self' when the family stays nearby that night).
  to_mode              text        check (to_mode in ('carpool', 'driving', 'self')),
  home_mode            text        check (home_mode in ('carpool', 'driving', 'self')),
  offer_seats          smallint    check (offer_seats between 1 and 7),
  offer_description    text        check (offer_description is null or length(offer_description) <= 80),
  offer_leave_by       timestamptz,
  offer_takes_pickups  boolean,
  confirmed_at         timestamptz,
  updated_at           timestamptz not null default now(),
  primary key (invite_id, day_id)
);

-- ── 4. Cars, seats, pickups ─────────────────────────────────────────────────

create table if not exists public.hub_cars (
  id                     uuid        primary key default gen_random_uuid(),
  event_id               uuid        not null references public.hub_events(id) on delete cascade,
  day_id                 uuid        not null references public.hub_days(id) on delete cascade,
  run                    text        not null check (run in ('to', 'home')),
  -- A family's car (from its own link) or a staff-entered car (driver_label).
  driver_invite_id       uuid        references public.hub_invites(id) on delete cascade,
  driver_label           text        check (driver_label is null or length(driver_label) <= 80),
  seats                  smallint    not null check (seats between 1 and 7),
  description            text        not null check (length(btrim(description)) between 1 and 80),
  leave_by               timestamptz,
  takes_pickups          boolean     not null default false,
  left_at                timestamptz,
  arrived_at             timestamptz,
  minor_override_reason  text,
  minor_override_by      uuid        references public.profiles(id) on delete set null,
  minor_override_at      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint hub_cars_driver_chk check (driver_invite_id is not null or driver_label is not null),
  constraint hub_cars_run_uniq unique (id, day_id, run)
);
create unique index if not exists hub_cars_family_run_uniq
  on public.hub_cars (day_id, run, driver_invite_id) where driver_invite_id is not null;

create table if not exists public.hub_seats (
  car_id           uuid        not null,
  day_id           uuid        not null,
  run              text        not null check (run in ('to', 'home')),
  invite_id        uuid        not null references public.hub_invites(id) on delete cascade,
  via_pickup       boolean     not null default false,
  placed_by        uuid        references public.profiles(id) on delete set null,
  override_reason  text,
  created_at       timestamptz not null default now(),
  primary key (car_id, invite_id),
  -- One seat per student per run: the database, not the client, says so.
  constraint hub_seats_one_per_run unique (day_id, run, invite_id),
  constraint hub_seats_car_fk foreign key (car_id, day_id, run)
    references public.hub_cars (id, day_id, run) on delete cascade
);

create table if not exists public.hub_pickups (
  id           uuid        primary key default gen_random_uuid(),
  invite_id    uuid        not null references public.hub_invites(id) on delete cascade,
  day_id       uuid        not null references public.hub_days(id) on delete cascade,
  -- Cross streets or a landmark, never an address. Stored ONLY with consent.
  spot         text        check (spot is null or length(spot) between 1 and 160),
  consent_at   timestamptz,
  covers_home  boolean     not null default true,
  car_id       uuid        references public.hub_cars(id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint hub_pickups_consent_chk check ((spot is null) = (consent_at is null)),
  constraint hub_pickups_invite_day_uniq unique (invite_id, day_id)
);

-- ── 5. Food claims ──────────────────────────────────────────────────────────

create table if not exists public.hub_food_claims (
  id          uuid        primary key default gen_random_uuid(),
  meal_id     uuid        not null references public.hub_meals(id) on delete cascade,
  need_id     uuid        references public.hub_food_needs(id) on delete set null,
  invite_id   uuid        references public.hub_invites(id) on delete cascade,
  staff_label text        check (staff_label is null or length(staff_label) <= 80),
  what        text        not null check (length(btrim(what)) between 1 and 120),
  serves      smallint    not null check (serves between 1 and 500),
  allergen    text        not null check (allergen in ('yes', 'no', 'unsure')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint hub_food_claims_who_chk check (invite_id is not null or staff_label is not null)
);
-- A need is claimed by one family at most.
create unique index if not exists hub_food_claims_need_uniq
  on public.hub_food_claims (need_id) where need_id is not null;

-- ── 6. Outbox and the resend throttle ───────────────────────────────────────

create table if not exists public.hub_outbox (
  id              uuid        primary key default gen_random_uuid(),
  event_id        uuid        references public.hub_events(id) on delete cascade,
  kind            text        not null,
  to_emails       text[]      not null,
  subject         text        not null,
  -- {{link}} is replaced at send time by a freshly minted link for
  -- link_invite_id. No raw token is ever stored here.
  body            text        not null,
  link_invite_id  uuid        references public.hub_invites(id) on delete cascade,
  dedupe_key      text,
  status          text        not null default 'pending'
                    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        int         not null default 0,
  taken_at        timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create unique index if not exists hub_outbox_dedupe_uniq on public.hub_outbox (dedupe_key) where dedupe_key is not null;
create index if not exists hub_outbox_pending_idx on public.hub_outbox (status, created_at);

create table if not exists public.hub_resend_log (
  id     bigserial   primary key,
  email  text        not null,
  at     timestamptz not null default now()
);
create index if not exists hub_resend_log_email_idx on public.hub_resend_log (email, at);

-- ── 7. Grants and RLS ───────────────────────────────────────────────────────
-- The bootstrap ALTER DEFAULT PRIVILEGES granted anon AND authenticated
-- everything on each new public table. A policy's absence fails at 0 rows,
-- silently, so every write that must be impossible is REVOKED as well, and
-- anon is revoked BY NAME (a bare "from public" would leave the direct grant).
--
--   setup tables      staff read and write directly (RLS is_staff()).
--   everything else   staff READ directly; nobody writes directly, staff
--                     included: car moves, claims and answers go through the
--                     rule functions, so a staff edit cannot skip a rule.
--   tokens, throttle  nobody reads or writes directly, staff included.
--   non-staff         nothing at all: students read hub_member_board().

do $grants$
declare t text;
begin
  foreach t in array array['hub_events', 'hub_days', 'hub_meals', 'hub_food_needs',
                           'hub_invites', 'hub_invite_tokens', 'hub_responses', 'hub_day_answers',
                           'hub_cars', 'hub_seats', 'hub_pickups', 'hub_food_claims',
                           'hub_outbox', 'hub_resend_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from public', t);
  end loop;

  -- Setup tables: staff write through RLS.
  foreach t in array array['hub_events', 'hub_days', 'hub_meals', 'hub_food_needs'] loop
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;

  -- Family data: staff read only; writes through the functions.
  foreach t in array array['hub_invites', 'hub_responses', 'hub_day_answers', 'hub_cars',
                           'hub_seats', 'hub_pickups', 'hub_food_claims', 'hub_outbox'] loop
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;

  -- Tokens and the resend throttle: nobody, staff included.
  foreach t in array array['hub_invite_tokens', 'hub_resend_log'] loop
    execute format('revoke all on table public.%I from authenticated', t);
  end loop;
end
$grants$;

revoke all on sequence public.hub_resend_log_id_seq from anon, authenticated;

-- One staff policy per table, named per table, re-created on every paste.
do $policies$
declare t text;
begin
  foreach t in array array['hub_events', 'hub_days', 'hub_meals', 'hub_food_needs'] loop
    execute format('drop policy if exists %I on public.%I', t || ' staff all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())',
                   t || ' staff all', t);
  end loop;
  foreach t in array array['hub_invites', 'hub_responses', 'hub_day_answers', 'hub_cars',
                           'hub_seats', 'hub_pickups', 'hub_food_claims', 'hub_outbox'] loop
    execute format('drop policy if exists %I on public.%I', t || ' staff read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())',
                   t || ' staff read', t);
  end loop;
  -- hub_invite_tokens and hub_resend_log: RLS on, NO policy, and no grant.
end
$policies$;

-- ── 8. Internal helpers ─────────────────────────────────────────────────────
-- Every public._hub_* function is INTERNAL: execute is revoked from every
-- client role at the end of this file, so they run only inside the public
-- entry points (hub_family_call, hub_member_board, hub_staff_call, and the
-- service-role mail functions), which are SECURITY DEFINER with the same
-- owner.

-- A refusal: a machine code the pages switch on, and the sentence a family
-- reads. One shape everywhere, so the Edge Function and the staff page read
-- every rule's answer the same way.
create or replace function public._hub_refuse(p_code text, p_message text)
returns void language plpgsql set search_path = public, pg_temp as $fn$
begin
  raise exception using errcode = 'P0001', message = 'hub:' || p_code, detail = p_message;
end
$fn$;

create or replace function public._hub_time(p_ts timestamptz, p_tz text default 'America/Los_Angeles')
returns text language sql stable set search_path = public, pg_temp as $fn$
  select to_char(p_ts at time zone p_tz, 'FMHH12:MI AM')
$fn$;

create or replace function public._hub_day(p_ts timestamptz, p_tz text default 'America/Los_Angeles')
returns text language sql stable set search_path = public, pg_temp as $fn$
  select to_char(p_ts at time zone p_tz, 'Dy, Mon FMDD')
$fn$;

-- The token: 16 random bytes, base64url, 22 characters. Only its hash is kept.
create or replace function public._hub_mint_token(p_invite uuid)
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare v text;
begin
  v := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  insert into public.hub_invite_tokens (token_hash, invite_id)
  values (sha256(convert_to(v, 'UTF8')), p_invite);
  return v;
end
$fn$;

-- Token -> invite, or null. A malformed token never reaches the index.
create or replace function public._hub_invite_for_token(p_token text)
returns uuid language sql stable security definer set search_path = public, pg_temp as $fn$
  select t.invite_id
    from public.hub_invite_tokens t
   where coalesce(p_token, '') ~ '^[A-Za-z0-9_-]{22}$'
     and t.token_hash = sha256(convert_to(p_token, 'UTF8'))
     and t.revoked_at is null
$fn$;

create or replace function public._hub_event_end(p_event uuid)
returns timestamptz language sql stable security definer set search_path = public, pg_temp as $fn$
  select max(d.venue_closes_at) from public.hub_days d where d.event_id = p_event
$fn$;

create or replace function public._hub_student_name(p_student uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.nickname), ''), 'A student')
    from public.profiles p where p.id = p_student
$fn$;

create or replace function public._hub_invite_name(p_invite uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select public._hub_student_name(i.student_id) from public.hub_invites i where i.id = p_invite
$fn$;

-- "Claimed by the <surname> family": the parent's last word, else the
-- student's.
create or replace function public._hub_family_surname(p_invite uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(
           nullif(regexp_replace(btrim(r.parent_name), '^.*\s', ''), ''),
           nullif(regexp_replace(btrim(p.full_name), '^.*\s', ''), ''),
           'Team')
    from public.hub_invites i
    join public.profiles p on p.id = i.student_id
    left join public.hub_responses r on r.invite_id = i.id
   where i.id = p_invite
$fn$;

create or replace function public._hub_driver_name(p_car uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(
           nullif(btrim(c.driver_label), ''),
           nullif(btrim(r.parent_name), ''),
           split_part(public._hub_invite_name(c.driver_invite_id), ' ', 1) || '''s family')
    from public.hub_cars c
    left join public.hub_responses r on r.invite_id = c.driver_invite_id
   where c.id = p_car
$fn$;

-- Every (invite, day) of an event with the EFFECTIVE plan: a blank mode is the
-- default (team carpool, or "on our own" when the family stays near the venue
-- the night before / after).
create or replace function public._hub_plan(p_event uuid)
returns table (invite_id uuid, student_id uuid, day_id uuid, day_date date,
               attending text, adults smallint, eff_to text, eff_home text,
               nearby_before boolean, nearby_after boolean, school_mode text)
language sql stable security definer set search_path = public, pg_temp as $fn$
  select i.id, i.student_id, d.id, d.day_date, a.attending, a.adults,
         coalesce(a.to_mode,
                  case when coalesce((d.day_date - 1) = any(r.staying_nights), false) then 'self' else 'carpool' end),
         coalesce(a.home_mode,
                  case when coalesce(d.day_date = any(r.staying_nights), false) then 'self' else 'carpool' end),
         coalesce((d.day_date - 1) = any(r.staying_nights), false),
         coalesce(d.day_date = any(r.staying_nights), false),
         a.school_mode
    from public.hub_invites i
    join public.hub_days d on d.event_id = i.event_id
    left join public.hub_day_answers a on a.invite_id = i.id and a.day_id = d.id
    left join public.hub_responses r on r.invite_id = i.id
   where i.event_id = p_event
$fn$;

-- Is the driver's OWN student in this car on this run? Only a family that
-- chose "I am driving" for the run, for a day its student is coming.
create or replace function public._hub_own_aboard(p_car uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce((
    select a.attending = 'yes'
           and (case when c.run = 'to' then a.to_mode else a.home_mode end) = 'driving'
      from public.hub_cars c
      join public.hub_day_answers a on a.invite_id = c.driver_invite_id and a.day_id = c.day_id
     where c.id = p_car), false)
$fn$;

-- THE ONE-MINOR RULE, as a state of one car run: null when fine,
-- 'needs_second_rider' when exactly one student who is not the driver's own
-- rides, 'single_pickup' when exactly one does the home-pickup leg alone.
-- A staff override recorded with a reason clears it until the riders change.
create or replace function public._hub_car_problem(p_car uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select case
           when not e.one_minor_rule then null
           when c.minor_override_reason is not null then null
           when public._hub_own_aboard(c.id) then null
           when (select count(*) from public.hub_seats s where s.car_id = c.id) = 1 then 'needs_second_rider'
           when (select count(*) from public.hub_seats s where s.car_id = c.id and s.via_pickup) = 1 then 'single_pickup'
           else null
         end
    from public.hub_cars c
    join public.hub_events e on e.id = c.event_id
   where c.id = p_car
$fn$;

-- Pending: the event requires driver paperwork and no mentor has marked this
-- family's on file. A pending car lists, and takes no riders.
create or replace function public._hub_car_pending(p_car uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select e.driver_paperwork_required
         and c.driver_invite_id is not null
         and coalesce((select r.driver_paperwork_at is null
                         from public.hub_responses r where r.invite_id = c.driver_invite_id), true)
    from public.hub_cars c
    join public.hub_events e on e.id = c.event_id
   where c.id = p_car
$fn$;

create or replace function public._hub_is_email(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $fn$
  select coalesce(btrim(p) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', false)
$fn$;

create or replace function public._hub_is_phone(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $fn$
  select coalesce(length(regexp_replace(p, '\D', '', 'g')) >= 10, false)
$fn$;

-- PHASE COMPLETENESS. The one definition of "done" every page and email
-- reads. Phase 1 (sign-up) is every required answer present; "Not sure yet"
-- is allowed. Lock-in is Phase 1 plus no day left "Not sure yet" plus every
-- day the student is coming confirmed. `missing` lists what is left, by step,
-- so a page can point at it.
create or replace function public._hub_progress(p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_event   uuid;
  e         public.hub_events;
  r         public.hub_responses;
  d         record;
  missing   jsonb := '[]'::jsonb;
  v_eff_to  text;
  v_eff_home text;
  unsure    int := 0;
  unconfirmed int := 0;
  coming    int := 0;
  s_days boolean := true; s_getting boolean := true; s_food boolean := true; s_contacts boolean := true;
begin
  select i.event_id into v_event from public.hub_invites i where i.id = p_invite;
  select * into e from public.hub_events where id = v_event;
  select * into r from public.hub_responses where invite_id = p_invite;

  if r.staying_nights is null then
    s_days := false;
    missing := missing || jsonb_build_object('step', 'days', 'key', 'staying');
  end if;

  for d in
    select dd.id, dd.day_date, dd.ask_pit_setup, dd.ask_school_ride,
           a.attending, a.adults, a.pit_setup, a.school_mode, a.to_mode, a.home_mode,
           a.offer_seats, a.offer_description, a.offer_leave_by, a.offer_takes_pickups, a.confirmed_at,
           coalesce((dd.day_date - 1) = any(r.staying_nights), false) as nb_before,
           coalesce(dd.day_date = any(r.staying_nights), false) as nb_after,
           pk.spot as pickup_spot
      from public.hub_days dd
      left join public.hub_day_answers a on a.invite_id = p_invite and a.day_id = dd.id
      left join public.hub_pickups pk on pk.invite_id = p_invite and pk.day_id = dd.id
     where dd.event_id = v_event
     order by dd.day_date
  loop
    if d.attending is null then
      s_days := false;
      missing := missing || jsonb_build_object('step', 'days', 'key', 'attending', 'day_id', d.id);
    elsif d.attending = 'unsure' then
      unsure := unsure + 1;
    end if;
    continue when coalesce(d.attending, '') <> 'yes';

    coming := coming + 1;
    if d.confirmed_at is null then unconfirmed := unconfirmed + 1; end if;
    if d.adults is null then
      s_days := false;
      missing := missing || jsonb_build_object('step', 'days', 'key', 'adults', 'day_id', d.id);
    end if;
    if d.ask_pit_setup and d.pit_setup is null then
      s_days := false;
      missing := missing || jsonb_build_object('step', 'days', 'key', 'pit_setup', 'day_id', d.id);
    end if;

    v_eff_to := coalesce(d.to_mode, case when d.nb_before then 'self' else 'carpool' end);
    v_eff_home := coalesce(d.home_mode, case when d.nb_after then 'self' else 'carpool' end);
    if d.ask_school_ride and not d.nb_before and v_eff_to = 'carpool' then
      if d.school_mode is null then
        s_getting := false;
        missing := missing || jsonb_build_object('step', 'getting', 'key', 'school_mode', 'day_id', d.id);
      elsif d.school_mode = 'pickup' and d.pickup_spot is null then
        s_getting := false;
        missing := missing || jsonb_build_object('step', 'getting', 'key', 'pickup', 'day_id', d.id);
      end if;
    end if;
    if 'driving' in (v_eff_to, v_eff_home) then
      if d.offer_seats is null or nullif(btrim(d.offer_description), '') is null
         or d.offer_leave_by is null or d.offer_takes_pickups is null then
        s_getting := false;
        missing := missing || jsonb_build_object('step', 'getting', 'key', 'car', 'day_id', d.id);
      end if;
      if not coalesce(r.driver_25, false) or not coalesce(r.driver_licensed, false) then
        s_getting := false;
        missing := missing || jsonb_build_object('step', 'getting', 'key', 'driver_checks', 'day_id', d.id);
      end if;
    end if;
  end loop;

  if not (coalesce(r.allergies_none, false)
          or cardinality(coalesce(r.allergens, '{}'::text[])) > 0
          or nullif(btrim(r.allergy_other), '') is not null) then
    s_food := false;
    missing := missing || jsonb_build_object('step', 'food', 'key', 'allergies');
  end if;
  if r.medication is null then
    s_food := false;
    missing := missing || jsonb_build_object('step', 'food', 'key', 'medication');
  end if;

  if nullif(btrim(r.parent_name), '') is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'parent_name');
  end if;
  if not public._hub_is_phone(r.parent_phone) then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'parent_phone');
  end if;
  if not public._hub_is_email(r.parent_email) then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'parent_email');
  end if;
  if nullif(btrim(r.emergency_name), '') is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'emergency_name');
  end if;
  if not public._hub_is_phone(r.emergency_phone) then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'emergency_phone');
  end if;
  if r.first_reg_done is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'first_reg');
  end if;
  if nullif(btrim(e.links ->> 'school_form'), '') is not null and r.school_form_done is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'school_form');
  end if;

  return jsonb_build_object(
    'phase1_done', s_days and s_getting and s_food and s_contacts,
    'lockin_done', s_days and s_getting and s_food and s_contacts and unsure = 0 and unconfirmed = 0,
    'steps', jsonb_build_object('days', s_days, 'getting', s_getting, 'food', s_food, 'contacts', s_contacts),
    'missing', missing,
    'unsure_days', unsure,
    'unconfirmed_days', unconfirmed,
    'coming_days', coming);
end
$fn$;

-- Who is emailed when a mentor must know: the event's alert list, else every
-- admin's sign-in email.
create or replace function public._hub_mentor_emails(p_event uuid)
returns text[] language sql stable security definer set search_path = public, pg_temp as $fn$
  select case
           when cardinality(e.alert_emails) > 0 then e.alert_emails
           else coalesce((select array_agg(distinct lower(u.email))
                            from public.member_roles mr join auth.users u on u.id = mr.member_id
                           where mr.role = 'admin' and u.email is not null), '{}')
         end
    from public.hub_events e where e.id = p_event
$fn$;

-- One outbox row. Skips quietly when there is nobody to send to, or when the
-- dedupe key has already been used.
create or replace function public._hub_enqueue(p_event uuid, p_kind text, p_to text[], p_subject text,
                                               p_body text, p_link_invite uuid default null,
                                               p_dedupe text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_to is null or cardinality(p_to) = 0 then return; end if;
  insert into public.hub_outbox (event_id, kind, to_emails, subject, body, link_invite_id, dedupe_key)
  values (p_event, p_kind, p_to, p_subject, p_body, p_link_invite, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end
$fn$;

create or replace function public._hub_run_label(p_run text)
returns text language sql immutable set search_path = public, pg_temp as $fn$
  select case p_run when 'to' then 'to the venue' else 'home' end
$fn$;

create or replace function public._hub_sign()
returns text language sql immutable set search_path = public, pg_temp as $fn$
  select E'\n\nTechmen, FRC Team 5669\nQuestions? Reply to this email.'
$fn$;

-- ── 9. The rules ────────────────────────────────────────────────────────────

-- jsonb value readers. A wrong type is a refusal, not a cast error.
create or replace function public._hub_jtext(p jsonb)
returns text language sql immutable set search_path = public, pg_temp as $fn$
  select case when p is null or jsonb_typeof(p) = 'null' then null
              else nullif(btrim(p #>> '{}'), '') end
$fn$;

create or replace function public._hub_jbool(p jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $fn$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'boolean' then
    perform public._hub_refuse('invalid', 'That answer is not a yes or no.');
  end if;
  return (p #>> '{}')::boolean;
end
$fn$;

create or replace function public._hub_jlen(p text, p_max int)
returns text language plpgsql immutable set search_path = public, pg_temp as $fn$
begin
  if p is not null and length(p) > p_max then
    perform public._hub_refuse('too_long', format('Please keep that under %s characters.', p_max));
  end if;
  return p;
end
$fn$;

-- Alerts. Each decides who is told and what it says; hub_outbox sends it.
create or replace function public._hub_alert_seat_dropped(p_car uuid, p_rider uuid, p_why text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars; e public.hub_events; d public.hub_days; v_student text; v_driver text;
begin
  select * into c from public.hub_cars where id = p_car;
  select * into e from public.hub_events where id = c.event_id;
  select * into d from public.hub_days where id = c.day_id;
  v_student := public._hub_invite_name(p_rider);
  v_driver := public._hub_driver_name(p_car);
  perform public._hub_enqueue(e.id, 'seat_dropped',
    (select emails from public.hub_invites where id = p_rider),
    format('%s: a seat for %s was dropped', e.title, split_part(v_student, ' ', 1)),
    format(E'%s no longer has a seat in %s''s car on %s (%s).\n%s\n\nPlease pick another car on your family page:\n{{link}}',
           v_student, v_driver, public._hub_day(d.venue_closes_at, e.timezone), public._hub_run_label(c.run), p_why)
      || public._hub_sign(),
    p_rider);
  perform public._hub_enqueue(e.id, 'seat_dropped_staff', public._hub_mentor_emails(e.id),
    format('%s: seat dropped for %s', e.title, v_student),
    format(E'%s lost a seat in %s''s car on %s (%s).\n%s\nThe family has been emailed.',
           v_student, v_driver, public._hub_day(d.venue_closes_at, e.timezone), public._hub_run_label(c.run), p_why));
end
$fn$;

-- A rider left on their own. Before lock-in opens this is planning, and
-- nobody is emailed; after, the driver family and mentors are.
create or replace function public._hub_alert_rider_left(p_car uuid, p_rider uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars; e public.hub_events; d public.hub_days; v_student text;
begin
  select * into c from public.hub_cars where id = p_car;
  select * into e from public.hub_events where id = c.event_id;
  if e.lockin_opens_at is null or now() < e.lockin_opens_at then return; end if;
  select * into d from public.hub_days where id = c.day_id;
  v_student := public._hub_invite_name(p_rider);
  if c.driver_invite_id is not null then
    perform public._hub_enqueue(e.id, 'rider_left',
      (select emails from public.hub_invites where id = c.driver_invite_id),
      format('%s: %s no longer rides with you', e.title, split_part(v_student, ' ', 1)),
      format(E'%s no longer rides in your car on %s (%s).\nNothing for you to do. Mentors have been told.',
             v_student, public._hub_day(d.venue_closes_at, e.timezone), public._hub_run_label(c.run))
        || public._hub_sign());
  end if;
  perform public._hub_enqueue(e.id, 'rider_left_staff', public._hub_mentor_emails(e.id),
    format('%s: %s left %s''s car', e.title, v_student, public._hub_driver_name(p_car)),
    format(E'%s left %s''s car on %s (%s) after lock-in opened.',
           v_student, public._hub_driver_name(p_car), public._hub_day(d.venue_closes_at, e.timezone), public._hub_run_label(c.run)));
end
$fn$;

create or replace function public._hub_alert_if_red(p_car uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars; e public.hub_events; d public.hub_days; v_problem text;
begin
  select * into c from public.hub_cars where id = p_car;
  if not found then return; end if;
  v_problem := public._hub_car_problem(p_car);
  if v_problem is null then return; end if;
  select * into e from public.hub_events where id = c.event_id;
  select * into d from public.hub_days where id = c.day_id;
  perform public._hub_enqueue(e.id, 'car_red', public._hub_mentor_emails(e.id),
    format('%s: %s''s car needs a second rider', e.title, public._hub_driver_name(p_car)),
    format(E'%s''s car on %s (%s) now has %s.\nIt cannot be marked Left until a second rider joins or a mentor records an override on the mentor page.',
           public._hub_driver_name(p_car), public._hub_day(d.venue_closes_at, e.timezone), public._hub_run_label(c.run),
           case v_problem when 'single_pickup' then 'one student on the home pickup leg who is not the driver''s own'
                          else 'one student who is not the driver''s own' end));
end
$fn$;

-- Take one student out of one car. p_cause: 'rider' (their family chose to),
-- 'switch' (moving to another car), 'driver' (the driver withdrew), 'staff'
-- (a mentor unseated them), 'staff_move' (a mentor moved them).
create or replace function public._hub_drop_seat(p_car uuid, p_rider uuid, p_cause text, p_why text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_seat public.hub_seats;
begin
  select * into v_seat from public.hub_seats where car_id = p_car and invite_id = p_rider;
  if not found then return; end if;
  if p_cause in ('driver', 'staff') then
    perform public._hub_alert_seat_dropped(p_car, p_rider,
      coalesce(p_why, case p_cause when 'driver' then 'The driver changed their plan.' else 'A mentor changed the car plan.' end));
  end if;
  delete from public.hub_seats where car_id = p_car and invite_id = p_rider;
  if v_seat.via_pickup and v_seat.run = 'to' then
    update public.hub_pickups set car_id = null, accepted_at = null, updated_at = now()
     where invite_id = p_rider and day_id = v_seat.day_id and car_id = p_car;
  end if;
  update public.hub_cars
     set minor_override_reason = null, minor_override_by = null, minor_override_at = null, updated_at = now()
   where id = p_car;
  if p_cause in ('rider', 'switch') then
    perform public._hub_alert_rider_left(p_car, p_rider);
  end if;
  perform public._hub_alert_if_red(p_car);
end
$fn$;

-- SEAT CAPACITY AND THE ONE-MINOR RULE, at the moment of a claim. The car row
-- is locked FOR UPDATE first, so two families racing for the last seat are
-- serialized here: the second one counts the first one's seat and is refused.
create or replace function public._hub_claim(p_car uuid, p_rider uuid, p_staff uuid,
                                             p_override text default null, p_via_pickup boolean default false)
returns text language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  c public.hub_cars; e public.hub_events; a public.hub_day_answers;
  v_rider_event uuid; v_riders int; v_pickups int; v_old uuid; v_override boolean := false;
  v_mode text;
begin
  select * into c from public.hub_cars where id = p_car for update;
  if not found then
    perform public._hub_refuse('car_gone', 'That car is no longer listed. Pick another.');
  end if;
  select * into e from public.hub_events where id = c.event_id;
  select i.event_id into v_rider_event from public.hub_invites i where i.id = p_rider;
  if v_rider_event is distinct from c.event_id then
    perform public._hub_refuse('bad_car', 'That car is not part of this event.');
  end if;
  if p_staff is null and now() >= public._hub_event_end(e.id) then
    perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
  end if;
  if c.left_at is not null then
    perform public._hub_refuse('car_left', 'That car already left.');
  end if;
  if c.driver_invite_id = p_rider then
    perform public._hub_refuse('own_car', 'Your student rides in your own car.');
  end if;
  select * into a from public.hub_day_answers where invite_id = p_rider and day_id = c.day_id;
  if coalesce(a.attending, '') <> 'yes' then
    perform public._hub_refuse('not_coming', 'Mark this day as Coming first.');
  end if;
  v_mode := case c.run when 'to' then a.to_mode else a.home_mode end;
  if v_mode = 'driving' then
    perform public._hub_refuse('you_drive', 'You are driving this run. Change your plan for this run first.');
  end if;
  if public._hub_car_pending(c.id) then
    perform public._hub_refuse('pending', 'This car is waiting on driver paperwork. Pick another.');
  end if;

  select count(*), count(*) filter (where s.via_pickup) into v_riders, v_pickups
    from public.hub_seats s where s.car_id = c.id;

  -- Already in this car: at most it becomes a pickup, which the pickup-leg
  -- half of the one-minor rule must allow.
  if exists (select 1 from public.hub_seats s where s.car_id = c.id and s.invite_id = p_rider) then
    if p_via_pickup and not (select s.via_pickup from public.hub_seats s where s.car_id = c.id and s.invite_id = p_rider) then
      if e.one_minor_rule and not public._hub_own_aboard(c.id) and v_pickups + 1 = 1
         and not (p_staff is not null and nullif(btrim(p_override), '') is not null) then
        perform public._hub_refuse('one_minor',
          'The home pickup leg would carry one student alone with an adult who is not their parent. Ask a mentor.');
      end if;
      update public.hub_seats set via_pickup = true where car_id = c.id and invite_id = p_rider;
      update public.hub_cars
         set minor_override_reason = case when p_staff is not null then nullif(btrim(p_override), '') end,
             minor_override_by = case when p_staff is not null and nullif(btrim(p_override), '') is not null then p_staff end,
             minor_override_at = case when p_staff is not null and nullif(btrim(p_override), '') is not null then now() end,
             updated_at = now()
       where id = c.id;
    end if;
    return 'unchanged';
  end if;
  if v_riders >= c.seats then
    perform public._hub_refuse('car_full', 'That car just filled. Pick another.');
  end if;

  if e.one_minor_rule and not public._hub_own_aboard(c.id)
     and (v_riders + 1 = 1 or (p_via_pickup and v_pickups + 1 = 1)) then
    if p_staff is not null and nullif(btrim(p_override), '') is not null then
      v_override := true;
    else
      perform public._hub_refuse('one_minor',
        case when v_riders + 1 = 1
             then 'This car would carry one student alone with an adult who is not their parent. Pick a car with another rider, or ask a mentor.'
             else 'The home pickup leg would carry one student alone with an adult who is not their parent. Ask a mentor.' end);
    end if;
  end if;

  select s.car_id into v_old from public.hub_seats s
   where s.day_id = c.day_id and s.run = c.run and s.invite_id = p_rider;
  if v_old is not null then
    if (select left_at from public.hub_cars where id = v_old) is not null then
      perform public._hub_refuse('car_left', 'Your student''s current car already left.');
    end if;
    perform public._hub_drop_seat(v_old, p_rider, case when p_staff is null then 'switch' else 'staff_move' end);
  end if;

  insert into public.hub_seats (car_id, day_id, run, invite_id, via_pickup, placed_by, override_reason)
  values (c.id, c.day_id, c.run, p_rider, p_via_pickup, p_staff, case when v_override then p_override end);

  update public.hub_cars
     set minor_override_reason = case when v_override then btrim(p_override) end,
         minor_override_by     = case when v_override then p_staff end,
         minor_override_at     = case when v_override then now() end,
         updated_at = now()
   where id = c.id;

  -- A seat means "team carpool" for this run.
  if c.run = 'to' then
    update public.hub_day_answers set to_mode = 'carpool', updated_at = now()
     where invite_id = p_rider and day_id = c.day_id and to_mode is distinct from 'carpool';
  else
    update public.hub_day_answers set home_mode = 'carpool', updated_at = now()
     where invite_id = p_rider and day_id = c.day_id and home_mode is distinct from 'carpool';
  end if;
  return 'placed';
end
$fn$;

-- A claim on the run to the venue also takes the same driver's car home,
-- when the student rides the team carpool home and nothing else is chosen.
-- Its own refusal never undoes the first claim: the result says so.
create or replace function public._hub_claim_with_home(p_car uuid, p_rider uuid, p_staff uuid,
                                                       p_override text default null, p_via_pickup boolean default false,
                                                       p_home_pickup boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars; v_first text; v_home uuid; v_home_result text := 'none'; v_msg text;
begin
  v_first := public._hub_claim(p_car, p_rider, p_staff, p_override, p_via_pickup);
  select * into c from public.hub_cars where id = p_car;
  if c.run = 'to' and c.driver_invite_id is not null
     and (select eff_home from public._hub_plan(c.event_id) p where p.invite_id = p_rider and p.day_id = c.day_id) = 'carpool'
     and not exists (select 1 from public.hub_seats s where s.day_id = c.day_id and s.run = 'home' and s.invite_id = p_rider) then
    select id into v_home from public.hub_cars
     where day_id = c.day_id and run = 'home' and driver_invite_id = c.driver_invite_id;
    if v_home is not null then
      begin
        v_home_result := public._hub_claim(v_home, p_rider, p_staff, null, p_home_pickup);
      exception when others then
        v_home_result := 'not_placed';
        get stacked diagnostics v_msg = pg_exception_detail;
      end;
    end if;
  end if;
  return jsonb_build_object('result', v_first, 'home', v_home_result, 'home_message', v_msg);
end
$fn$;

create or replace function public._hub_unclaim(p_car uuid, p_rider uuid, p_staff uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars;
begin
  select * into c from public.hub_cars where id = p_car for update;
  if not found then return; end if;
  if p_staff is null and now() >= public._hub_event_end(c.event_id) then
    perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
  end if;
  if c.left_at is not null then
    perform public._hub_refuse('car_left', 'That car already left. Ask a mentor.');
  end if;
  perform public._hub_drop_seat(c.id, p_rider, case when p_staff is null then 'rider' else 'staff' end);
end
$fn$;

-- A family's car rows follow its answers: a run with "I am driving", for a
-- day the student is coming, with a complete offer and both driver checks,
-- has a car; otherwise it does not. Withdrawing a car with riders drops their
-- seats and emails them. A car that has left is frozen.
create or replace function public._hub_sync_cars(p_invite uuid, p_day uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  a public.hub_day_answers; r public.hub_responses; c public.hub_cars;
  v_event uuid; v_run text; v_mode text; v_want boolean; v_riders int; s record;
begin
  select * into a from public.hub_day_answers where invite_id = p_invite and day_id = p_day;
  select * into r from public.hub_responses where invite_id = p_invite;
  select event_id into v_event from public.hub_days where id = p_day;
  foreach v_run in array array['to', 'home'] loop
    v_mode := case v_run when 'to' then a.to_mode else a.home_mode end;
    v_want := coalesce(a.attending, '') = 'yes' and v_mode = 'driving'
              and a.offer_seats is not null and nullif(btrim(a.offer_description), '') is not null
              and a.offer_leave_by is not null and a.offer_takes_pickups is not null
              and coalesce(r.driver_25, false) and coalesce(r.driver_licensed, false);
    select * into c from public.hub_cars
     where day_id = p_day and run = v_run and driver_invite_id = p_invite for update;
    if v_want then
      if c.id is null then
        insert into public.hub_cars (event_id, day_id, run, driver_invite_id, seats, description, leave_by, takes_pickups)
        values (v_event, p_day, v_run, p_invite, a.offer_seats, btrim(a.offer_description), a.offer_leave_by, a.offer_takes_pickups);
      elsif c.left_at is null then
        select count(*) into v_riders from public.hub_seats where car_id = c.id;
        if a.offer_seats < v_riders then
          perform public._hub_refuse('seats_below_riders',
            format('%s students ride with you %s. Ask a mentor to move one before lowering seats.', v_riders, public._hub_run_label(v_run)));
        end if;
        update public.hub_cars
           set seats = a.offer_seats, description = btrim(a.offer_description), leave_by = a.offer_leave_by,
               takes_pickups = a.offer_takes_pickups, updated_at = now()
         where id = c.id;
      end if;
    elsif c.id is not null then
      if c.left_at is not null then
        perform public._hub_refuse('car_left', 'That car already left. Ask a mentor.');
      end if;
      for s in select invite_id from public.hub_seats where car_id = c.id loop
        perform public._hub_drop_seat(c.id, s.invite_id, 'driver');
      end loop;
      update public.hub_pickups set car_id = null, accepted_at = null, updated_at = now() where car_id = c.id;
      delete from public.hub_cars where id = c.id;
    end if;
  end loop;
end
$fn$;

-- A pickup request stops being a pickup: the spot is deleted, and any seat it
-- came with stays a plain seat (the student is still in that car from school).
create or replace function public._hub_withdraw_pickup(p_invite uuid, p_day uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare pk public.hub_pickups; s record;
begin
  select * into pk from public.hub_pickups where invite_id = p_invite and day_id = p_day for update;
  if not found then return; end if;
  if pk.car_id is not null and (select left_at from public.hub_cars where id = pk.car_id) is not null then
    perform public._hub_refuse('car_left', 'That car already left.');
  end if;
  for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day and via_pickup loop
    update public.hub_seats set via_pickup = false where car_id = s.car_id and invite_id = p_invite;
    update public.hub_cars set minor_override_reason = null, minor_override_by = null, minor_override_at = null,
           updated_at = now() where id = s.car_id;
    perform public._hub_alert_if_red(s.car_id);
  end loop;
  delete from public.hub_pickups where id = pk.id;
end
$fn$;

-- FIELD-LEVEL SAVE: one answer at a time, as the family page autosaves.
-- p_staff null = the family (edit windows apply); a staff id = a mentor.
create or replace function public._hub_save(p_invite uuid, p_staff uuid, p_field text, p_value jsonb, p_day uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_event uuid; d public.hub_days; a public.hub_day_answers;
  v_text text; v_bool boolean; v_dates date[]; v_list text[]; v_int int; v_ts timestamptz;
  v_old text; v_run text; s record;
begin
  select event_id into v_event from public.hub_invites where id = p_invite;
  if v_event is null then perform public._hub_refuse('not_found', 'That link is not valid.'); end if;
  if p_staff is null and now() >= public._hub_event_end(v_event) then
    perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
  end if;
  insert into public.hub_responses (invite_id) values (p_invite) on conflict (invite_id) do nothing;

  -- ── answers about the whole family ──
  if p_field in ('staying_nights', 'allergies_none', 'allergens', 'allergy_other', 'dietary', 'medication',
                 'parent_name', 'parent_phone', 'parent_email', 'emergency_name', 'emergency_phone',
                 'first_reg_done', 'school_form_done', 'driver_phone_consent', 'rider_phone_consent',
                 'driver_25', 'driver_licensed') then
    case p_field
      when 'staying_nights' then
        if p_value is null or jsonb_typeof(p_value) = 'null' then
          v_dates := null;
        elsif jsonb_typeof(p_value) <> 'array' then
          perform public._hub_refuse('invalid', 'That is not a list of nights.');
        else
          begin
            select coalesce(array_agg(distinct x::date order by x::date), '{}') into v_dates
              from jsonb_array_elements_text(p_value) x;
          exception when others then
            perform public._hub_refuse('invalid', 'That is not a list of nights.');
          end;
          if exists (select 1 from unnest(v_dates) n
                      where n not in (select dd.day_date from public.hub_days dd where dd.event_id = v_event)
                         or n >= (select max(dd.day_date) from public.hub_days dd where dd.event_id = v_event)) then
            perform public._hub_refuse('invalid', 'That night is not part of this event.');
          end if;
        end if;
        update public.hub_responses set staying_nights = v_dates where invite_id = p_invite;
      when 'allergies_none' then
        v_bool := public._hub_jbool(p_value);
        update public.hub_responses
           set allergies_none = v_bool,
               allergens = case when v_bool then '{}' else allergens end,
               allergy_other = case when v_bool then null else allergy_other end
         where invite_id = p_invite;
      when 'allergens' then
        if jsonb_typeof(coalesce(p_value, '[]'::jsonb)) <> 'array' then
          perform public._hub_refuse('invalid', 'That is not a list of allergens.');
        end if;
        select coalesce(array_agg(distinct x order by x), '{}') into v_list
          from jsonb_array_elements_text(coalesce(p_value, '[]'::jsonb)) x;
        if not (v_list <@ array['peanut','tree_nut','milk','egg','wheat','soy','fish','shellfish','sesame']::text[]) then
          perform public._hub_refuse('invalid', 'That allergen is not on the list. Use Other.');
        end if;
        update public.hub_responses
           set allergens = v_list,
               allergies_none = case when cardinality(v_list) > 0 then false else allergies_none end
         where invite_id = p_invite;
      when 'allergy_other' then
        v_text := public._hub_jlen(public._hub_jtext(p_value), 300);
        update public.hub_responses
           set allergy_other = v_text,
               allergies_none = case when v_text is not null then false else allergies_none end
         where invite_id = p_invite;
      when 'dietary' then
        update public.hub_responses set dietary = public._hub_jlen(public._hub_jtext(p_value), 300) where invite_id = p_invite;
      when 'medication' then
        update public.hub_responses set medication = public._hub_jbool(p_value) where invite_id = p_invite;
      when 'parent_name' then
        update public.hub_responses set parent_name = public._hub_jlen(public._hub_jtext(p_value), 120) where invite_id = p_invite;
      when 'parent_phone' then
        update public.hub_responses set parent_phone = public._hub_jlen(public._hub_jtext(p_value), 40) where invite_id = p_invite;
      when 'parent_email' then
        update public.hub_responses set parent_email = public._hub_jlen(lower(public._hub_jtext(p_value)), 200) where invite_id = p_invite;
      when 'emergency_name' then
        update public.hub_responses set emergency_name = public._hub_jlen(public._hub_jtext(p_value), 120) where invite_id = p_invite;
      when 'emergency_phone' then
        update public.hub_responses set emergency_phone = public._hub_jlen(public._hub_jtext(p_value), 40) where invite_id = p_invite;
      when 'first_reg_done' then
        update public.hub_responses set first_reg_done = public._hub_jbool(p_value) where invite_id = p_invite;
      when 'school_form_done' then
        update public.hub_responses set school_form_done = public._hub_jbool(p_value) where invite_id = p_invite;
      when 'driver_phone_consent' then
        v_bool := public._hub_jbool(p_value);
        update public.hub_responses
           set driver_phone_consent_at = case when v_bool then coalesce(driver_phone_consent_at, now()) end
         where invite_id = p_invite;
      when 'rider_phone_consent' then
        v_bool := public._hub_jbool(p_value);
        update public.hub_responses
           set rider_phone_consent_at = case when v_bool then coalesce(rider_phone_consent_at, now()) end
         where invite_id = p_invite;
      when 'driver_25', 'driver_licensed' then
        v_bool := public._hub_jbool(p_value);
        if p_field = 'driver_25' then
          update public.hub_responses set driver_25 = v_bool where invite_id = p_invite;
        else
          update public.hub_responses set driver_licensed = v_bool where invite_id = p_invite;
        end if;
        for s in select id from public.hub_days where event_id = v_event loop
          perform public._hub_sync_cars(p_invite, s.id);
        end loop;
    end case;
    update public.hub_responses
       set updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)
     where invite_id = p_invite;
    return;
  end if;

  -- ── answers about one day ──
  if p_field is null or p_field not in ('attending', 'adults', 'pit_setup', 'home_option', 'school_mode', 'pickup',
                                         'to_mode', 'home_mode', 'car_seats', 'car_description', 'car_leave_by',
                                         'car_takes_pickups') then
    perform public._hub_refuse('unknown_field', 'That answer is not part of this form.');
  end if;
  select * into d from public.hub_days where id = p_day and event_id = v_event;
  if d.id is null then
    perform public._hub_refuse('bad_day', 'That day is not part of this event.');
  end if;
  if p_staff is null and now() >= d.venue_closes_at then
    perform public._hub_refuse('day_over', 'That day is over. Its answers are read-only now.');
  end if;
  insert into public.hub_day_answers (invite_id, day_id) values (p_invite, p_day)
  on conflict (invite_id, day_id) do nothing;
  select * into a from public.hub_day_answers where invite_id = p_invite and day_id = p_day;

  case p_field
    when 'attending' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and v_text not in ('yes', 'no', 'unsure') then
        perform public._hub_refuse('invalid', 'Choose Coming, Not coming or Not sure yet.');
      end if;
      if v_text is distinct from 'yes' then
        if exists (select 1 from public.hub_seats st join public.hub_cars c on c.id = st.car_id
                    where st.invite_id = p_invite and st.day_id = p_day and c.left_at is not null)
           or exists (select 1 from public.hub_cars c where c.driver_invite_id = p_invite and c.day_id = p_day and c.left_at is not null) then
          perform public._hub_refuse('car_left', 'A car for this day already left. Ask a mentor.');
        end if;
        for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day loop
          perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
        end loop;
        perform public._hub_withdraw_pickup(p_invite, p_day);
      end if;
      update public.hub_day_answers
         set attending = v_text,
             confirmed_at = case when v_text = 'yes' and a.attending = 'yes' then confirmed_at end
       where invite_id = p_invite and day_id = p_day;
      perform public._hub_sync_cars(p_invite, p_day);
    when 'adults' then
      if p_value is null or jsonb_typeof(p_value) = 'null' then
        v_int := null;
      elsif jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not in (0, 1, 2, 3, 4) then
        perform public._hub_refuse('invalid', 'Choose 0 to 4 adults.');
      else
        v_int := (p_value #>> '{}')::int;
      end if;
      update public.hub_day_answers set adults = v_int where invite_id = p_invite and day_id = p_day;
    when 'pit_setup' then
      update public.hub_day_answers set pit_setup = public._hub_jbool(p_value) where invite_id = p_invite and day_id = p_day;
    when 'home_option' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and not exists (select 1 from jsonb_array_elements(d.home_options) o where o ->> 'key' = v_text) then
        perform public._hub_refuse('invalid', 'That ride-home choice is not offered.');
      end if;
      update public.hub_day_answers set home_option = v_text where invite_id = p_invite and day_id = p_day;
    when 'school_mode' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and v_text not in ('self', 'pickup') then
        perform public._hub_refuse('invalid', 'Choose how your student gets to Bosco Tech.');
      end if;
      if v_text is distinct from 'pickup' then
        perform public._hub_withdraw_pickup(p_invite, p_day);
      end if;
      update public.hub_day_answers set school_mode = v_text where invite_id = p_invite and day_id = p_day;
    when 'pickup' then
      -- { spot, consent, covers_home }: stored ONLY with consent. Without it,
      -- or with no spot, any stored request is withdrawn.
      if p_value is null or jsonb_typeof(p_value) <> 'object' then
        perform public._hub_refuse('invalid', 'That pickup request is incomplete.');
      end if;
      v_text := public._hub_jlen(public._hub_jtext(p_value -> 'spot'), 160);
      v_bool := coalesce(public._hub_jbool(p_value -> 'consent'), false);
      if v_text is null or not v_bool then
        perform public._hub_withdraw_pickup(p_invite, p_day);
      else
        if exists (select 1 from public.hub_pickups pk join public.hub_cars c on c.id = pk.car_id
                    where pk.invite_id = p_invite and pk.day_id = p_day and c.left_at is not null) then
          perform public._hub_refuse('car_left', 'That car already left.');
        end if;
        insert into public.hub_pickups (invite_id, day_id, spot, consent_at, covers_home)
        values (p_invite, p_day, v_text, now(), coalesce(public._hub_jbool(p_value -> 'covers_home'), true))
        on conflict (invite_id, day_id) do update
          set spot = excluded.spot,
              consent_at = coalesce(public.hub_pickups.consent_at, excluded.consent_at),
              covers_home = excluded.covers_home,
              updated_at = now();
        update public.hub_day_answers set school_mode = 'pickup' where invite_id = p_invite and day_id = p_day;
        -- No longer covering the ride home: the home leg is a plain seat.
        if not coalesce(public._hub_jbool(p_value -> 'covers_home'), true) then
          for s in select car_id from public.hub_seats
                    where invite_id = p_invite and day_id = p_day and run = 'home' and via_pickup loop
            update public.hub_seats set via_pickup = false where car_id = s.car_id and invite_id = p_invite;
            perform public._hub_alert_if_red(s.car_id);
          end loop;
        end if;
      end if;
    when 'to_mode', 'home_mode' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and v_text not in ('carpool', 'driving', 'self') then
        perform public._hub_refuse('invalid', 'Choose how your student travels.');
      end if;
      v_run := case p_field when 'to_mode' then 'to' else 'home' end;
      v_old := case p_field when 'to_mode' then a.to_mode else a.home_mode end;
      if exists (select 1 from public.hub_seats st join public.hub_cars c on c.id = st.car_id
                  where st.invite_id = p_invite and st.day_id = p_day and st.run = v_run and c.left_at is not null)
         or exists (select 1 from public.hub_cars c where c.driver_invite_id = p_invite and c.day_id = p_day
                     and c.run = v_run and c.left_at is not null) then
        perform public._hub_refuse('car_left', 'That car already left.');
      end if;
      if coalesce(v_text, 'carpool') <> 'carpool' then
        for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day and run = v_run loop
          perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
        end loop;
      end if;
      if p_field = 'to_mode' then
        update public.hub_day_answers set to_mode = v_text where invite_id = p_invite and day_id = p_day;
        if v_text = 'driving' and a.home_mode is null
           and not coalesce(d.day_date = any((select r.staying_nights from public.hub_responses r where r.invite_id = p_invite)::date[]), false) then
          -- "I am driving" there means driving home too, unless changed.
          update public.hub_day_answers set home_mode = 'driving' where invite_id = p_invite and day_id = p_day;
          for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day and run = 'home' loop
            perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
          end loop;
        end if;
      else
        update public.hub_day_answers set home_mode = v_text where invite_id = p_invite and day_id = p_day;
      end if;
      perform public._hub_sync_cars(p_invite, p_day);
    when 'car_seats', 'car_description', 'car_leave_by', 'car_takes_pickups' then
      if p_value is null or jsonb_typeof(p_value) = 'null'
         or (p_field = 'car_description' and public._hub_jtext(p_value) is null) then
        if exists (select 1 from public.hub_cars where driver_invite_id = p_invite and day_id = p_day) then
          perform public._hub_refuse('car_required',
            'Keep this filled in while you are driving. To stop driving, change how your student gets to the venue.');
        end if;
      end if;
      case p_field
        when 'car_seats' then
          if p_value is not null and jsonb_typeof(p_value) <> 'null'
             and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not in (1, 2, 3, 4, 5, 6, 7)) then
            perform public._hub_refuse('invalid', 'Choose 1 to 7 seats.');
          end if;
          update public.hub_day_answers set offer_seats = (p_value #>> '{}')::smallint
           where invite_id = p_invite and day_id = p_day;
        when 'car_description' then
          update public.hub_day_answers set offer_description = public._hub_jlen(public._hub_jtext(p_value), 80)
           where invite_id = p_invite and day_id = p_day;
        when 'car_leave_by' then
          begin
            v_ts := public._hub_jtext(p_value)::timestamptz;
          exception when others then
            perform public._hub_refuse('invalid', 'That is not a time.');
          end;
          update public.hub_day_answers set offer_leave_by = v_ts where invite_id = p_invite and day_id = p_day;
        when 'car_takes_pickups' then
          update public.hub_day_answers set offer_takes_pickups = public._hub_jbool(p_value)
           where invite_id = p_invite and day_id = p_day;
      end case;
      perform public._hub_sync_cars(p_invite, p_day);
    else
      perform public._hub_refuse('unknown_field', 'That answer is not part of this form.');
  end case;

  update public.hub_day_answers set updated_at = now() where invite_id = p_invite and day_id = p_day;
  update public.hub_responses set updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)
   where invite_id = p_invite;
end
$fn$;

-- LEAVING NOW / ARRIVED. Only the driver's own family, or staff. A red car
-- (one-minor rule) cannot leave without a staff override and its reason.
create or replace function public._hub_mark(p_car uuid, p_what text, p_actor_invite uuid, p_staff uuid,
                                            p_override text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars; e public.hub_events; d public.hub_days; s record; v_driver text;
begin
  select * into c from public.hub_cars where id = p_car for update;
  if not found then perform public._hub_refuse('car_gone', 'That car is no longer listed.'); end if;
  select * into e from public.hub_events where id = c.event_id;
  select * into d from public.hub_days where id = c.day_id;
  if p_staff is null then
    if c.driver_invite_id is distinct from p_actor_invite then
      perform public._hub_refuse('not_your_car', 'Only the driver can mark this car.');
    end if;
    -- The last ride home arrives after the event ends, so marks run 12 hours past it.
    if now() >= public._hub_event_end(e.id) + interval '12 hours' then
      perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
    end if;
  end if;
  v_driver := public._hub_driver_name(c.id);

  if p_what = 'left' then
    if c.left_at is not null then return; end if;
    if public._hub_car_problem(c.id) is not null then
      if p_staff is not null and nullif(btrim(p_override), '') is not null then
        update public.hub_cars set minor_override_reason = btrim(p_override), minor_override_by = p_staff,
               minor_override_at = now() where id = c.id;
      else
        perform public._hub_refuse('needs_second_rider',
          'This car has one student who is not the driver''s own. It cannot leave until a second rider joins or a mentor records an override.');
      end if;
    end if;
    update public.hub_cars set left_at = now(), updated_at = now() where id = c.id;
    for s in select st.invite_id from public.hub_seats st where st.car_id = c.id loop
      perform public._hub_enqueue(e.id, 'car_left', (select emails from public.hub_invites where id = s.invite_id),
        format('%s: %s''s car left', e.title, split_part(public._hub_invite_name(s.invite_id), ' ', 1)),
        format(E'%s''s car (%s) left %s at %s with %s.',
               v_driver, c.description, case c.run when 'to' then 'for the venue' else 'the venue' end,
               public._hub_time(now(), e.timezone), public._hub_invite_name(s.invite_id)) || public._hub_sign(),
        null, 'left:' || c.id || ':' || s.invite_id);
    end loop;
  elsif p_what = 'arrived' then
    if c.left_at is null then
      perform public._hub_refuse('not_left', 'Mark "Leaving now" first.');
    end if;
    if c.arrived_at is not null then return; end if;
    update public.hub_cars set arrived_at = now(), updated_at = now() where id = c.id;
    for s in select st.invite_id from public.hub_seats st where st.car_id = c.id loop
      perform public._hub_enqueue(e.id, 'car_arrived', (select emails from public.hub_invites where id = s.invite_id),
        format('%s: %s''s car arrived', e.title, split_part(public._hub_invite_name(s.invite_id), ' ', 1)),
        format(E'%s''s car (%s) arrived %s at %s with %s.',
               v_driver, c.description, case c.run when 'to' then 'at the venue' else 'back' end,
               public._hub_time(now(), e.timezone), public._hub_invite_name(s.invite_id)) || public._hub_sign(),
        null, 'arrived:' || c.id || ':' || s.invite_id);
    end loop;
  else
    perform public._hub_refuse('invalid', 'Mark the car as left or arrived.');
  end if;
end
$fn$;

-- A driver who offered pickups (or staff) accepts one request into their car
-- to the venue, and, when the request covers it, their car home.
create or replace function public._hub_pickup_accept(p_pickup uuid, p_car uuid, p_actor_invite uuid, p_staff uuid,
                                                     p_override text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare pk public.hub_pickups; c public.hub_cars; v jsonb;
begin
  select * into pk from public.hub_pickups where id = p_pickup for update;
  if not found or pk.spot is null then
    perform public._hub_refuse('pickup_gone', 'That request was withdrawn.');
  end if;
  select * into c from public.hub_cars where id = p_car;
  if c.id is null or c.run <> 'to' or c.day_id <> pk.day_id then
    perform public._hub_refuse('bad_car', 'Pick your car to the venue on that day.');
  end if;
  if p_staff is null then
    if now() >= public._hub_event_end(c.event_id) then
      perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
    end if;
    if c.driver_invite_id is distinct from p_actor_invite then
      perform public._hub_refuse('not_your_car', 'Only the driver can accept for this car.');
    end if;
    if not c.takes_pickups then
      perform public._hub_refuse('no_pickups', 'Your car offer does not take home pickups.');
    end if;
  end if;
  if pk.car_id is not null and pk.car_id <> p_car then
    perform public._hub_refuse('pickup_taken', 'Another driver already accepted this pickup.');
  end if;
  if pk.car_id = p_car then
    return jsonb_build_object('result', 'unchanged', 'home', 'none');
  end if;
  v := public._hub_claim_with_home(p_car, pk.invite_id, p_staff, p_override, true, pk.covers_home);
  update public.hub_pickups set car_id = p_car, accepted_at = now(), updated_at = now() where id = pk.id;
  return v;
end
$fn$;

-- FOOD. A family claims an open need (or adds something else), and edits or
-- drops it until its meal starts. Dropping a claimed need reopens it and
-- emails mentors.
create or replace function public._hub_food_claim(p_meal uuid, p_need uuid, p_invite uuid, p_staff uuid,
                                                  p_staff_label text, p_what text, p_serves int, p_allergen text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $fn$
declare m public.hub_meals; v_id uuid;
begin
  select * into m from public.hub_meals where id = p_meal;
  if not found then perform public._hub_refuse('meal_gone', 'That meal is not part of this event.'); end if;
  if p_invite is not null and (select event_id from public.hub_invites where id = p_invite) <> m.event_id then
    perform public._hub_refuse('meal_gone', 'That meal is not part of this event.');
  end if;
  if p_staff is null and now() >= m.starts_at then
    perform public._hub_refuse('meal_started', 'That meal has started. Food for it is closed.');
  end if;
  if p_need is not null and not exists (select 1 from public.hub_food_needs where id = p_need and meal_id = p_meal) then
    perform public._hub_refuse('need_gone', 'That item is no longer on the list.');
  end if;
  if nullif(btrim(p_what), '') is null then
    perform public._hub_refuse('invalid', 'Say what you will bring.');
  end if;
  perform public._hub_jlen(btrim(p_what), 120);
  if p_serves is null or p_serves not between 1 and 500 then
    perform public._hub_refuse('invalid', 'Say about how many it serves.');
  end if;
  if coalesce(p_allergen, '') not in ('yes', 'no', 'unsure') then
    perform public._hub_refuse('invalid', 'Say whether it contains a listed allergen.');
  end if;
  begin
    insert into public.hub_food_claims (meal_id, need_id, invite_id, staff_label, what, serves, allergen)
    values (p_meal, p_need, p_invite, case when p_invite is null then coalesce(nullif(btrim(p_staff_label), ''), 'Mentors') end,
            btrim(p_what), p_serves, p_allergen)
    returning id into v_id;
  exception when unique_violation then
    perform public._hub_refuse('need_taken', 'Someone just claimed that. Pick another, or add something else.');
  end;
  return v_id;
end
$fn$;

create or replace function public._hub_food_change(p_claim uuid, p_invite uuid, p_staff uuid, p_drop boolean,
                                                   p_what text default null, p_serves int default null,
                                                   p_allergen text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare fc public.hub_food_claims; m public.hub_meals; n public.hub_food_needs;
begin
  select * into fc from public.hub_food_claims where id = p_claim for update;
  if not found then return; end if;
  select * into m from public.hub_meals where id = fc.meal_id;
  if p_staff is null then
    if fc.invite_id is distinct from p_invite then
      perform public._hub_refuse('not_yours', 'Only the family that claimed this can change it.');
    end if;
    if now() >= m.starts_at then
      perform public._hub_refuse('meal_started', 'That meal has started. Food for it is closed.');
    end if;
  end if;
  if p_drop then
    delete from public.hub_food_claims where id = fc.id;
    if fc.need_id is not null then
      select * into n from public.hub_food_needs where id = fc.need_id;
      perform public._hub_enqueue(m.event_id, 'food_dropped', public._hub_mentor_emails(m.event_id),
        format('%s: food dropped for %s', (select title from public.hub_events where id = m.event_id), m.label),
        format(E'%s for %s is open again.\nIt was "%s" from %s.',
               n.label, m.label, fc.what,
               case when fc.invite_id is null then fc.staff_label
                    else 'the ' || public._hub_family_surname(fc.invite_id) || ' family' end));
    end if;
    return;
  end if;
  if nullif(btrim(p_what), '') is null then
    perform public._hub_refuse('invalid', 'Say what you will bring.');
  end if;
  perform public._hub_jlen(btrim(p_what), 120);
  if p_serves is null or p_serves not between 1 and 500 then
    perform public._hub_refuse('invalid', 'Say about how many it serves.');
  end if;
  if coalesce(p_allergen, '') not in ('yes', 'no', 'unsure') then
    perform public._hub_refuse('invalid', 'Say whether it contains a listed allergen.');
  end if;
  update public.hub_food_claims
     set what = btrim(p_what), serves = p_serves, allergen = p_allergen, updated_at = now()
   where id = fc.id;
end
$fn$;

-- LOCK-IN: "Confirm this day", one tap when nothing changed.
create or replace function public._hub_confirm_day(p_invite uuid, p_day uuid, p_staff uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare e public.hub_events; d public.hub_days; a public.hub_day_answers;
begin
  select ev.* into e from public.hub_events ev join public.hub_invites i on i.event_id = ev.id where i.id = p_invite;
  select * into d from public.hub_days where id = p_day and event_id = e.id;
  if d.id is null then perform public._hub_refuse('bad_day', 'That day is not part of this event.'); end if;
  if p_staff is null then
    if e.lockin_opens_at is not null and now() < e.lockin_opens_at then
      perform public._hub_refuse('lockin_not_open', format('Lock-in opens %s.', public._hub_day(e.lockin_opens_at, e.timezone)));
    end if;
    if now() >= d.venue_closes_at then
      perform public._hub_refuse('day_over', 'That day is over. Its answers are read-only now.');
    end if;
  end if;
  select * into a from public.hub_day_answers where invite_id = p_invite and day_id = p_day;
  if coalesce(a.attending, '') <> 'yes' then
    perform public._hub_refuse('confirm_needs_yes', 'Choose Coming or Not coming for this day first.');
  end if;
  update public.hub_day_answers set confirmed_at = now(), updated_at = now()
   where invite_id = p_invite and day_id = p_day;
end
$fn$;

-- ── 10. The boards: ONE builder, sanitized per viewer ───────────────────────
-- p_viewer: 'family' (p_invite is theirs), 'member' (a signed-in student), or
-- 'staff'. What each may see is decided HERE and nowhere else:
--   * everyone: cars, seat counts, rider names, statuses, the gap, who is not
--     yet placed, who stays nearby, meals, needs, claims, allergen COUNTS;
--   * a driver's phone: families with a seat in that car, the driver's own
--     family and staff -- and only while the driver's consent is on file;
--   * a rider family's phone: their driver and staff, only with that
--     family's own consent;
--   * a pickup spot: staff, the asking family, drivers who offered pickups
--     that day while the request is open, and the ONE accepting driver after;
--   * allergy NAMES, starter flags, override reasons, invite ids: staff only.

create or replace function public._hub_board_car(p_car uuid, p_viewer text, p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  c public.hub_cars; e public.hub_events; dr public.hub_responses;
  v_staff boolean := p_viewer = 'staff';
  v_mine boolean; v_seated boolean; v_n int; v_own boolean; v_riders jsonb; v_status text;
begin
  select * into c from public.hub_cars where id = p_car;
  select * into e from public.hub_events where id = c.event_id;
  select * into dr from public.hub_responses where invite_id = c.driver_invite_id;
  v_mine := p_viewer = 'family' and c.driver_invite_id is not null and c.driver_invite_id = p_invite;
  v_seated := p_viewer = 'family' and exists (select 1 from public.hub_seats s where s.car_id = c.id and s.invite_id = p_invite);
  select count(*) into v_n from public.hub_seats s where s.car_id = c.id;
  v_own := public._hub_own_aboard(c.id);
  v_status := case when public._hub_car_pending(c.id) then 'pending'
                   when c.arrived_at is not null then 'arrived'
                   when c.left_at is not null then 'left'
                   when v_n >= c.seats then 'full'
                   else 'filling' end;
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', public._hub_student_name(i.student_id),
           'mine', p_viewer = 'family' and s.invite_id = p_invite,
           'invite_id', case when v_staff then s.invite_id end,
           'pickup', case when v_staff or v_mine or (p_viewer = 'family' and s.invite_id = p_invite) then s.via_pickup end,
           'spot', case when (v_staff or v_mine) and s.via_pickup then pk.spot end,
           'parent_phone', case when (v_staff or v_mine) and rr.rider_phone_consent_at is not null then rr.parent_phone end,
           'override_reason', case when v_staff then s.override_reason end
         ) order by s.created_at), '[]'::jsonb)
    into v_riders
    from public.hub_seats s
    join public.hub_invites i on i.id = s.invite_id
    left join public.hub_pickups pk on pk.invite_id = s.invite_id and pk.day_id = s.day_id
    left join public.hub_responses rr on rr.invite_id = s.invite_id
   where s.car_id = c.id;

  return jsonb_build_object(
    'id', c.id,
    'run', c.run,
    'driver', public._hub_driver_name(c.id),
    'staff_car', c.driver_invite_id is null,
    'description', c.description,
    'seats', c.seats,
    'riders_count', v_n,
    'riders', v_riders,
    'leave_by', c.leave_by,
    'takes_pickups', c.takes_pickups,
    'status', v_status,
    'left_at', c.left_at,
    'arrived_at', c.arrived_at,
    'problem', public._hub_car_problem(c.id),
    'override_reason', case when v_staff then c.minor_override_reason end,
    'own_aboard', v_own,
    'needs_two', e.one_minor_rule and not v_own and v_n = 0 and c.minor_override_reason is null,
    'mine', v_mine,
    'my_seat', v_seated,
    'driver_phone', case when dr.driver_phone_consent_at is not null and (v_seated or v_mine or v_staff)
                         then dr.parent_phone end,
    'phone_note', case when c.driver_invite_id is not null and dr.driver_phone_consent_at is null
                            and (v_seated or v_staff) then 'contact_mentors' end);
end
$fn$;

create or replace function public._hub_board_run(p_day uuid, p_run text, p_viewer text, p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_event uuid; v_staff boolean := p_viewer = 'staff';
  v_unplaced jsonb; v_unplaced_n int; v_nearby jsonb; v_self int; v_driving int; v_unsure int;
  v_open int; v_cars jsonb; v_pickups jsonb; v_accepted jsonb; v_pickup_driver boolean;
begin
  select event_id into v_event from public.hub_days where id = p_day;

  with plan as (select * from public._hub_plan(v_event) p where p.day_id = p_day),
       need as (select p.* from plan p
                 where p.attending = 'yes'
                   and (case p_run when 'to' then p.eff_to else p.eff_home end) = 'carpool'
                   and not exists (select 1 from public.hub_seats s
                                    where s.day_id = p_day and s.run = p_run and s.invite_id = p.invite_id))
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', public._hub_student_name(n.student_id),
           'invite_id', case when v_staff then n.invite_id end,
           'mine', p_viewer = 'family' and n.invite_id = p_invite)
           order by public._hub_student_name(n.student_id)), '[]'::jsonb),
         count(*)
    into v_unplaced, v_unplaced_n
    from need n;

  select coalesce(jsonb_agg(public._hub_student_name(p.student_id) order by public._hub_student_name(p.student_id)), '[]'::jsonb)
    into v_nearby
    from public._hub_plan(v_event) p
   where p.day_id = p_day and p.attending = 'yes'
     and (case p_run when 'to' then p.nearby_before else p.nearby_after end);

  select count(*) filter (where (case p_run when 'to' then p.eff_to else p.eff_home end) = 'self'
                            and not (case p_run when 'to' then p.nearby_before else p.nearby_after end)),
         count(*) filter (where (case p_run when 'to' then p.eff_to else p.eff_home end) = 'driving')
    into v_self, v_driving
    from public._hub_plan(v_event) p
   where p.day_id = p_day and p.attending = 'yes';
  select count(*) into v_unsure from public._hub_plan(v_event) p where p.day_id = p_day and p.attending = 'unsure';

  select coalesce(sum(greatest(c.seats - (select count(*) from public.hub_seats s where s.car_id = c.id), 0)), 0)
    into v_open
    from public.hub_cars c
   where c.day_id = p_day and c.run = p_run and c.left_at is null and not public._hub_car_pending(c.id);

  select coalesce(jsonb_agg(public._hub_board_car(c.id, p_viewer, p_invite) order by c.created_at, c.id), '[]'::jsonb)
    into v_cars
    from public.hub_cars c where c.day_id = p_day and c.run = p_run;

  -- Open pickup requests: staff, or a family driving a car to the venue that
  -- day that takes pickups and has not left.
  v_pickup_driver := p_viewer = 'family' and p_run = 'to' and exists (
    select 1 from public.hub_cars c
     where c.day_id = p_day and c.run = 'to' and c.driver_invite_id = p_invite
       and c.takes_pickups and c.left_at is null);
  if p_run = 'to' and (v_staff or v_pickup_driver) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', pk.id,
             'name', public._hub_invite_name(pk.invite_id),
             'spot', pk.spot,
             'covers_home', pk.covers_home) order by pk.created_at), '[]'::jsonb)
      into v_pickups
      from public.hub_pickups pk
     where pk.day_id = p_day and pk.car_id is null and pk.spot is not null
       and exists (select 1 from public.hub_day_answers a where a.invite_id = pk.invite_id and a.day_id = p_day and a.attending = 'yes');
  end if;

  return jsonb_build_object(
    'run', p_run,
    'needs_seat', v_unplaced_n,
    'open_seats', v_open,
    'covered', v_open >= v_unplaced_n,
    'unplaced', v_unplaced,
    'nearby', v_nearby,
    'self_count', v_self,
    'driving_count', v_driving,
    'unsure_count', v_unsure,
    'cars', v_cars,
    'pickups', v_pickups);
end
$fn$;

create or replace function public._hub_board_meal(p_meal uuid, p_viewer text, p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  m public.hub_meals; v_staff boolean := p_viewer = 'staff';
  v_counts jsonb; v_names jsonb; v_needs jsonb; v_extras jsonb;
begin
  select * into m from public.hub_meals where id = p_meal;

  with who as (
    select p.invite_id, p.student_id, r.allergens, r.allergy_other, r.dietary
      from public._hub_plan(m.event_id) p
      left join public.hub_responses r on r.invite_id = p.invite_id
     where p.day_id = m.day_id and p.attending = 'yes'),
  tally as (
    select a as allergen, count(*) as n from who, unnest(coalesce(who.allergens, '{}'::text[])) a group by a
    union all
    select 'other', count(*) from who where nullif(btrim(who.allergy_other), '') is not null having count(*) > 0)
  select coalesce(jsonb_agg(jsonb_build_object('allergen', t.allergen, 'count', t.n)
                            order by t.n desc, t.allergen), '[]'::jsonb)
    into v_counts from tally t;

  if v_staff then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', public._hub_student_name(p.student_id),
             'allergens', r.allergens, 'other', r.allergy_other, 'dietary', r.dietary)
             order by public._hub_student_name(p.student_id)), '[]'::jsonb)
      into v_names
      from public._hub_plan(m.event_id) p
      join public.hub_responses r on r.invite_id = p.invite_id
     where p.day_id = m.day_id and p.attending = 'yes'
       and (cardinality(r.allergens) > 0 or nullif(btrim(r.allergy_other), '') is not null
            or nullif(btrim(r.dietary), '') is not null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'label', n.label, 'quantity', n.quantity,
           'starter', case when v_staff then n.starter end,
           'claim', case when fc.id is null then null else jsonb_build_object(
               'id', fc.id, 'what', fc.what, 'serves', fc.serves, 'allergen', fc.allergen,
               'family', case when fc.invite_id is null then fc.staff_label
                              else 'the ' || public._hub_family_surname(fc.invite_id) || ' family' end,
               'mine', p_viewer = 'family' and fc.invite_id = p_invite) end)
           order by n.position, n.label), '[]'::jsonb)
    into v_needs
    from public.hub_food_needs n
    left join public.hub_food_claims fc on fc.need_id = n.id
   where n.meal_id = m.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', fc.id, 'what', fc.what, 'serves', fc.serves, 'allergen', fc.allergen,
           'family', case when fc.invite_id is null then fc.staff_label
                          else 'the ' || public._hub_family_surname(fc.invite_id) || ' family' end,
           'mine', p_viewer = 'family' and fc.invite_id = p_invite)
           order by fc.created_at), '[]'::jsonb)
    into v_extras
    from public.hub_food_claims fc
   where fc.meal_id = m.id and fc.need_id is null;

  return jsonb_build_object(
    'id', m.id, 'day_id', m.day_id, 'label', m.label, 'starts_at', m.starts_at,
    'started', now() >= m.starts_at, 'truck_note', m.truck_note,
    'allergy_counts', v_counts, 'allergy_names', v_names,
    'needs', v_needs, 'extras', v_extras);
end
$fn$;

create or replace function public._hub_board(p_event uuid, p_viewer text, p_invite uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare e public.hub_events; v_days jsonb; v_meals jsonb;
begin
  select * into e from public.hub_events where id = p_event;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'date', d.day_date, 'position', d.position,
           'label', to_char(d.day_date, 'FMDay, Mon FMDD'),
           'short', to_char(d.day_date, 'Dy'),
           'title', d.title, 'intro', d.intro,
           'meet_at', d.meet_at, 'meet_place', d.meet_place, 'last_car_out_at', d.last_car_out_at,
           'captain', case when d.captain_id is null then null else public._hub_student_name(d.captain_id) end,
           'captain_id', case when p_viewer = 'staff' then d.captain_id end,
           'target_arrival_at', d.target_arrival_at, 'doors_at', d.doors_at,
           'venue_opens_at', d.venue_opens_at, 'venue_closes_at', d.venue_closes_at,
           'pits_close_at', d.pits_close_at,
           'drive_to_range', d.drive_to_range, 'drive_home_range', d.drive_home_range,
           'miles_to', d.miles_to, 'miles_home', d.miles_home,
           'ask_pit_setup', d.ask_pit_setup, 'ask_school_ride', d.ask_school_ride,
           'home_options', d.home_options, 'notes', d.notes,
           'over', now() >= d.venue_closes_at,
           'headcount', (select jsonb_build_object(
                             'students', count(*) filter (where p.attending = 'yes'),
                             'adults', coalesce(sum(p.adults) filter (where p.attending = 'yes'), 0),
                             'unsure', count(*) filter (where p.attending = 'unsure'),
                             'firm', e.lockin_due_at is not null and now() >= e.lockin_due_at)
                           from public._hub_plan(p_event) p where p.day_id = d.id),
           'runs', jsonb_build_array(public._hub_board_run(d.id, 'to', p_viewer, p_invite),
                                     public._hub_board_run(d.id, 'home', p_viewer, p_invite)))
           order by d.day_date, d.position), '[]'::jsonb)
    into v_days
    from public.hub_days d where d.event_id = p_event;

  select coalesce(jsonb_agg(public._hub_board_meal(m.id, p_viewer, p_invite) order by m.starts_at, m.position), '[]'::jsonb)
    into v_meals
    from public.hub_meals m where m.event_id = p_event;

  return jsonb_build_object('event_id', p_event, 'viewer', p_viewer, 'now', now(),
                            'one_minor_rule', e.one_minor_rule, 'days', v_days, 'meals', v_meals);
end
$fn$;

create or replace function public._hub_event_json(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'venue_name', e.venue_name, 'venue_address', e.venue_address,
    'map_url', e.map_url, 'timezone', e.timezone,
    'phase1_due_at', e.phase1_due_at, 'lockin_opens_at', e.lockin_opens_at, 'lockin_due_at', e.lockin_due_at,
    'starts_on', (select min(d.day_date) from public.hub_days d where d.event_id = e.id),
    'ends_at', public._hub_event_end(e.id),
    'over', now() >= public._hub_event_end(e.id),
    'lockin_open', e.lockin_opens_at is not null and now() >= e.lockin_opens_at,
    'one_minor_rule', e.one_minor_rule, 'driver_paperwork_required', e.driver_paperwork_required,
    'links', e.links, 'info', e.info)
  from public.hub_events e where e.id = p_event
$fn$;

-- Everything one family's page shows: their answers, their progress, the
-- board as they may see it, and the event. A staff viewer gets the same page
-- for that family (the mentor page edits through it), with the staff board.
create or replace function public._hub_family_view(p_invite uuid, p_viewer text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare i public.hub_invites; r public.hub_responses; v_days jsonb; v_food jsonb; v_name text;
begin
  select * into i from public.hub_invites where id = p_invite;
  select * into r from public.hub_responses where invite_id = p_invite;
  v_name := public._hub_student_name(i.student_id);

  select coalesce(jsonb_object_agg(p.day_id, jsonb_build_object(
           'attending', a.attending, 'adults', a.adults, 'pit_setup', a.pit_setup,
           'home_option', a.home_option, 'school_mode', a.school_mode,
           'to_mode', a.to_mode, 'home_mode', a.home_mode,
           'eff_to', p.eff_to, 'eff_home', p.eff_home,
           'nearby_before', p.nearby_before, 'nearby_after', p.nearby_after,
           'car_seats', a.offer_seats, 'car_description', a.offer_description,
           'car_leave_by', a.offer_leave_by, 'car_takes_pickups', a.offer_takes_pickups,
           'confirmed', a.confirmed_at is not null,
           'pickup', case when pk.id is null then null else jsonb_build_object(
               'spot', pk.spot, 'covers_home', pk.covers_home, 'accepted', pk.car_id is not null,
               'driver', case when pk.car_id is not null then public._hub_driver_name(pk.car_id) end) end)),
         '{}'::jsonb)
    into v_days
    from public._hub_plan(i.event_id) p
    left join public.hub_day_answers a on a.invite_id = p.invite_id and a.day_id = p.day_id
    left join public.hub_pickups pk on pk.invite_id = p.invite_id and pk.day_id = p.day_id
   where p.invite_id = p_invite;

  select coalesce(jsonb_agg(jsonb_build_object('id', fc.id, 'meal_id', fc.meal_id, 'need_id', fc.need_id,
                                               'what', fc.what, 'serves', fc.serves, 'allergen', fc.allergen)
                            order by fc.created_at), '[]'::jsonb)
    into v_food
    from public.hub_food_claims fc where fc.invite_id = p_invite;

  return jsonb_build_object(
    'invite_id', p_invite,
    'viewer', p_viewer,
    'now', now(),
    'student', jsonb_build_object('name', v_name, 'first', split_part(v_name, ' ', 1)),
    'event', public._hub_event_json(i.event_id),
    'progress', public._hub_progress(p_invite),
    'answers', jsonb_build_object(
      'response', jsonb_build_object(
        'staying_nights', r.staying_nights,
        'allergies_none', r.allergies_none, 'allergens', coalesce(r.allergens, '{}'::text[]),
        'allergy_other', r.allergy_other, 'dietary', r.dietary, 'medication', r.medication,
        'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'parent_email', r.parent_email,
        'emergency_name', r.emergency_name, 'emergency_phone', r.emergency_phone,
        'first_reg_done', r.first_reg_done, 'school_form_done', r.school_form_done,
        'driver_phone_consent', r.driver_phone_consent_at is not null,
        'rider_phone_consent', r.rider_phone_consent_at is not null,
        'driver_25', r.driver_25, 'driver_licensed', r.driver_licensed,
        'driver_paperwork_on_file', r.driver_paperwork_at is not null),
      'days', v_days,
      'food', v_food),
    'board', public._hub_board(i.event_id, p_viewer, case when p_viewer = 'family' then p_invite end));
end
$fn$;

-- ── 11. Invites, overview, export ───────────────────────────────────────────

create or replace function public._hub_uuid(p text)
returns uuid language plpgsql immutable set search_path = public, pg_temp as $fn$
begin
  if p is null then return null; end if;
  return p::uuid;
exception when others then
  perform public._hub_refuse('invalid', 'That item is not valid.');
end
$fn$;

create or replace function public._hub_int(p text)
returns int language plpgsql immutable set search_path = public, pg_temp as $fn$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return round(p::numeric)::int;
exception when others then
  perform public._hub_refuse('invalid', 'That is not a number.');
end
$fn$;

-- The current season by the app's own rule (src/seasons.js): the season whose
-- window holds today's Los Angeles date, the latest-starting if two do.
create or replace function public._hub_current_season()
returns uuid language sql stable security definer set search_path = public, pg_temp as $fn$
  select s.id from public.seasons s
   where s.start_date <= (now() at time zone 'America/Los_Angeles')::date
     and (s.end_date is null or s.end_date >= (now() at time zone 'America/Los_Angeles')::date)
   order by s.start_date desc limit 1
$fn$;

-- The parent emails on file: parent_email, plus parent_two_contact when that
-- free-text field holds an email (it is as often a phone number).
create or replace function public._hub_app_emails(p_student uuid)
returns text[] language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}')
    from (
      select case when public._hub_is_email(ma.parent_email) then lower(btrim(ma.parent_email)) end as x
        from public.member_applications ma
       where ma.member_id = p_student and ma.season_id = public._hub_current_season()
      union all
      select case when public._hub_is_email(ma.parent_two_contact) then lower(btrim(ma.parent_two_contact)) end
        from public.member_applications ma
       where ma.member_id = p_student and ma.season_id = public._hub_current_season()
    ) e
$fn$;

-- One invite per student on the roster (approved, active, a student, not
-- staff). Re-runnable: it never touches an invite's emails once set, and it
-- pre-fills the parent name, phone and email from the application once.
create or replace function public._hub_sync_invites(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_created int; v_filled int;
begin
  with roster as (
    select p.id from public.profiles p
     where p.approved and p.status = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
       and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))),
  ins as (
    insert into public.hub_invites (event_id, student_id, emails)
    select p_event, ro.id, public._hub_app_emails(ro.id) from roster ro
    on conflict (event_id, student_id) do nothing
    returning id)
  select count(*) into v_created from ins;

  with upd as (
    update public.hub_invites i set emails = public._hub_app_emails(i.student_id)
     where i.event_id = p_event and cardinality(i.emails) = 0 and cardinality(public._hub_app_emails(i.student_id)) > 0
    returning i.id)
  select count(*) into v_filled from upd;

  insert into public.hub_responses (invite_id, parent_name, parent_phone, parent_email)
  select i.id, ma.parent_name, ma.parent_phone, lower(btrim(ma.parent_email))
    from public.hub_invites i
    join public.member_applications ma on ma.member_id = i.student_id and ma.season_id = public._hub_current_season()
   where i.event_id = p_event
  on conflict (invite_id) do update
    set parent_name  = coalesce(public.hub_responses.parent_name, excluded.parent_name),
        parent_phone = coalesce(public.hub_responses.parent_phone, excluded.parent_phone),
        parent_email = coalesce(public.hub_responses.parent_email, excluded.parent_email);

  return jsonb_build_object('created', v_created, 'emails_filled', v_filled);
end
$fn$;

create or replace function public._hub_invite_status(p_invite uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce((select o.status from public.hub_outbox o where o.dedupe_key = 'invite:' || p_invite), 'none')
$fn$;

create or replace function public._hub_mail_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare i public.hub_invites; e public.hub_events; v_name text; v_parent text;
begin
  select * into i from public.hub_invites where id = p_invite;
  select * into e from public.hub_events where id = i.event_id;
  v_name := public._hub_student_name(i.student_id);
  select nullif(split_part(btrim(r.parent_name), ' ', 1), '') into v_parent from public.hub_responses r where r.invite_id = p_invite;
  perform public._hub_enqueue(e.id, 'invite', i.emails,
    format('%s: plan for %s', e.title, split_part(v_name, ' ', 1)),
    format(E'Hi %s,\n\n%s is invited to %s%s.\n\nThis is your family''s page for the trip. No account needed:\n{{link}}\n\nFour short steps: days, getting there, food, contacts.\nAnswers save as you go, and you can change them until each day happens.\n%s\nThis link is just for your family. Anyone with it can change your answers.',
           coalesce(v_parent, 'there'), v_name, e.title,
           coalesce(', ' || nullif(e.venue_name, ''), ''),
           case when e.phase1_due_at is not null
                then 'Sign-up due ' || public._hub_day(e.phase1_due_at, e.timezone) || E'.\n' else '' end)
      || public._hub_sign(),
    p_invite, 'invite:' || p_invite);
end
$fn$;

create or replace function public._hub_mail_remind(p_invite uuid, p_phase text, p_dedupe text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare i public.hub_invites; e public.hub_events; v_first text; v_due timestamptz;
begin
  select * into i from public.hub_invites where id = p_invite;
  select * into e from public.hub_events where id = i.event_id;
  v_first := split_part(public._hub_student_name(i.student_id), ' ', 1);
  v_due := case p_phase when 'phase1' then e.phase1_due_at else e.lockin_due_at end;
  perform public._hub_enqueue(e.id, 'remind_' || p_phase, i.emails,
    format('Reminder: %s %s due %s', e.title, case p_phase when 'phase1' then 'sign-up' else 'lock-in' end,
           coalesce(public._hub_day(v_due, e.timezone), 'soon')),
    case p_phase
      when 'phase1' then format(E'%s''s sign-up for %s is not finished yet.\nIt is due %s. Your answers so far are saved.\n\n{{link}}',
                                 v_first, e.title, coalesce(public._hub_day(v_due, e.timezone), 'soon'))
      else format(E'Please confirm each day for %s by %s.\nA day with no changes is one tap.\n\n{{link}}',
                  v_first, coalesce(public._hub_day(v_due, e.timezone), 'soon'))
    end || public._hub_sign(),
    p_invite, p_dedupe);
end
$fn$;

create or replace function public._hub_overview(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  e public.hub_events; v_fam jsonb; v_att jsonb; v_car jsonb; v_food jsonb; v_drivers jsonb;
  v_roster int; v_missing int; v_out jsonb;
begin
  select * into e from public.hub_events where id = p_event;
  if e.id is null then perform public._hub_refuse('event_gone', 'That event does not exist.'); end if;

  select count(*), count(*) filter (where not exists (select 1 from public.hub_invites i where i.event_id = p_event and i.student_id = p.id))
    into v_roster, v_missing
    from public.profiles p
   where p.approved and p.status = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'));

  select coalesce(jsonb_agg(f order by f ->> 'name'), '[]'::jsonb) into v_fam
    from (select jsonb_build_object(
                   'invite_id', i.id, 'student_id', i.student_id,
                   'name', public._hub_student_name(i.student_id),
                   'emails', i.emails,
                   'invite_status', public._hub_invite_status(i.id),
                   'phase1_done', (pr ->> 'phase1_done')::boolean,
                   'lockin_done', (pr ->> 'lockin_done')::boolean,
                   'missing', jsonb_array_length(pr -> 'missing'),
                   'first_reg_done', r.first_reg_done,
                   'school_form_done', r.school_form_done) as f
            from public.hub_invites i
            left join public.hub_responses r on r.invite_id = i.id
            cross join lateral (select public._hub_progress(i.id) as pr) x
           where i.event_id = p_event) q;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day_id', d.id, 'label', to_char(d.day_date, 'FMDay, Mon FMDD'),
           'yes', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending = 'yes'),
           'no', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending = 'no'),
           'unsure', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending = 'unsure'),
           'none', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending is null))
           order by d.day_date), '[]'::jsonb)
    into v_att from public.hub_days d where d.event_id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day_id', d.id, 'label', to_char(d.day_date, 'FMDay, Mon FMDD'),
           'runs', (select jsonb_agg(jsonb_build_object(
                       'run', rr.run,
                       'needs_seat', (rr.b ->> 'needs_seat')::int,
                       'open_seats', (rr.b ->> 'open_seats')::int,
                       'unplaced', rr.b -> 'unplaced',
                       'open_pickups', case when jsonb_typeof(rr.b -> 'pickups') = 'array'
                                            then jsonb_array_length(rr.b -> 'pickups') else 0 end,
                       'pending', (select coalesce(jsonb_agg(jsonb_build_object('car_id', c ->> 'id', 'driver', c ->> 'driver')), '[]'::jsonb)
                                     from jsonb_array_elements(rr.b -> 'cars') c where c ->> 'status' = 'pending'),
                       'red', (select coalesce(jsonb_agg(jsonb_build_object('car_id', c ->> 'id', 'driver', c ->> 'driver', 'problem', c ->> 'problem')), '[]'::jsonb)
                                 from jsonb_array_elements(rr.b -> 'cars') c where c ->> 'problem' is not null))
                       order by rr.run desc)
                     from (select x.run, public._hub_board_run(d.id, x.run, 'staff', null) as b
                             from (values ('to'), ('home')) x(run)) rr))
           order by d.day_date), '[]'::jsonb)
    into v_car from public.hub_days d where d.event_id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'meal_id', m.id, 'label', m.label, 'starts_at', m.starts_at,
           'open', (select coalesce(jsonb_agg(n.label order by n.position), '[]'::jsonb)
                      from public.hub_food_needs n
                     where n.meal_id = m.id and not exists (select 1 from public.hub_food_claims fc where fc.need_id = n.id)),
           'starter', (select count(*) from public.hub_food_needs n where n.meal_id = m.id and n.starter))
           order by m.starts_at, m.position), '[]'::jsonb)
    into v_food from public.hub_meals m where m.event_id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'invite_id', i.id, 'driver', coalesce(nullif(btrim(r.parent_name), ''), public._hub_student_name(i.student_id) || '''s family'),
           'student', public._hub_student_name(i.student_id),
           'on_file', r.driver_paperwork_at is not null,
           'checks', coalesce(r.driver_25, false) and coalesce(r.driver_licensed, false))
           order by public._hub_student_name(i.student_id)), '[]'::jsonb)
    into v_drivers
    from public.hub_invites i
    left join public.hub_responses r on r.invite_id = i.id
   where i.event_id = p_event
     and exists (select 1 from public.hub_day_answers a where a.invite_id = i.id and 'driving' in (a.to_mode, a.home_mode));

  select jsonb_build_object(
           'pending', count(*) filter (where o.status in ('pending', 'sending')),
           'failed', count(*) filter (where o.status = 'failed'),
           'sent', count(*) filter (where o.status = 'sent'))
    into v_out from public.hub_outbox o where o.event_id = p_event;

  return jsonb_build_object(
    'event', public._hub_event_json(p_event),
    'alert_emails', e.alert_emails,
    'roster', v_roster, 'roster_without_invite', v_missing,
    'families', v_fam,
    'attendance', v_att, 'carpool', v_car, 'food', v_food, 'drivers', v_drivers,
    'school_form_on', nullif(btrim(e.links ->> 'school_form'), '') is not null,
    'outbox', v_out);
end
$fn$;

-- One row per family with every answer, for the staff CSV (decision 18's
-- formula guard is applied where the CSV is written, src/csv.js).
create or replace function public._hub_export(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(row order by row ->> 'student'), '[]'::jsonb) from (
    select jsonb_build_object(
      'student', public._hub_student_name(i.student_id),
      'emails', array_to_string(i.emails, '; '),
      'invite', public._hub_invite_status(i.id),
      'phase1_done', (public._hub_progress(i.id) ->> 'phase1_done'),
      'lockin_done', (public._hub_progress(i.id) ->> 'lockin_done'),
      'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'parent_email', r.parent_email,
      'emergency_name', r.emergency_name, 'emergency_phone', r.emergency_phone,
      'staying_nights', array_to_string(r.staying_nights, '; '),
      'allergies_none', r.allergies_none, 'allergens', array_to_string(r.allergens, '; '),
      'allergy_other', r.allergy_other, 'dietary', r.dietary, 'medication', r.medication,
      'first_reg_done', r.first_reg_done, 'school_form_done', r.school_form_done,
      'driver_25', r.driver_25, 'driver_licensed', r.driver_licensed,
      'driver_paperwork_on_file', r.driver_paperwork_at is not null,
      'driver_phone_consent', r.driver_phone_consent_at is not null,
      'rider_phone_consent', r.rider_phone_consent_at is not null,
      'days', (select coalesce(jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day_date, 'Dy'),
                 'attending', p.attending, 'adults', p.adults, 'confirmed', a.confirmed_at is not null,
                 'pit_setup', a.pit_setup, 'home_option', a.home_option,
                 'to', p.eff_to, 'home', p.eff_home, 'school', p.school_mode,
                 'pickup_spot', pk.spot,
                 'to_car', (select public._hub_driver_name(s.car_id) from public.hub_seats s
                             where s.invite_id = i.id and s.day_id = p.day_id and s.run = 'to'),
                 'home_car', (select public._hub_driver_name(s.car_id) from public.hub_seats s
                               where s.invite_id = i.id and s.day_id = p.day_id and s.run = 'home'))
                 order by p.day_date), '[]'::jsonb)
                 from public._hub_plan(i.event_id) p
                 left join public.hub_day_answers a on a.invite_id = p.invite_id and a.day_id = p.day_id
                 left join public.hub_pickups pk on pk.invite_id = p.invite_id and pk.day_id = p.day_id
                where p.invite_id = i.id),
      'food', (select string_agg(m.label || ': ' || fc.what || ' (serves ' || fc.serves || ')', '; ' order by m.starts_at)
                 from public.hub_food_claims fc join public.hub_meals m on m.id = fc.meal_id
                where fc.invite_id = i.id)) as row
      from public.hub_invites i
      left join public.hub_responses r on r.invite_id = i.id
     where i.event_id = p_event) q
$fn$;

-- ── 12. Entry points ────────────────────────────────────────────────────────

-- FAMILIES, through the event-family Edge Function only (service role). The
-- token is the credential; a token that matches nothing raises hub:not_found
-- (P0002), which the function answers as one generic 404.
create or replace function public.hub_family_call(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_invite uuid; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  v_invite := public._hub_invite_for_token(p_token);
  if v_invite is null then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That link is not valid.';
  end if;
  case p_action
    when 'fetch' then
      return public._hub_family_view(v_invite, 'family');
    when 'save' then
      perform public._hub_save(v_invite, null, a ->> 'field', a -> 'value', public._hub_uuid(a ->> 'day_id'));
      return jsonb_build_object('ok', true, 'saved_at', now(), 'progress', public._hub_progress(v_invite));
    when 'claim_seat' then
      v := public._hub_claim_with_home(public._hub_uuid(a ->> 'car_id'), v_invite, null);
    when 'unclaim_seat' then
      perform public._hub_unclaim(public._hub_uuid(a ->> 'car_id'), v_invite, null);
    when 'mark' then
      perform public._hub_mark(public._hub_uuid(a ->> 'car_id'), a ->> 'what', v_invite, null);
    when 'pickup_accept' then
      v := public._hub_pickup_accept(public._hub_uuid(a ->> 'pickup_id'), public._hub_uuid(a ->> 'car_id'), v_invite, null);
    when 'food_claim' then
      perform public._hub_food_claim(public._hub_uuid(a ->> 'meal_id'), public._hub_uuid(a ->> 'need_id'), v_invite, null, null,
                                     a ->> 'what', public._hub_int(a ->> 'serves'), a ->> 'allergen');
    when 'food_edit' then
      perform public._hub_food_change(public._hub_uuid(a ->> 'claim_id'), v_invite, null, false,
                                      a ->> 'what', public._hub_int(a ->> 'serves'), a ->> 'allergen');
    when 'food_drop' then
      perform public._hub_food_change(public._hub_uuid(a ->> 'claim_id'), v_invite, null, true);
    when 'confirm_day' then
      perform public._hub_confirm_day(v_invite, public._hub_uuid(a ->> 'day_id'), null);
    else
      perform public._hub_refuse('unknown_action', 'That action is not part of this page.');
  end case;
  return public._hub_family_view(v_invite, 'family') || jsonb_build_object('result', v);
end
$fn$;

-- SIGNED-IN STUDENTS: the same sanitized board a family sees (no phones, no
-- spots, no names on allergies). Staff get the staff board. Anyone else --
-- unapproved, or a parent-only account (they use their link) -- is refused.
create or replace function public._hub_member_ok()
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select public.is_staff()
      or (exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)
          and public.has_role('student'))
$fn$;

create or replace function public.hub_member_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
begin
  if not public._hub_member_ok() then
    raise exception using errcode = '42501', message = 'hub:not_allowed', detail = 'Only team members can see this board.';
  end if;
  if not exists (select 1 from public.hub_events where id = p_event) then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That event does not exist.';
  end if;
  return jsonb_build_object(
    'event', public._hub_event_json(p_event),
    'board', public._hub_board(p_event, case when public.is_staff() then 'staff' else 'member' end, null));
end
$fn$;

create or replace function public.hub_member_events()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
begin
  if not public._hub_member_ok() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'title', e.title, 'venue_name', e.venue_name,
             'starts_on', (select min(d.day_date) from public.hub_days d where d.event_id = e.id),
             'ends_at', public._hub_event_end(e.id),
             'over', now() >= public._hub_event_end(e.id))
             order by (select min(d.day_date) from public.hub_days d where d.event_id = e.id))
      from public.hub_events e
     where public.is_staff()
        or coalesce(public._hub_event_end(e.id) > now() - interval '7 days', true)), '[]'::jsonb);
end
$fn$;

-- STAFF: every family action, on any family, through THE SAME rule
-- functions; plus invites, reminders, cars, overrides and exports.
create or replace function public.hub_staff_call(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_staff uuid := auth.uid(); a jsonb := coalesce(p_args, '{}'::jsonb);
  v_event uuid; v_invite uuid; v_car uuid; v_day uuid; v jsonb; v_n int; v_list text[]; c public.hub_cars; r record;
begin
  if not public.is_staff() then
    raise exception using errcode = '42501', message = 'hub:not_allowed', detail = 'Staff only.';
  end if;
  v_event := public._hub_uuid(a ->> 'event_id');
  v_invite := public._hub_uuid(a ->> 'invite_id');
  v_car := public._hub_uuid(a ->> 'car_id');
  v_day := public._hub_uuid(a ->> 'day_id');

  case p_action
    when 'overview' then
      return public._hub_overview(v_event);
    when 'board' then
      return jsonb_build_object('event', public._hub_event_json(v_event), 'board', public._hub_board(v_event, 'staff', null));
    when 'family' then
      return public._hub_family_view(v_invite, 'staff')
             || jsonb_build_object('emails', (select emails from public.hub_invites where id = v_invite),
                                   'invite_status', public._hub_invite_status(v_invite));
    when 'save' then
      perform public._hub_save(v_invite, v_staff, a ->> 'field', a -> 'value', v_day);
      return jsonb_build_object('ok', true, 'saved_at', now(), 'progress', public._hub_progress(v_invite));
    when 'move' then
      -- car_id null: take the student out of their car on (day, run).
      if v_car is null then
        for r in select s.car_id from public.hub_seats s
                  where s.invite_id = v_invite and s.day_id = v_day and s.run = a ->> 'run' loop
          perform public._hub_unclaim(r.car_id, v_invite, v_staff);
        end loop;
        v := jsonb_build_object('result', 'unseated');
      else
        v := jsonb_build_object('result', public._hub_claim(v_car, v_invite, v_staff, a ->> 'override_reason'));
      end if;
    when 'mark' then
      perform public._hub_mark(v_car, a ->> 'what', null, v_staff, a ->> 'override_reason');
    when 'undo_mark' then
      update public.hub_cars set left_at = null, arrived_at = null, updated_at = now() where id = v_car;
    when 'override' then
      if nullif(btrim(a ->> 'override_reason'), '') is null then
        perform public._hub_refuse('invalid', 'An override needs a reason.');
      end if;
      update public.hub_cars set minor_override_reason = btrim(a ->> 'override_reason'), minor_override_by = v_staff,
             minor_override_at = now(), updated_at = now() where id = v_car;
    when 'pickup_accept' then
      v := public._hub_pickup_accept(public._hub_uuid(a ->> 'pickup_id'), v_car, null, v_staff, a ->> 'override_reason');
    when 'paperwork' then
      insert into public.hub_responses (invite_id) values (v_invite) on conflict (invite_id) do nothing;
      update public.hub_responses
         set driver_paperwork_at = case when (a ->> 'on')::boolean then now() end,
             driver_paperwork_by = case when (a ->> 'on')::boolean then v_staff end,
             updated_at = now(), staff_updated_by = v_staff
       where invite_id = v_invite;
    when 'confirm_day' then
      perform public._hub_confirm_day(v_invite, v_day, v_staff);
    when 'food_claim' then
      perform public._hub_food_claim(public._hub_uuid(a ->> 'meal_id'), public._hub_uuid(a ->> 'need_id'), v_invite, v_staff,
                                     a ->> 'staff_label', a ->> 'what', public._hub_int(a ->> 'serves'), a ->> 'allergen');
    when 'food_edit' then
      perform public._hub_food_change(public._hub_uuid(a ->> 'claim_id'), null, v_staff, false,
                                      a ->> 'what', public._hub_int(a ->> 'serves'), a ->> 'allergen');
    when 'food_drop' then
      perform public._hub_food_change(public._hub_uuid(a ->> 'claim_id'), null, v_staff, true);
    when 'sync_invites' then
      return public._hub_sync_invites(v_event);
    when 'invite_preview' then
      return jsonb_build_object(
        'to_send', (select count(*) from public.hub_invites i where i.event_id = v_event
                      and cardinality(i.emails) > 0 and public._hub_invite_status(i.id) = 'none'),
        'already', (select count(*) from public.hub_invites i where i.event_id = v_event
                      and public._hub_invite_status(i.id) <> 'none'),
        'no_email', (select coalesce(jsonb_agg(public._hub_student_name(i.student_id) order by public._hub_student_name(i.student_id)), '[]'::jsonb)
                       from public.hub_invites i where i.event_id = v_event and cardinality(i.emails) = 0));
    when 'send_invites' then
      v_n := 0;
      for r in select i.id from public.hub_invites i
                where i.event_id = v_event and cardinality(i.emails) > 0 and public._hub_invite_status(i.id) = 'none' loop
        perform public._hub_mail_invite(r.id);
        v_n := v_n + 1;
      end loop;
      return jsonb_build_object('queued', v_n);
    when 'remind_preview', 'remind' then
      if coalesce(a ->> 'phase', '') not in ('phase1', 'lockin') then
        perform public._hub_refuse('invalid', 'Choose sign-up or lock-in.');
      end if;
      v_n := 0;
      for r in select i.id from public.hub_invites i
                where i.event_id = v_event and cardinality(i.emails) > 0
                  and public._hub_invite_status(i.id) in ('pending', 'sending', 'sent')
                  and not (public._hub_progress(i.id) ->> (case a ->> 'phase' when 'phase1' then 'phase1_done' else 'lockin_done' end))::boolean loop
        if p_action = 'remind' then
          perform public._hub_mail_remind(r.id, a ->> 'phase',
            'remind:manual:' || (a ->> 'phase') || ':' || r.id || ':' || to_char(now(), 'YYYY-MM-DD-HH24'));
        end if;
        v_n := v_n + 1;
      end loop;
      return jsonb_build_object(case when p_action = 'remind' then 'queued' else 'count' end, v_n);
    when 'retry_failed' then
      update public.hub_outbox set status = 'pending', attempts = 0, last_error = null
       where event_id = v_event and status = 'failed';
      get diagnostics v_n = row_count;
      return jsonb_build_object('requeued', v_n);
    when 'set_emails' then
      select coalesce(array_agg(distinct lower(btrim(x))), '{}') into v_list
        from jsonb_array_elements_text(coalesce(a -> 'emails', '[]'::jsonb)) x where btrim(x) <> '';
      if exists (select 1 from unnest(v_list) x where not public._hub_is_email(x)) then
        perform public._hub_refuse('invalid', 'One of those is not an email address.');
      end if;
      update public.hub_invites set emails = v_list where id = v_invite;
    when 'reset_links' then
      update public.hub_invite_tokens set revoked_at = now() where invite_id = v_invite and revoked_at is null;
      get diagnostics v_n = row_count;
      return jsonb_build_object('revoked', v_n);
    when 'add_car' then
      insert into public.hub_cars (event_id, day_id, run, driver_label, seats, description, leave_by, takes_pickups)
      select d.event_id, d.id, a ->> 'run', nullif(btrim(a ->> 'driver_label'), ''), public._hub_int(a ->> 'seats'),
             btrim(a ->> 'description'), nullif(a ->> 'leave_by', '')::timestamptz, coalesce((a ->> 'takes_pickups')::boolean, false)
        from public.hub_days d where d.id = v_day
      returning id into v_car;
      v := jsonb_build_object('car_id', v_car);
    when 'edit_car' then
      select * into c from public.hub_cars where id = v_car for update;
      if public._hub_int(a ->> 'seats') < (select count(*) from public.hub_seats where car_id = v_car) then
        perform public._hub_refuse('seats_below_riders', 'More students ride in this car than that. Move one first.');
      end if;
      update public.hub_cars
         set seats = coalesce(public._hub_int(a ->> 'seats'), seats),
             description = coalesce(nullif(btrim(a ->> 'description'), ''), description),
             driver_label = case when driver_invite_id is null then coalesce(nullif(btrim(a ->> 'driver_label'), ''), driver_label) else driver_label end,
             leave_by = case when a ? 'leave_by' then nullif(a ->> 'leave_by', '')::timestamptz else leave_by end,
             takes_pickups = coalesce((a ->> 'takes_pickups')::boolean, takes_pickups),
             updated_at = now()
       where id = v_car;
    when 'remove_car' then
      select * into c from public.hub_cars where id = v_car for update;
      if c.left_at is not null then
        perform public._hub_refuse('car_left', 'That car already left.');
      end if;
      if c.driver_invite_id is not null then
        perform public._hub_refuse('family_car', 'This is a family''s car. Change their answer for this day instead.');
      end if;
      for r in select s.invite_id from public.hub_seats s where s.car_id = v_car loop
        perform public._hub_drop_seat(v_car, r.invite_id, 'staff');
      end loop;
      delete from public.hub_cars where id = v_car;
    when 'export' then
      return public._hub_export(v_event);
    else
      perform public._hub_refuse('unknown_action', 'That action is not part of this page.');
  end case;
  return jsonb_build_object('ok', true) || coalesce(v, '{}'::jsonb);
end
$fn$;

-- ── 13. Mail: the queue the Edge Function drains (service role only) ────────

-- Take up to p_limit pending rows and mark them 'sending'. A row stuck in
-- 'sending' for 15 minutes (a send that died mid-way) is taken again.
create or replace function public.hub_outbox_take(p_limit int default 25, p_event uuid default null)
returns setof public.hub_outbox language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  return query
  update public.hub_outbox o
     set status = 'sending', attempts = o.attempts + 1, taken_at = now()
   where o.id in (select x.id from public.hub_outbox x
                   where (x.status = 'pending' or (x.status = 'sending' and x.taken_at < now() - interval '15 minutes'))
                     and (p_event is null or x.event_id = p_event)
                   order by x.created_at
                   limit greatest(1, least(coalesce(p_limit, 25), 100))
                   for update skip locked)
  returning o.*;
end
$fn$;

-- The link for one email, minted at send time. Null when the email carries none.
create or replace function public.hub_outbox_mint_link(p_outbox uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_invite uuid;
begin
  select link_invite_id into v_invite from public.hub_outbox where id = p_outbox and status = 'sending';
  if v_invite is null then return null; end if;
  return public._hub_mint_token(v_invite);
end
$fn$;

create or replace function public.hub_outbox_done(p_outbox uuid, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = public, pg_temp as $fn$
  update public.hub_outbox
     set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 500) end
   where id = p_outbox
$fn$;

-- "Lost your link?" Always the same answer to the caller (the function
-- returns nothing either way). A link goes out only to an address an invite
-- (or the family's own contact answer) carries, at most 3 times an hour.
create or replace function public.hub_resend_request(p_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v text := lower(btrim(coalesce(p_email, ''))); r record;
begin
  if not public._hub_is_email(v) or length(v) > 200 then return; end if;
  insert into public.hub_resend_log (email) values (v);
  if (select count(*) from public.hub_resend_log where email = v and at > now() - interval '1 hour') > 3 then
    return;
  end if;
  for r in select i.id, i.event_id, i.student_id, e.title
             from public.hub_invites i
             join public.hub_events e on e.id = i.event_id
             left join public.hub_responses rs on rs.invite_id = i.id
            where (v = any(i.emails) or v = lower(btrim(rs.parent_email)))
              and now() < public._hub_event_end(e.id) + interval '1 day' loop
    perform public._hub_enqueue(r.event_id, 'resend', array[v],
      format('Your %s link for %s', r.title, split_part(public._hub_student_name(r.student_id), ' ', 1)),
      format(E'Here is your family''s page for %s at %s:\n{{link}}\n\nThis link is just for your family. If you did not ask for it, you can ignore this email.',
             public._hub_student_name(r.student_id), r.title) || public._hub_sign(),
      r.id);
  end loop;
end
$fn$;

-- The hourly tick: reminders 3 days and 1 day before each due date to
-- families not done (whose invite went out), and "lock-in is open" once.
-- Each window runs until the next one starts, so a missed tick never sends
-- two reminders at once; every email carries a dedupe key, so a tick that
-- runs twice sends nothing twice.
create or replace function public.hub_cron_enqueue()
returns int language plpgsql security definer set search_path = public, pg_temp as $fn$
declare e record; i record; v_n int := 0; v_phase text; v_due timestamptz; v_lead text;
begin
  delete from public.hub_resend_log where at < now() - interval '1 day';
  for e in select ev.* from public.hub_events ev where now() < public._hub_event_end(ev.id) loop
    foreach v_phase in array array['phase1', 'lockin'] loop
      v_due := case v_phase when 'phase1' then e.phase1_due_at else e.lockin_due_at end;
      continue when v_due is null or now() >= v_due;
      v_lead := case when now() >= v_due - interval '1 day' then '1d'
                     when now() >= v_due - interval '3 days' then '3d' end;
      continue when v_lead is null;
      continue when v_phase = 'lockin' and (e.lockin_opens_at is null or now() < e.lockin_opens_at);
      for i in select iv.id from public.hub_invites iv
                where iv.event_id = e.id and cardinality(iv.emails) > 0
                  and public._hub_invite_status(iv.id) = 'sent'
                  and not (public._hub_progress(iv.id) ->> (case v_phase when 'phase1' then 'phase1_done' else 'lockin_done' end))::boolean loop
        perform public._hub_mail_remind(i.id, v_phase, 'remind:' || v_phase || ':' || v_lead || ':' || i.id);
        v_n := v_n + 1;
      end loop;
    end loop;

    if e.lockin_opens_at is not null and now() >= e.lockin_opens_at
       and now() < coalesce(e.lockin_due_at, public._hub_event_end(e.id)) then
      for i in select iv.id, iv.emails, iv.student_id from public.hub_invites iv
                where iv.event_id = e.id and cardinality(iv.emails) > 0
                  and public._hub_invite_status(iv.id) = 'sent' loop
        perform public._hub_enqueue(e.id, 'lockin_open', i.emails,
          format('%s: lock-in is open', e.title),
          format(E'Please confirm each day for %s%s.\nA day with no changes is one tap. Changes are still fine after that.\n\n{{link}}',
                 split_part(public._hub_student_name(i.student_id), ' ', 1),
                 coalesce(' by ' || public._hub_day(e.lockin_due_at, e.timezone), '')) || public._hub_sign(),
          i.id, 'lockin_open:' || i.id);
        v_n := v_n + 1;
      end loop;
    end if;
  end loop;
  return v_n;
end
$fn$;

-- 14 DAYS AFTER AN EVENT ENDS: every pickup spot and both phone consents are
-- cleared. Pure SQL, run daily by pg_cron below; it needs no secret.
create or replace function public.hub_retention_sweep()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_spots int; v_consents int;
begin
  update public.hub_pickups pk set spot = null, consent_at = null, updated_at = now()
   where pk.spot is not null
     and exists (select 1 from public.hub_days d
                  where d.id = pk.day_id and public._hub_event_end(d.event_id) < now() - interval '14 days');
  get diagnostics v_spots = row_count;
  update public.hub_responses r set driver_phone_consent_at = null, rider_phone_consent_at = null
   where (r.driver_phone_consent_at is not null or r.rider_phone_consent_at is not null)
     and exists (select 1 from public.hub_invites i
                  where i.id = r.invite_id and public._hub_event_end(i.event_id) < now() - interval '14 days');
  get diagnostics v_consents = row_count;
  return jsonb_build_object('spots_cleared', v_spots, 'consents_cleared', v_consents);
end
$fn$;

-- ── 14. Scheduling (pg_cron -> pg_net -> event-family) ──────────────────────
-- The discord_calendar.sql pattern: a private config row, a SECURITY DEFINER
-- invoker that POSTs with the shared secret in an x-cron-secret header, and a
-- cron.schedule entry. Its OWN config row: filling it in activates nothing
-- else, and filling in push_config does not activate this. Null
-- edge_base_url = the tick no-ops, which is the pause switch.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists private;

create table if not exists private.event_hub_config (
  id            int primary key default 1 check (id = 1),
  edge_base_url text,   -- https://<project-ref>.functions.supabase.co
  hook_secret   text,   -- must equal the EVENT_HUB_CRON_SECRET function secret
  created_at    timestamptz not null default now()
);
insert into private.event_hub_config (id) values (1) on conflict (id) do nothing;
alter table private.event_hub_config enable row level security;

create or replace function public.invoke_event_hub_tick()
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_cfg private.event_hub_config;
begin
  select * into v_cfg from private.event_hub_config where id = 1;
  if v_cfg.edge_base_url is null or v_cfg.hook_secret is null then return; end if;
  perform net.http_post(
    url     := v_cfg.edge_base_url || '/event-family',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cfg.hook_secret),
    body    := jsonb_build_object('action', 'cron'));
end
$fn$;

select cron.unschedule('event-hub-tick') where exists (select 1 from cron.job where jobname = 'event-hub-tick');
select cron.schedule('event-hub-tick', '7 * * * *', $cron$ select public.invoke_event_hub_tick() $cron$);
select cron.unschedule('event-hub-retention') where exists (select 1 from cron.job where jobname = 'event-hub-retention');
select cron.schedule('event-hub-retention', '17 11 * * *', $cron$ select public.hub_retention_sweep() $cron$);

-- ── 15. Function grants ─────────────────────────────────────────────────────
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon and authenticated directly, so each is revoked BY NAME, then granted
-- back to exactly who calls it:
--   service_role   hub_family_call, hub_resend_request, hub_outbox_take,
--                  hub_outbox_mint_link, hub_outbox_done, hub_cron_enqueue
--                  (the event-family Edge Function)
--   authenticated  hub_member_board, hub_member_events, hub_staff_call
--                  (each checks who is calling inside)
--   nobody         every _hub_* helper, hub_retention_sweep and
--                  invoke_event_hub_tick (pg_cron runs as the owner)
do $fngrants$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like '\_hub\_%' or p.proname like 'hub\_%' or p.proname = 'invoke_event_hub_tick')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end
$fngrants$;

grant execute on function public.hub_family_call(text, text, jsonb) to service_role;
grant execute on function public.hub_resend_request(text) to service_role;
grant execute on function public.hub_outbox_take(int, uuid) to service_role;
grant execute on function public.hub_outbox_mint_link(uuid) to service_role;
grant execute on function public.hub_outbox_done(uuid, boolean, text) to service_role;
grant execute on function public.hub_cron_enqueue() to service_role;
grant execute on function public.hub_member_board(uuid) to authenticated;
grant execute on function public.hub_member_events() to authenticated;
grant execute on function public.hub_staff_call(text, jsonb) to authenticated;
