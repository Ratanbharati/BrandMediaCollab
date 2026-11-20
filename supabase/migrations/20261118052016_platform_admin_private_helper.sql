-- Establish the private admin-check helper before any policy or trigger uses it.
-- The helper reads only the trusted platform_admins table and never accepts a
-- caller-supplied user ID, preventing clients from checking/granting another account.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant usage on schema app_private to service_role;

create or replace function app_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function app_private.is_platform_admin() from public, anon;
grant execute on function app_private.is_platform_admin() to authenticated;
grant execute on function app_private.is_platform_admin() to service_role;
