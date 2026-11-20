-- Keep compatibility helper inside the authenticated caller's execution
-- context. The private helper remains the sole admin check.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.is_platform_admin();
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
