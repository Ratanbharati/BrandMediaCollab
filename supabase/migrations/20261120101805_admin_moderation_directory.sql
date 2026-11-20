-- Phase 3: audited platform administration and reversible moderation.
-- Admin access continues to derive only from public.platform_admins.

create table if not exists public.admin_account_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint admin_account_states_reason_required check (status <> 'suspended' or nullif(btrim(reason), '') is not null)
);
alter table public.admin_account_states enable row level security;
revoke all on public.admin_account_states from anon, authenticated;
grant select, insert, update, delete on public.admin_account_states to service_role;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_project_id uuid references public.projects(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'impersonation', 'unsafe_content', 'fraud', 'other')),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'actioned', 'dismissed')),
  resolution text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_reports_one_target check ((target_user_id is not null)::int + (target_project_id is not null)::int = 1),
  constraint content_reports_not_self check (target_user_id is null or target_user_id <> reporter_id)
);
create index if not exists content_reports_status_created_idx on public.content_reports(status, created_at desc);
create index if not exists content_reports_target_user_idx on public.content_reports(target_user_id) where target_user_id is not null;
create index if not exists content_reports_target_project_idx on public.content_reports(target_project_id) where target_project_id is not null;
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon;
grant select, insert, update on public.content_reports to authenticated;
grant select, insert, update, delete on public.content_reports to service_role;
drop policy if exists content_reports_reporter_read on public.content_reports;
create policy content_reports_reporter_read on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select app_private.is_platform_admin()));
drop policy if exists content_reports_reporter_insert on public.content_reports;
create policy content_reports_reporter_insert on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists content_reports_admin_update on public.content_reports;
create policy content_reports_admin_update on public.content_reports for update to authenticated
  using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement text not null check (char_length(btrim(statement)) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists verification_requests_one_pending_per_user
  on public.verification_requests(user_id) where status = 'pending';
create index if not exists verification_requests_status_created_idx on public.verification_requests(status, created_at desc);
alter table public.verification_requests enable row level security;
revoke all on public.verification_requests from anon;
grant select, insert, update on public.verification_requests to authenticated;
grant select, insert, update, delete on public.verification_requests to service_role;
drop policy if exists verification_requests_owner_read on public.verification_requests;
create policy verification_requests_owner_read on public.verification_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_platform_admin()));
drop policy if exists verification_requests_owner_insert on public.verification_requests;
create policy verification_requests_owner_insert on public.verification_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists verification_requests_admin_update on public.verification_requests;
create policy verification_requests_admin_update on public.verification_requests for update to authenticated
  using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));

alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.projects
  add column if not exists moderation_status text not null default 'normal',
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderated_at timestamptz;
alter table public.projects drop constraint if exists projects_moderation_status_check;
alter table public.projects add constraint projects_moderation_status_check
  check (moderation_status in ('normal', 'review', 'hidden', 'removed'));

-- A restrictive policy composes with existing permissive owner/member policies.
create or replace function app_private.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      (select app_private.is_platform_admin())
      or not exists (
        select 1 from public.admin_account_states s
        where s.user_id = (select auth.uid()) and s.status = 'suspended'
      )
    );
$$;
revoke all on function app_private.is_account_active() from public, anon;
grant execute on function app_private.is_account_active() to authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'profiles','private_contacts','social_accounts','projects','project_deliverables','applications',
    'saved_projects','conversations','conversation_members','messages','meetings','profile_connections',
    'profile_blocks','support_requests','notifications','payment_records','admin_audit_logs','platform_admins',
    'content_reports','verification_requests','admin_account_states'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('drop policy if exists account_active_gate on public.%I', tbl);
      execute format('create policy account_active_gate on public.%I as restrictive for all to authenticated using ((select app_private.is_account_active())) with check ((select app_private.is_account_active()))', tbl);
    end if;
  end loop;
end $$;

-- The views intentionally expose only fields needed by the owner console.
-- Default (owner) view execution is required for auth.users, whose table is not
-- available to the service_role directly. Access is nevertheless service-only.
create or replace view public.admin_user_directory as
select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
       u.banned_until,
       p.account_type, p.display_name, p.company_name, p.location,
       p.is_discoverable, p.onboarding_completed, p.is_verified,
       p.bio, p.avatar_url,
       coalesce(pc.project_count, 0)::bigint as project_count,
       case when s.status = 'suspended' or (u.banned_until is not null and u.banned_until > now())
         then 'suspended' else 'active' end as account_status
from auth.users u
left join public.profiles p on p.id = u.id
left join public.admin_account_states s on s.user_id = u.id
left join lateral (select count(*) as project_count from public.projects pr where pr.owner_id = u.id) pc on true;
revoke all on public.admin_user_directory from public, anon, authenticated;
grant select on public.admin_user_directory to service_role;

create or replace view public.admin_dashboard_metrics as
select
  (select count(*) from auth.users)::bigint as total_users,
  (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days')::bigint as active_users_30d,
  (select count(*) from public.profiles where account_type = 'creator')::bigint as creator_accounts,
  (select count(*) from public.profiles where account_type = 'brand')::bigint as brand_accounts,
  (select count(*) from public.profiles where account_type = 'agency')::bigint as agency_accounts,
  (select count(*) from public.profiles where account_type = 'celebrity')::bigint as celebrity_accounts,
  (select count(*) from public.profiles where account_type = 'event')::bigint as event_accounts,
  (select count(*) from public.profiles where account_type = 'media')::bigint as media_accounts,
  (select count(*) from public.projects)::bigint as total_projects,
  (select count(*) from public.projects where status = 'Open' and moderation_status = 'normal')::bigint as published_projects,
  (select count(*) from public.applications)::bigint as applications,
  (select count(*) from public.applications where status = 'working_together')::bigint as collaborations,
  (select count(*) from public.profile_connections where status = 'accepted')::bigint as connections,
  (select count(*) from public.content_reports)::bigint as reports,
  (select count(*) from public.content_reports where status in ('pending','reviewing'))::bigint as pending_reports,
  (select count(*) from public.verification_requests where status = 'pending')::bigint as pending_verification,
  (select count(*) from public.admin_account_states where status = 'suspended')::bigint as suspended_accounts,
  (select count(*) from public.admin_audit_logs)::bigint as admin_actions,
  (select count(*) from public.support_requests where status <> 'resolved')::bigint as open_support_requests;
revoke all on public.admin_dashboard_metrics from public, anon, authenticated;
grant select on public.admin_dashboard_metrics to service_role;

comment on view public.admin_user_directory is 'Minimal account directory for the server-side platform admin API; service_role only.';
comment on view public.admin_dashboard_metrics is 'Live aggregate counts for the server-side platform admin API; service_role only.';
