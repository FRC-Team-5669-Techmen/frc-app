-- Admin-only RPC: returns every member with their email, status, roles, and subteams.
-- auth.users is only reachable from a SECURITY DEFINER function.
-- The function enforces the admin check itself before returning any data.
create or replace function public.admin_get_members()
returns table (
  id       uuid,
  full_name text,
  email    text,
  status   text,
  roles    text[],
  subteams text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Permission denied: admin role required';
  end if;
  return query
    select
      p.id,
      p.full_name::text,
      u.email::text,
      p.status::text,
      array_remove(array_agg(mr.role order by mr.role), null)::text[] as roles,
      coalesce(p.subteams, '{}')::text[]                               as subteams
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.member_roles mr on mr.member_id = p.id
    group by p.id, p.full_name, u.email, p.status, p.subteams
    order by lower(p.full_name);
end;
$$;

grant execute on function public.admin_get_members() to authenticated;
