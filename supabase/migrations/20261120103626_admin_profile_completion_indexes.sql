create index if not exists admin_account_states_changed_by_idx on public.admin_account_states(changed_by) where changed_by is not null;
create index if not exists content_reports_reporter_id_idx on public.content_reports(reporter_id);
create index if not exists content_reports_reviewed_by_idx on public.content_reports(reviewed_by) where reviewed_by is not null;
create index if not exists projects_moderated_by_idx on public.projects(moderated_by) where moderated_by is not null;
create index if not exists verification_requests_reviewed_by_idx on public.verification_requests(reviewed_by) where reviewed_by is not null;
create unique index if not exists content_reports_one_open_user_target
  on public.content_reports(reporter_id, target_user_id) where target_user_id is not null and status in ('pending', 'reviewing');
create unique index if not exists content_reports_one_open_project_target
  on public.content_reports(reporter_id, target_project_id) where target_project_id is not null and status in ('pending', 'reviewing');

create or replace view public.admin_user_directory as
select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
       u.banned_until,
       p.account_type, p.display_name, p.company_name, p.location,
       p.is_discoverable, p.onboarding_completed, p.is_verified,
       p.bio, p.avatar_url,
       coalesce(pc.project_count, 0)::bigint as project_count,
       case when s.status = 'suspended' or (u.banned_until is not null and u.banned_until > now())
         then 'suspended' else 'active' end as account_status
       ,case when p.id is null then 0
            when p.onboarding_completed then 100
            when p.account_type in ('creator', 'celebrity') then round(100.0 * (
              (nullif(btrim(p.display_name), '') is not null)::int +
              (nullif(btrim(p.location), '') is not null)::int +
              (nullif(btrim(p.bio), '') is not null)::int +
              (nullif(btrim(p.category), '') is not null)::int +
              (nullif(btrim(p.avatar_url), '') is not null)::int
            ) / 5.0)::int
            else round(100.0 * (
              (nullif(btrim(p.company_name), '') is not null)::int +
              (nullif(btrim(p.category), '') is not null)::int +
              (nullif(btrim(p.bio), '') is not null)::int +
              (nullif(btrim(p.manager_name), '') is not null)::int +
              (nullif(btrim(p.location), '') is not null)::int +
              (nullif(btrim(p.website_url), '') is not null)::int
            ) / 6.0)::int
       end as profile_completion
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
  (select count(*) from auth.users u where (u.banned_until is not null and u.banned_until > now()) or exists (select 1 from public.admin_account_states s where s.user_id=u.id and s.status='suspended'))::bigint as suspended_accounts,
  (select count(*) from public.admin_audit_logs)::bigint as admin_actions,
  (select count(*) from public.support_requests where status <> 'resolved')::bigint as open_support_requests;
revoke all on public.admin_dashboard_metrics from public, anon, authenticated;
grant select on public.admin_dashboard_metrics to service_role;
