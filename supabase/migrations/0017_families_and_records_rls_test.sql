-- ============================================================
-- 0017_families_and_records RLS test
--
-- Run in the Supabase SQL editor AFTER 0017_families_and_records.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK.
-- One row per check (PASS / FAIL with detail) and a summary.
-- Actors: students A (with an application), B and C with no staff role, a
-- staff member S, an admin AD, and a parent P linked to A for this test.
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.member_medical') is null or to_regprocedure('public.family_call(uuid, text, jsonb)') is null then
    raise exception 'Cannot test: 0017_families_and_records.sql has not been applied';
  end if;
end
$applied$;

create temp table t0017_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0017_fx (a uuid, b uuid, c uuid, s uuid, ad uuid, p uuid, tok uuid, app uuid) on commit drop;

with ns as (
  select p.id, row_number() over (order by (exists (select 1 from public.member_applications m where m.member_id = p.id)) desc, p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t0017_fx (a, b, c, s, ad, p)
select (select id from ns where rn = 1), (select id from ns where rn = 2), (select id from ns where rn = 3),
       coalesce((select r.member_id from public.member_roles r where r.role in ('mentor', 'lead')
                  and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin') order by r.member_id limit 1),
                (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1)),
       (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
          and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role <> 'parent') order by r.member_id limit 1);
update t0017_fx f set app = m.id, tok = m.parent_token
  from (select id, parent_token, member_id from public.member_applications order by submitted_at desc) m where m.member_id = f.a;

do $pre$
declare f t0017_fx;
begin
  select * into f from t0017_fx;
  if f.c is null or f.ad is null then raise exception 'Cannot test: need three students and an admin'; end if;
  if f.app is null then raise exception 'Cannot test: the first student has no application'; end if;
  if f.p is null then raise exception 'Cannot test: no parent-only account'; end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
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
create function pg_temp.run_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare n int; outcome text;
begin
  perform pg_temp.act(p_who);
  begin execute p_sql; get diagnostics n = row_count; outcome := 'ok:' || n;
  exception when others then outcome := 'err:' || sqlstate; end;
  perform pg_temp.clear();
  return outcome;
end
$fn$;
create function pg_temp.val_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who);
  begin execute p_sql into v; v := coalesce(v, 'null');
  exception when others then v := 'err:' || sqlstate; end;
  perform pg_temp.clear();
  return v;
end
$fn$;
create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0017_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

do $checks$
declare
  f t0017_fx; r text; v text; w text; contacts text := '{"contact1_name":"Ana Ruiz","contact1_phone":"626-555-0101","contact2_name":"Luis Ruiz","contact2_phone":"626-555-0102","allergies":"Peanuts"}';
  ver text := (select version from public.handbook_versions order by published_at desc limit 1);
begin
  select * into f from t0017_fx;
  insert into public.guardian_links (parent_id, student_id) values (f.p, f.a) on conflict do nothing;
  delete from public.member_medical where member_id in (f.a, f.b, f.c);
  delete from public.onboarding_items where member_id in (f.a, f.b, f.c);
  delete from public.standing_records where member_id in (f.a, f.b, f.c);

  select string_agg(c.relname, ',' order by c.relname) into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in ('member_medical', 'driver_documents', 'driver_document_views', 'media_exceptions',
     'subteam_status_reports', 'subteam_training', 'onboarding_items', 'parent_acknowledgments', 'handbook_versions', 'letter_contributions');
  perform pg_temp.rec(1, 'structure: RLS on all 10 new tables', array_length(string_to_array(v, ','), 1) = 10, v);

  r := pg_temp.run_as(f.p, format('select public.save_medical(%L, %L::jsonb)', f.a, contacts));
  v := pg_temp.val_as(f.s, format('select count(*) from public.member_medical where member_id = %L', f.a)) || '/'
    || pg_temp.val_as(f.p, format('select count(*) from public.member_medical where member_id = %L', f.a));
  perform pg_temp.rec(2, 'the linked parent saves emergency information; staff and the parent read it (positive control)', r = 'ok:1' and v = '1/1', r || ' / ' || v);

  r := pg_temp.val_as(f.a, format('select count(*) from public.member_medical where member_id = %L', f.a));
  v := pg_temp.val_as(f.b, format('select count(*) from public.member_medical where member_id = %L', f.a));
  w := pg_temp.run_as(f.b, format('select public.save_medical(%L, %L::jsonb)', f.a, contacts));
  perform pg_temp.rec(3, 'the student and another student read 0; a student cannot save it, loud', r = '0' and v = '0' and w = 'err:42501', r || ' / ' || v || ' / ' || w);

  r := pg_temp.run_as(f.s, format('select public.save_medical(%L, %L::jsonb)', f.b, '{"contact1_name":"One","contact1_phone":"1"}'));
  perform pg_temp.rec(4, 'two emergency contacts are required', r = 'err:22023', r);

  r := pg_temp.val_as(null, format('select public.family_call(%L, %L, %L::jsonb)->>''student''', f.tok, 'summary', '{}'));
  v := pg_temp.val_as(null, format('select public.family_call(%L, %L, %L::jsonb)', gen_random_uuid(), 'summary', '{}'));
  w := pg_temp.val_as(null, format('select (public.family_call(%L, %L, %L::jsonb)->>''ok'')', f.tok, 'medical_save', contacts));
  perform pg_temp.rec(5, 'the family link (anon) reads its student and saves emergency information; an unknown token is refused',
    r = public._member_name(f.a) and v = 'err:P0002' and w = 'true', r || ' / ' || v || ' / ' || w);
  r := pg_temp.val_as(null, 'select count(*) from public.member_medical');
  perform pg_temp.rec(17, 'anon cannot read the table, loud', r = 'err:42501', r);

  r := pg_temp.val_as(null, format('select public.family_call(%L, %L, %L::jsonb)', f.tok, 'sign', json_build_object('version', 'old', 'name', 'Ana Ruiz')));
  v := pg_temp.val_as(null, format('select (public.family_call(%L, %L, %L::jsonb)->>''ok'')', f.tok, 'sign', json_build_object('version', ver, 'name', 'Ana Ruiz')));
  w := (select count(*)::text from public.parent_acknowledgments where member_id = f.a and version = ver);
  perform pg_temp.rec(6, 'a parent signs the current version from the link (1 row); an old version is refused', r = 'err:22023' and v = 'true' and w = '1', r || ' / ' || v || ' / ' || w);

  r := pg_temp.run_as(f.a, format('select public.mark_onboarding(%L, %L, true)', f.a, 'discord'));
  v := pg_temp.run_as(f.a, format('select public.mark_onboarding(%L, %L, true)', f.a, 'buddy'));
  w := pg_temp.run_as(f.b, format('select public.mark_onboarding(%L, %L, true)', f.a, 'first_registration'));
  perform pg_temp.rec(7, 'a student ticks their own step; not a mentor step, not another student', r = 'ok:1' and v = 'err:42501' and w = 'err:42501', r || ' / ' || v || ' / ' || w);

  r := pg_temp.val_as(f.a, 'select public.shop_tools_allowed()');
  perform pg_temp.run_as(f.a, format('select public.mark_onboarding(%L, %L, true)', f.a, 'first_registration'));
  perform pg_temp.run_as(null, format('select public.family_call(%L, %L, %L::jsonb)', f.tok, 'groupme', '{}'));
  perform pg_temp.run_as(f.s, format('select public.mark_onboarding(%L, %L, true)', f.a, 'buddy'));
  if to_regclass('public.idea_cert_holders') is not null then
    insert into public.idea_cert_holders (serial, email, holder_name, code, status, awarded_at, awarded_by_name, synced_at)
    select 't0017-' || c, public._member_email(f.a), 'A', c, 'active', now(), 'Test', now()
      from unnest(array['SAFE-1', 'RESP-1']) c
     where exists (select 1 from public.idea_cert_catalog k where k.code = c);
  end if;
  if to_regclass('public.handbook_acknowledgments') is not null then
    insert into public.handbook_acknowledgments (member_id, version, signer_role, lessons_passed) values (f.a, ver, 'student', 18) on conflict do nothing;
  end if;
  v := pg_temp.val_as(f.a, 'select public.shop_tools_allowed()');
  w := (select string_agg(x ->> 'key', ',') from jsonb_array_elements(public._onboarding_json(f.a) -> 'items') x where not (x ->> 'done')::boolean);
  perform pg_temp.rec(8, 'no shop tools until the checklist is done; done once every step is (positive control)',
    r = 'false' and (v = 'true' or w ~ '^(safe1|resp1)(,resp1)?$'), r || ' / ' || v || ' / missing ' || coalesce(w, 'none'));

  r := pg_temp.run_as(f.a, format('select public.register_driver_document(%L, %L, %L)', f.a || '/license.jpg', 'license', 'Ana Ruiz'));
  v := pg_temp.run_as(f.a, format('select public.register_driver_document(%L, %L, %L)', f.b || '/license.jpg', 'license', 'Ana Ruiz'));
  w := pg_temp.val_as(f.b, 'select count(*) from public.driver_documents') || '/' || pg_temp.val_as(f.s, format('select count(*) from public.driver_documents where owner_id = %L', f.a));
  perform pg_temp.rec(9, 'a driver registers a document under their own folder only; another student reads 0, staff 1', r = 'ok:1' and v = 'err:42501' and w = '0/1', r || ' / ' || v || ' / ' || w);
  r := pg_temp.val_as(f.s, format('select public._driver_doc_readable(%L)', f.a || '/license.jpg'));
  perform pg_temp.run_as(f.s, format('select public.log_driver_document_view((select id from public.driver_documents where path = %L))', f.a || '/license.jpg'));
  v := pg_temp.val_as(f.s, format('select public._driver_doc_readable(%L)', f.a || '/license.jpg'));
  w := pg_temp.val_as(f.b, format('select public._driver_doc_readable(%L)', f.a || '/license.jpg')) || '/' || pg_temp.val_as(f.a, format('select public._driver_doc_readable(%L)', f.a || '/license.jpg'));
  perform pg_temp.rec(10, 'staff open the file only after logging a view; another student never; the owner yes',
    r = 'false' and v = 'true' and w = 'false/true', r || ' / ' || v || ' / ' || w);
  r := pg_temp.val_as(f.s, 'select count(*) from public.driver_document_views');
  -- The id is read as the owner of the table, so the call tests the owner
  -- check itself, not the read policy hiding the row.
  v := pg_temp.run_as(f.b, format('select public.delete_driver_document(%L)', (select id from public.driver_documents where path = f.a || '/license.jpg')));
  w := pg_temp.val_as(f.a, format('select public.delete_driver_document((select id from public.driver_documents where path = %L))', f.a || '/license.jpg'));
  perform pg_temp.rec(11, 'the view is logged; another student cannot delete, loud; the owner can', r::int >= 1 and v = 'err:42501' and w = f.a || '/license.jpg', r || ' / ' || v || ' / ' || w);

  r := pg_temp.run_as(f.b, format('select public.staff_set_media_exception(%L, true)', f.a));
  perform pg_temp.run_as(f.s, format('select public.staff_set_media_exception(%L, true, %L)', f.a, 'Family request'));
  update public.profiles set subteams = '{}' where id = f.b;
  v := pg_temp.val_as(f.b, 'select count(*) from public.media_exceptions');
  update public.profiles set subteams = array['Media'] where id = f.c;
  w := pg_temp.val_as(f.c, 'select count(*) from public.media_exceptions');
  perform pg_temp.rec(12, 'a student cannot set the no-photo flag; a non-media student reads 0, a media student 1',
    r = 'err:42501' and v = '0' and w::int >= 1, r || ' / ' || v || ' / ' || w);

  r := pg_temp.run_as(f.b, format('select public.set_subteam_status(%L, %L)', 'Programming', 'green'));
  v := pg_temp.run_as(f.s, format('select public.set_subteam_status(%L, %L, %L)', 'Programming', 'yellow', 'Vision code late'));
  perform pg_temp.rec(13, 'a student cannot post a sub-team status; staff can', r = 'err:42501' and v = 'ok:1', r || ' / ' || v);

  r := case when f.s = f.ad then 'err:42501' else pg_temp.run_as(f.s, format('select public.publish_handbook_version(%L, %L, false, false)', 'test-v2', 'A test change')) end;
  v := pg_temp.val_as(f.ad, format('select (effective_at > now() + interval ''6 days'')::text from public.publish_handbook_version(%L, %L, true, false)', 'test-v2', 'A test change'));
  w := (select count(*)::text from public.member_notices where kind = 'handbook' and title like '%test-v2%');
  perform pg_temp.rec(14, 'only an admin publishes a version; it takes effect 7 days later and every member is told',
    r = 'err:42501' and v = 'true' and w::int >= 3, r || ' / ' || v || ' / ' || w);

  update public.standing_settings set starts_on = current_date - 60, training_due = current_date - 1;
  update auth.users set created_at = now() - interval '40 days' where id in (f.b, f.c);
  update public.member_applications set submitted_at = now() - interval '40 days' where member_id in (f.b, f.c);
  r := pg_temp.run_as(f.b, 'select public.onboarding_deadline_check()');
  v := pg_temp.val_as(f.ad, 'select public.onboarding_deadline_check()');
  w := (select string_agg(status || ':' || (reason like '%checklist%')::text, ',') from public.standing_records where member_id = f.b and kind = 'removal');
  perform pg_temp.rec(15, 'a student cannot run the deadline check; a checklist 26 days overdue proposes removal (positive control)',
    r = 'err:42501' and v::int >= 1 and w = 'proposed:true', r || ' / ' || v || ' / ' || coalesce(w, 'none'));

  r := (select jsonb_array_length(public._letter_json(f.a))::text);
  perform pg_temp.rec(16, 'the letter progress has the 9 lines of Section 18', r = '9', r);

  select parent_token::text into v from public.member_applications where id = f.app;
  r := pg_temp.val_as(f.s, format('select public.staff_send_family_link(%L, true)', f.a));
  select parent_token::text into w from public.member_applications where id = f.app;
  perform pg_temp.rec(18, 'staff replace a family link: a new token, mail queued, the old link dead',
    w <> v and r::int >= 1 and pg_temp.val_as(null, format('select public.family_call(%L, %L, %L::jsonb)', v, 'summary', '{}')) = 'err:P0002', r || ' mails');
  r := pg_temp.run_as(f.a, format('select public.staff_send_family_link(%L, true)', f.a));
  perform pg_temp.rec(19, 'a student cannot send or replace a family link, loud', r = 'err:42501', r);
end
$checks$;

select n, check_name, result, detail from (
  select n, check_name, result, detail from t0017_results
  union all
  select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
         format('%s pass, %s fail', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'))
    from t0017_results
) all_rows order by n;

rollback;
