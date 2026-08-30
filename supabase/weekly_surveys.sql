-- ============================================================
-- Weekly survey
--
-- RUN THIS IN THE SUPABASE SQL EDITOR BEFORE TESTING. /survey and /surveys
-- both read the objects created here; without it every load fails with
-- "relation public.surveys does not exist".
--
-- Re-runnable: every create is if-not-exists / or-replace, every policy is
-- dropped before it is created, and the seed is keyed on a fixed uuid with
-- on conflict do nothing.
--
-- What this is: a short survey a student fills out on a phone, standing in the
-- shop, once a week. It is SEPARATE from the per-season member application
-- (supabase/member_applications.sql) -- that is onboarding, this is a recurring
-- pulse check whose questions rotate week to week. That rotation is the whole
-- reason questions are ROWS rather than a hardcoded form: question 5 below is
-- about one October competition and will be a different question next week,
-- and swapping it must not be a deploy.
--
-- WHAT UNDOES THIS MIGRATION (nothing else here is touched, and no existing
-- table, policy, function or grant is modified by this file):
--
--   drop table if exists public.survey_answers   cascade;
--   drop table if exists public.survey_responses cascade;
--   drop table if exists public.survey_questions cascade;
--   drop table if exists public.surveys          cascade;
--
-- The four drops are enough: every index, constraint and policy created below
-- belongs to one of those four tables and goes with it. public.is_staff() is
-- NOT dropped -- it predates this file (supabase/skills_catalog.sql) and other
-- modules depend on it.
-- ============================================================

-- ── 1. surveys ───────────────────────────────────────────────────────────────
create table if not exists public.surveys (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  -- Both nullable: a survey opened by hand needs no window, and a survey with
  -- a window still needs is_open, because "scheduled" and "live" are different
  -- states and a mentor must be able to pull one back without editing dates.
  opens_at    timestamptz,
  closes_at   timestamptz,
  is_open     boolean     not null default false,
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint surveys_title_chk  check (length(btrim(title)) > 0),
  constraint surveys_window_chk check (opens_at is null or closes_at is null or closes_at > opens_at)
);

-- AT MOST ONE OPEN SURVEY, enforced by the database rather than by the client.
-- The member surface resolves "the single currently-open survey" and would
-- otherwise have to pick arbitrarily between two; this makes that case
-- unreachable instead of picking. ((true)) is the constant-expression form of
-- a whole-table partial unique index.
--
-- CONSEQUENCE, and it is deliberate: opening survey B while A is open RAISES
-- rather than silently closing A. The admin page therefore closes the open one
-- first and then opens the new one, as two writes -- see SurveysAdmin.jsx. If
-- two mentors race, the index is what decides, and the loser gets an error
-- instead of a second open survey.
create unique index if not exists surveys_one_open_idx
  on public.surveys ((true)) where (is_open);

create index if not exists surveys_created_idx on public.surveys (created_at desc);

-- ── 2. survey_questions ──────────────────────────────────────────────────────
create table if not exists public.survey_questions (
  id          uuid        primary key default gen_random_uuid(),
  survey_id   uuid        not null references public.surveys(id) on delete cascade,
  position    integer     not null default 0,
  kind        text        not null,
  prompt      text        not null,
  -- Shape depends on kind:
  --   single / multi -> a json array of option strings
  --   scale          -> {"min":1,"max":5,"min_label":"...","max_label":"..."}
  --   text           -> unused, stays []
  options     jsonb       not null default '[]'::jsonb,
  required    boolean     not null default false,
  created_at  timestamptz not null default now(),

  constraint survey_questions_kind_chk   check (kind in ('single', 'multi', 'scale', 'text')),
  constraint survey_questions_prompt_chk check (length(btrim(prompt)) > 0),
  -- ONLY 'single' MAY BE REQUIRED. This is the product rule ("everything else
  -- is skippable") written where it cannot drift: the client honours it too,
  -- but a mentor authoring a required free-text box through any other path is
  -- rejected here rather than quietly shipping a survey nobody can finish in
  -- ninety seconds.
  constraint survey_questions_required_chk check (required = false or kind = 'single')
);

-- Deliberately an INDEX, not a unique constraint on (survey_id, position).
-- Reordering swaps two positions, and PostgREST issues each update as its own
-- statement, so a unique constraint would reject the intermediate state of
-- every swap. Ties are broken by id in the client's order-by, so ordering is
-- still deterministic when two rows share a position.
create index if not exists survey_questions_survey_idx
  on public.survey_questions (survey_id, position, id);

-- ── 3. survey_responses ──────────────────────────────────────────────────────
-- One row per member per survey. This table is the submission; the answers
-- hang off it.
create table if not exists public.survey_responses (
  id           uuid        primary key default gen_random_uuid(),
  survey_id    uuid        not null references public.surveys(id) on delete cascade,
  member_id    uuid        not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),

  constraint survey_responses_once unique (survey_id, member_id)
);

create index if not exists survey_responses_member_idx on public.survey_responses (member_id);

-- ── 4. survey_answers ────────────────────────────────────────────────────────
create table if not exists public.survey_answers (
  id          uuid  primary key default gen_random_uuid(),
  response_id uuid  not null references public.survey_responses(id) on delete cascade,
  question_id uuid  not null references public.survey_questions(id) on delete cascade,
  -- single -> "Mechanical"   multi -> ["Mechanical","CAD"]
  -- scale  -> 3              text  -> "the shooter mount is missing bolts"
  value       jsonb not null,

  constraint survey_answers_once unique (response_id, question_id),
  -- A SKIPPED QUESTION STORES NO ROW. These three forms are what "skipped"
  -- looks like if it leaks through as a row anyway -- an empty string from an
  -- untouched textarea, an empty array from a multi nobody tapped, or a json
  -- null. Rejecting them here means the aggregate on the results page counts
  -- real answers and never has to filter blanks out afterwards.
  constraint survey_answers_nonempty_chk check (
    jsonb_typeof(value) <> 'null'
    and value <> '""'::jsonb
    and value <> '[]'::jsonb
  )
);

create index if not exists survey_answers_response_idx on public.survey_answers (response_id);
create index if not exists survey_answers_question_idx on public.survey_answers (question_id);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- Mentor is public.is_staff() from supabase/skills_catalog.sql -- mentor, lead
-- or admin. No new role check is introduced by this file.
alter table public.surveys          enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers   enable row level security;

-- Surveys and questions: readable by any signed-in member, writable by staff.
drop policy if exists "surveys select all" on public.surveys;
create policy "surveys select all"
  on public.surveys for select to authenticated
  using (true);

drop policy if exists "surveys write staff" on public.surveys;
create policy "surveys write staff"
  on public.surveys for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "survey_questions select all" on public.survey_questions;
create policy "survey_questions select all"
  on public.survey_questions for select to authenticated
  using (true);

drop policy if exists "survey_questions write staff" on public.survey_questions;
create policy "survey_questions write staff"
  on public.survey_questions for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Responses: a member inserts exactly one row per survey, for themselves only,
-- and only while that survey is open. member_id is checked against auth.uid()
-- so a forged id in the request body is rejected by the policy rather than
-- trusted; the survey_responses_once unique constraint is what makes it
-- exactly one rather than at most one per statement.
--
-- The `is_open` clause is not decoration: without it a member could POST a
-- response to last month's closed survey and land rows in a dataset a mentor
-- has already read and acted on.
drop policy if exists "survey_responses insert own" on public.survey_responses;
create policy "survey_responses insert own"
  on public.survey_responses for insert to authenticated
  with check (
    member_id = auth.uid()
    and exists (select 1 from public.surveys s where s.id = survey_id and s.is_open)
  );

-- A member reads their own submission and nothing else. Staff read every one.
drop policy if exists "survey_responses select own or staff" on public.survey_responses;
create policy "survey_responses select own or staff"
  on public.survey_responses for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

-- Answers: insertable only against a response the caller owns. The subquery
-- reads survey_responses under that table's own RLS, so it can only ever match
-- a row the caller is allowed to see -- which, per the policy above, is their
-- own. Staff are NOT given an insert path: nobody answers on a member's behalf.
drop policy if exists "survey_answers insert own response" on public.survey_answers;
create policy "survey_answers insert own response"
  on public.survey_answers for insert to authenticated
  with check (
    exists (
      select 1 from public.survey_responses r
      where r.id = response_id and r.member_id = auth.uid()
    )
  );

drop policy if exists "survey_answers select own or staff" on public.survey_answers;
create policy "survey_answers select own or staff"
  on public.survey_answers for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.survey_responses r
      where r.id = response_id and r.member_id = auth.uid()
    )
  );

-- NO UPDATE AND NO DELETE POLICY on responses or answers, for anyone, staff
-- included. A submitted answer is a record of what somebody said at the time.
-- EDITING A SUBMISSION IS THEREFORE NOT OFFERED -- the member surface shows an
-- already-submitted state instead of reopening the form. The alternative the
-- brief allows, a server-side resubmit-that-replaces, would need a SECURITY
-- DEFINER RPC to delete and reinsert; it is not built, so the client has no
-- path to try and no way to fail silently.

grant select, insert, update, delete on public.surveys          to authenticated;
grant select, insert, update, delete on public.survey_questions to authenticated;
grant select, insert                 on public.survey_responses to authenticated;
grant select, insert                 on public.survey_answers   to authenticated;

-- The bootstrap ALTER DEFAULT PRIVILEGES grants authenticated everything on a
-- new public table, so the grants above TAKE NOTHING AWAY. Without these
-- revokes an update or delete on a submitted answer is blocked only by the
-- absence of a policy, which fails SILENTLY at 0 rows -- the same class of bug
-- the roster role edits hit. Revoking makes it raise 42501 instead.
revoke update, delete, truncate on public.survey_responses from authenticated;
revoke update, delete, truncate on public.survey_answers   from authenticated;
revoke truncate on public.surveys          from authenticated;
revoke truncate on public.survey_questions from authenticated;

-- Policy scoping is likewise not the anon barrier, for the same reason.
revoke all on public.surveys          from anon;
revoke all on public.survey_questions from anon;
revoke all on public.survey_responses from anon;
revoke all on public.survey_answers   from anon;

-- ── 6. Seed: the first survey ────────────────────────────────────────────────
-- Fixed uuids so this block is re-runnable and so the question rows can be
-- written without a returning-clause round trip. created_by is left null: this
-- file runs in the SQL editor, where auth.uid() is null, and a fabricated
-- author would be a lie about who wrote it.
--
-- opens_at is LEFT NULL on purpose. It was written as 2026-08-31 first, and the
-- member surface then correctly reported "no survey open" when the migration
-- was pasted on the 30th -- a survey seeded as open that nobody can see is the
-- worst of both states. is_open is the switch; the window's job here is only to
-- stop a survey nobody closed from staying live into October, so the END is set
-- and the start is not.
insert into public.surveys (id, title, is_open, opens_at, closes_at)
values (
  '5b1f0a10-0000-4000-8000-000000000001',
  'Week of Aug 31',
  true,
  null,
  '2026-09-07T00:00:00-07:00'
)
on conflict (id) do nothing;

insert into public.survey_questions (id, survey_id, position, kind, prompt, options, required)
values
  -- TODO: options not decided yet. Fill in the subteam values before this goes
  -- out. The canonical 12-value list lives in src/subteams.js and is mirrored
  -- by member_applications_subteam_values_chk -- if the intent is "the same
  -- subteams the rest of the app uses", paste those strings here verbatim
  -- rather than retyping them, because profiles.subteams keys off the exact
  -- text with no constraint to catch a recasing.
  ('5b1f0a10-0000-4000-8000-000000000011', '5b1f0a10-0000-4000-8000-000000000001', 1,
   'single', 'Which subteam are you on right now?', '[]'::jsonb, true),

  -- TODO: options not decided yet. Training topics for this week -- these are
  -- expected to change week to week, which is exactly why they are rows.
  ('5b1f0a10-0000-4000-8000-000000000012', '5b1f0a10-0000-4000-8000-000000000001', 2,
   'multi', 'What do you want covered in training this week?', '[]'::jsonb, false),

  ('5b1f0a10-0000-4000-8000-000000000013', '5b1f0a10-0000-4000-8000-000000000001', 3,
   'text', 'What is blocking you?', '[]'::jsonb, false),

  ('5b1f0a10-0000-4000-8000-000000000014', '5b1f0a10-0000-4000-8000-000000000001', 4,
   'text', 'Anything the mentors should know?', '[]'::jsonb, false),

  -- The rotating question. Next week this row is replaced, not the client.
  ('5b1f0a10-0000-4000-8000-000000000015', '5b1f0a10-0000-4000-8000-000000000001', 5,
   'single', 'Can you make SoCal Showdown, Oct 9 to 11?',
   '["Yes", "No", "Not sure"]'::jsonb, true)
on conflict (id) do nothing;

-- ── 7. Verify (expected shapes) ──────────────────────────────────────────────
-- select id, title, is_open, opens_at, closes_at from public.surveys order by created_at desc;
-- select position, kind, required, prompt, options from public.survey_questions
--   where survey_id = '5b1f0a10-0000-4000-8000-000000000001' order by position, id;
-- select count(*) from public.surveys where is_open;   -- must be 0 or 1, never more
