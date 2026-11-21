-- Moderation states cannot be bypassed through the existing permissive project policies.
drop policy if exists projects_moderation_visibility on public.projects;
create policy projects_moderation_visibility on public.projects as restrictive for select to authenticated
  using (moderation_status not in ('hidden', 'removed') or owner_id = (select auth.uid()) or (select app_private.is_platform_admin()));

-- A profile owner cannot grant their own verified badge through the profile update policy.
create or replace function app_private.prevent_self_verification_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_verified is distinct from old.is_verified
     and (select auth.uid()) = old.id
     and not (select app_private.is_platform_admin()) then
    raise exception 'Only platform administrators can change profile verification.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.prevent_self_verification_change() from public, anon, authenticated;
drop trigger if exists prevent_self_verification_change on public.profiles;
create trigger prevent_self_verification_change before update of is_verified on public.profiles
  for each row execute function app_private.prevent_self_verification_change();
