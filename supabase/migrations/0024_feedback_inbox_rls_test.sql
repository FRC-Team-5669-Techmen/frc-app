-- ============================================================
-- 0024_feedback_inbox test. Run AFTER 0024. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; its requests, notices, queued mail and
-- answers never persist, and the push it checks is recorded by pg_net only
-- inside this transaction (rolled back with it, so nothing is sent).
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Actors: students A and B, a mentor M who is not an admin, an admin AD.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.feedback_reply(uuid, text)') is null then
    raise exception 'Cannot test: 0024_feedback_inbox.sql has not been applied';
  end if;
end
$applied$;

create temp table t24_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t24_fx (a uuid, b uuid, m uuid, ad uuid, sr1 uuid, sr2 uuid, fb uuid, push_before int, push_url text) on commit drop;
grant all on t24_fx, t24_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t24_fx (a, b, m, ad)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select r.member_id from public.member_roles r where r.role = 'mentor'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin') order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1);

do $pre$
declare f t24_fx;
begin
  select * into f from t24_fx;
  if f.b is null or f.m is null or f.ad is null then raise exception 'Cannot test: need two students, a mentor who is not an admin, and an admin'; end if;
end
$pre$;

-- Push is "deployed" for this transaction only, so the trigger posts (to the
-- pg_net queue, which this transaction then rolls back).
update private.push_config set edge_base_url = 'https://push.example.invalid', hook_secret = 'test' where id = 1;

create function pg_temp.act(p_who uuid, p_email text default null) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated', 'email', p_email)::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end
$fn$;
create function pg_temp.clear() returns void language plpgsql as $fn$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;
create function pg_temp.rec(n int, name text, ok boolean, detail text) returns void language sql as $fn$
  insert into t24_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
$fn$;
create function pg_temp.call_as(p_who uuid, p_sql text, p_email text default null) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who, p_email);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.clear();
  return v;
end
$fn$;
create function pg_temp.exec_as(p_who uuid, p_sql text, p_email text default null) returns text language plpgsql as $fn$
declare v text := 'ok';
begin
  perform pg_temp.act(p_who, p_email);
  begin
    execute p_sql;
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.clear();
  return v;
end
$fn$;
create function pg_temp.pushes(p_kind text) returns int language sql as $fn$
  select count(*)::int from net._requests where url like '%/send-push' and body::text like '%' || p_kind || '%'
$fn$;

-- (A requester has no read policy, so an insert with RETURNING would be
-- refused; exec_as runs the plain insert and the owner counts the rows.)
-- Two pending sign-out requests, A and B.
update t24_fx set sr1 = gen_random_uuid(), sr2 = gen_random_uuid();
insert into public.signout_requests (id, member_id, note, cleanup_confirmed, location)
select sr1, a, 'Wired the intake', true, 'shop' from t24_fx
union all select sr2, b, 'Programmed auto', true, 'shop' from t24_fx;

-- 1-3. A send-back tells the student (a notice and a push, with the note);
-- an approval does not.
do $c$
declare f t24_fx; r text; n_note int; n_push int; r2 text;
begin
  select * into f from t24_fx;
  r := pg_temp.call_as(f.m, format('select (public.return_signout(%L::uuid, %L)).status', f.sr1, 'Sweep under the mill first.'));
  select count(*) into n_note from public.member_notices
   where member_id = f.a and kind = 'signout_returned' and body like '%Sweep under the mill first.%';
  n_push := pg_temp.pushes('signout_returned');
  perform pg_temp.rec(1, 'a mentor sends a sign-out back: the student gets one notice carrying the note',
    r = 'returned' and n_note = 1, format('%s; notices %s', r, n_note));
  perform pg_temp.rec(2, 'and one push, category signout_returned, opening the dashboard',
    n_push = 1 and exists (select 1 from net._requests where body::text like '%signout_returned%' and body::text like '%/dashboard%' and body::text like '%' || f.a || '%'),
    format('pushes %s', n_push));
  r2 := pg_temp.call_as(f.m, format('select (public.approve_signout(%L::uuid)).status', f.sr2));
  perform pg_temp.rec(3, 'an approval sends no send-back notice and no push (0 against the 1 above)',
    r2 = 'approved' and not exists (select 1 from public.member_notices where member_id = f.b and kind = 'signout_returned')
    and pg_temp.pushes('signout_returned') = 1, r2);
end
$c$;

-- 4-6. A new access request emails every admin once, and a second request
-- from the same address the same day emails nobody again.
do $c$
declare f t24_fx; who uuid := gen_random_uuid(); r text; admins int; n1 int; n2 int; r2 text;
begin
  select * into f from t24_fx;
  select count(distinct lower(u.email)) into admins from public.member_roles x join auth.users u on u.id = x.member_id
   where x.role = 'admin' and u.email is not null;
  r := pg_temp.exec_as(who, $q$insert into public.access_requests (email, full_name, requested_role, note) values ('kim.newparent@example.invalid', 'Kim Dinh', 'parent', 'Joseph Tran mom')$q$, 'kim.newparent@example.invalid');
  select count(*) into n1 from public.notice_outbox where kind = 'access_request' and subject like '%kim.newparent@example.invalid%';
  perform pg_temp.rec(4, 'a new access request queues one email to each admin, naming the requester and the page',
    r = 'ok' and admins >= 1 and n1 = admins
    and (select bool_and(body like '%Kim Dinh%' and body like '%/access-requests%') from public.notice_outbox where kind = 'access_request'),
    format('%s; admins %s, emails %s', r, admins, n1));
  perform pg_temp.rec(5, 'each admin also gets a notice in the app',
    (select count(*) from public.member_notices where kind = 'access_request') = (select count(distinct member_id) from public.member_roles where role = 'admin'),
    '');
  -- Denied, then asked again the same day: the request lands, no new email.
  update public.access_requests set status = 'denied' where email = 'kim.newparent@example.invalid';
  r2 := pg_temp.exec_as(who, $q$insert into public.access_requests (email, full_name) values ('kim.newparent@example.invalid', 'Kim Dinh')$q$, 'kim.newparent@example.invalid');
  select count(*) into n2 from public.notice_outbox where kind = 'access_request' and subject like '%kim.newparent@example.invalid%';
  perform pg_temp.rec(6, 'a second request from the same address the same day lands but emails nobody again',
    r2 = 'ok' and (select count(*) from public.access_requests where email = 'kim.newparent@example.invalid') = 2 and n2 = n1, format('%s; emails %s -> %s', r2, n1, n2));
end
$c$;

-- A report from student A.
update t24_fx set fb = gen_random_uuid();
insert into public.feedback (id, member_id, category, message, route, status)
select fb, a, 'bug', 'The sign-out button does nothing on my phone', '/dashboard', 'new' from t24_fx;
update t24_fx set push_before = pg_temp.pushes('feedback_reply');

-- 7-10. Answers: an admin answers and the sender is told three ways; a
-- mentor and a student cannot answer.
do $c$
declare f t24_fx; r text; r2 text; r3 text; n_reply int;
begin
  select * into f from t24_fx;
  r2 := pg_temp.call_as(f.m, format('select public.feedback_reply(%L::uuid, %L)::text', f.fb, 'mentor answer'));
  r3 := pg_temp.call_as(f.b, format('select public.feedback_reply(%L::uuid, %L)::text', f.fb, 'student answer'));
  perform pg_temp.rec(7, 'a mentor who is not an admin, and a student, cannot answer; nothing is written',
    r2 like 'err:42501:%' and r3 like 'err:42501:%' and not exists (select 1 from public.feedback_replies where feedback_id = f.fb),
    format('mentor %s; student %s', left(r2, 40), left(r3, 40)));
  r := pg_temp.call_as(f.ad, format('select public.feedback_reply(%L::uuid, %L)::text', f.fb, 'Fixed in today''s update. Pull to refresh.'));
  select count(*) into n_reply from public.feedback_replies where feedback_id = f.fb;
  perform pg_temp.rec(8, 'an admin answers: one answer stored, and a New report becomes Seen',
    r like '{%' and n_reply = 1 and (select status from public.feedback where id = f.fb) = 'seen', format('%s; answers %s', left(r, 60), n_reply));
  perform pg_temp.rec(9, 'the sender gets a notice and one email carrying the answer and their own words',
    exists (select 1 from public.member_notices where member_id = f.a and kind = 'feedback_reply' and body like 'Fixed in today%')
    and (select count(*) from public.notice_outbox where member_id = f.a and kind = 'feedback_reply'
           and body like '%Fixed in today%' and body like '%The sign-out button does nothing%') = 1,
    '');
  perform pg_temp.rec(10, 'and one push',
    pg_temp.pushes('feedback_reply') = f.push_before + 1, format('%s -> %s', f.push_before, pg_temp.pushes('feedback_reply')));
end
$c$;

-- 11-13. Reading: the sender reads their own reports with answers; another
-- member reads none of them; the table itself is closed to every client.
do $c$
declare f t24_fx; mine text; other text; direct text; anon text;
begin
  select * into f from t24_fx;
  mine := pg_temp.call_as(f.a, 'select public.my_feedback()::text');
  other := pg_temp.call_as(f.b, 'select public.my_feedback()::text');
  perform pg_temp.rec(11, 'the sender reads their report, its status and the answer',
    mine like '[%' and exists (select 1 from jsonb_array_elements(mine::jsonb) x
                               where (x ->> 'id')::uuid = f.fb and x ->> 'status' = 'seen'
                                 and x -> 'replies' -> 0 ->> 'body' like 'Fixed in today%'), left(mine, 120));
  perform pg_temp.rec(12, 'another member does not see that report (0 against the 1 the sender sees)',
    other like '[%' and not exists (select 1 from jsonb_array_elements(other::jsonb) x where (x ->> 'id')::uuid = f.fb), left(other, 80));
  direct := pg_temp.call_as(f.ad, 'select count(*)::text from public.feedback_replies');
  anon := pg_temp.call_as(null, 'select public.my_feedback()::text');
  perform pg_temp.rec(13, 'no client reads the answers table directly, an admin included; anon cannot call my_feedback',
    direct like 'err:42501:%' and anon like 'err:42501:%', format('admin direct %s; anon %s', left(direct, 40), left(anon, 40)));
end
$c$;

-- 14. The inbox read of answers: admins only.
do $c$
declare f t24_fx; r text; r2 text;
begin
  select * into f from t24_fx;
  r := pg_temp.call_as(f.ad, format('select public.feedback_replies_for(array[%L::uuid])::text', f.fb));
  r2 := pg_temp.call_as(f.m, format('select public.feedback_replies_for(array[%L::uuid])::text', f.fb));
  perform pg_temp.rec(14, 'the admin inbox reads the answer with its author; a mentor is refused',
    r like '[%' and jsonb_array_length(r::jsonb) = 1 and r::jsonb -> 0 ? 'author' and r2 like 'err:42501:%', format('%s; mentor %s', left(r, 60), left(r2, 40)));
end
$c$;

-- 15. Grants and definitions.
do $c$
declare bad text; n int;
begin
  with want(sig, auth_ok) as (values
    ('public.feedback_reply(uuid, text)', true),
    ('public.feedback_replies_for(uuid[])', true),
    ('public.my_feedback()', true),
    ('public._push_one(uuid, text, text, text, text, text, text)', false),
    ('public._signout_returned_notify()', false),
    ('public._access_request_notify()', false))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null
           or has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> w.auth_ok
           or not p.prosecdef
           or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(15, 'grants: three entry points signed-in only, helpers and triggers nobody; definer, search_path pinned',
    n = 6 and bad is null, format('%s of 6 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t24_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t24_results
order by 1;

rollback;
