-- Let a member continue to see a project they saved after it is paused/closed.
-- Public discovery remains limited to Open posts; owners and applicants keep
-- their existing access through the current policy.
create or replace function public.has_applied_to_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    where a.project_id = p_project_id and a.applicant_id = (select auth.uid())
  );
$$;

drop policy if exists projects_discover_or_owner on public.projects;
create policy projects_discover_or_owner on public.projects
  for select to authenticated
  using (
    status = 'Open'
    or owner_id = (select auth.uid())
    or (select public.has_applied_to_project(id))
    or exists (
      select 1 from public.saved_projects sp
      where sp.project_id = public.projects.id and sp.user_id = (select auth.uid())
    )
    or (select public.is_platform_admin())
  );
