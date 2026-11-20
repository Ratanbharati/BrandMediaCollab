-- Phase 5: enforce application ownership and valid status transitions in the database.
-- This migration preserves RLS and narrows authenticated write privileges.

-- Repair installations where the private helper migration was skipped or not
-- present in the remote migration history. Keep this definition idempotent.
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

drop policy if exists applications_insert_self on public.applications;
create policy applications_insert_self on public.applications
  for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'interested'
    and exists (
      select 1
      from public.projects p
      join public.profiles applicant on applicant.id = (select auth.uid())
      where p.id = project_id
        and p.status = 'Open'
        and p.owner_id <> (select auth.uid())
        and (p.application_deadline is null or p.application_deadline >= current_date)
        and (cardinality(p.target_profile_types) = 0 or applicant.account_type = any(p.target_profile_types))
    )
  );

drop policy if exists applications_update_parties on public.applications;
create policy applications_update_parties on public.applications
  for update to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
    or (select app_private.is_platform_admin())
  )
  with check (
    applicant_id = (select auth.uid())
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
    or (select app_private.is_platform_admin())
  );

-- Prevent participants from changing identity/ownership columns through PostgREST.
revoke update on public.applications from authenticated;
grant update (status, message, updated_at) on public.applications to authenticated;

create or replace function app_private.guard_application_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  project_owner uuid;
  is_admin boolean := coalesce(auth.role(), '') = 'service_role' or (select app_private.is_platform_admin());
begin
  if tg_op = 'INSERT' then
    if new.applicant_id is distinct from actor and not is_admin then
      raise exception 'Applications must belong to the signed-in account.' using errcode = '42501';
    end if;
    if new.status <> 'interested' then
      raise exception 'New applications must start as interested.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.applicant_id is distinct from old.applicant_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Application identity fields cannot be changed.' using errcode = '42501';
  end if;

  select p.owner_id into project_owner from public.projects p where p.id = old.project_id;
  if is_admin then
    new.updated_at := now();
    return new;
  elsif actor = old.applicant_id then
    if new.status not in ('interested', 'withdrawn')
       or old.status not in ('interested', 'withdrawn') then
      raise exception 'Applicants may only submit or withdraw their own interest.' using errcode = '42501';
    end if;
    if old.status = 'withdrawn' and new.status = 'interested' and not exists (
      select 1
      from public.projects p
      join public.profiles applicant on applicant.id = old.applicant_id
      where p.id = old.project_id
        and p.status = 'Open'
        and p.owner_id <> old.applicant_id
        and (p.application_deadline is null or p.application_deadline >= current_date)
        and (cardinality(p.target_profile_types) = 0 or applicant.account_type = any(p.target_profile_types))
    ) then
      raise exception 'This project is no longer accepting applications for this account.' using errcode = '23514';
    end if;
  elsif actor = project_owner then
    if new.message is distinct from old.message then
      raise exception 'Only the applicant may edit their application note.' using errcode = '42501';
    end if;
    if not (
      (old.status = 'interested' and new.status in ('working_together', 'rejected'))
      or (old.status = 'working_together' and new.status = 'rejected')
      or (new.status = old.status)
    ) then
      raise exception 'This application status transition is not allowed.' using errcode = '42501';
    end if;
  else
    raise exception 'Only the applicant or project owner may update this application.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.guard_application_write() from public, anon, authenticated;
drop trigger if exists applications_guard_write on public.applications;
create trigger applications_guard_write
  before insert or update on public.applications
  for each row execute function app_private.guard_application_write();

-- Owners may edit project content but cannot self-approve, hide, or remove it.
create or replace function app_private.guard_project_moderation_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not (select app_private.is_platform_admin()) and (
    new.moderation_status is distinct from old.moderation_status
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
  ) then
    raise exception 'Only platform administrators can change project moderation fields.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_project_moderation_fields() from public, anon, authenticated;
drop trigger if exists projects_guard_moderation_fields on public.projects;
create trigger projects_guard_moderation_fields
  before update on public.projects
  for each row execute function app_private.guard_project_moderation_fields();

