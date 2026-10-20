-- ============================================================
-- The Techmen connector: who may connect (ledger 0013)
--
-- APPLY: by hand, in the Supabase SQL editor, AFTER
-- supabase/migrations/0018_connector.sql. Re-runnable.
--
-- Names the ONE account the connector may act as, looked up by its sign-in
-- email, and switches the connector on. The account must already hold the
-- admin role; the connector also re-checks that on every request.
--
-- To allow a different account later, change the email below and paste
-- again: the previous account is replaced and its connections stop working
-- on their next request. To switch the connector off, use the switch on
-- /connector in the app.
-- ============================================================

do $allow$
declare
  v_email text := 'apina@boscotech.edu';
  v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(v_email);
  if v_id is null then
    raise exception 'No account signs in as %. Sign in to the app once with that email, then paste this again.', v_email;
  end if;
  if not exists (select 1 from public.member_roles r where r.member_id = v_id and r.role = 'admin') then
    raise exception 'The account % does not hold the admin role. Give it admin on /roster first.', v_email;
  end if;
  update public.connector_settings
     set allowed_member = v_id, enabled = true, updated_at = now(), updated_by = v_id
   where id;
  raise notice 'The connector may now act as % and is switched on.', v_email;
end
$allow$;

select s.enabled, u.email as allowed_account
  from public.connector_settings s left join auth.users u on u.id = s.allowed_member
 where s.id;
