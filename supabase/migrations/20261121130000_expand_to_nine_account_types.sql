-- Expand Stagerang's shared profile/project ecosystem to nine account types.
-- Additive and data-preserving: existing profile and project rows are retained.

-- Preserve the original six-type revision name used in deployed environments.
alter table public.profiles drop constraint if exists profiles_account_type_six_types_check;
alter table public.projects drop constraint if exists projects_owner_type_six_types_check;
alter table public.projects drop constraint if exists projects_project_type_six_types_check;

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type in (
    'creator', 'brand', 'agency', 'celebrity', 'event', 'media',
    'community', 'distributor', 'freelancer'
  ));

alter table public.profiles
  add column if not exists community_type text,
  add column if not exists membership_type text,
  add column if not exists member_range text,
  add column if not exists distribution_regions text[] not null default '{}',
  add column if not exists business_capabilities text[] not null default '{}',
  add column if not exists work_preference text;

alter table public.projects drop constraint if exists projects_owner_type_check;
alter table public.projects add constraint projects_owner_type_check
  check (owner_type in (
    'creator', 'brand', 'agency', 'celebrity', 'event', 'media',
    'community', 'distributor', 'freelancer'
  ));

alter table public.projects drop constraint if exists projects_project_type_check;
alter table public.projects add constraint projects_project_type_check
  check (project_type in (
    'creator_idea', 'brand_campaign', 'agency_project', 'celebrity_project',
    'event_project', 'media_project', 'community_project',
    'distribution_project', 'freelance_project'
  ));

create or replace function public.enforce_project_owner_classification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Project ownership cannot be reassigned.' using errcode = '42501';
    end if;
    new.owner_type := old.owner_type;
    new.project_type := old.project_type;
    return new;
  end if;

  select p.account_type into account_kind
  from public.profiles as p where p.id = new.owner_id;
  if account_kind is null then
    raise exception 'A saved account profile is required before posting.' using errcode = '23503';
  end if;
  if new.owner_id is distinct from (select auth.uid())
     and not (select app_private.is_platform_admin()) then
    raise exception 'Projects must be created for the signed-in account.' using errcode = '42501';
  end if;

  new.owner_type := account_kind;
  new.project_type := case account_kind
    when 'creator' then 'creator_idea'
    when 'brand' then 'brand_campaign'
    when 'agency' then 'agency_project'
    when 'celebrity' then 'celebrity_project'
    when 'event' then 'event_project'
    when 'media' then 'media_project'
    when 'community' then 'community_project'
    when 'distributor' then 'distribution_project'
    when 'freelancer' then 'freelance_project'
  end;
  return new;
end;
$$;

-- Keep Auth initialization idempotent and private; never trust account type
-- values outside the server-enforced allowlist.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  chosen_type text;
  chosen_name text;
  legal_name text;
begin
  chosen_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'creator'));
  if chosen_type = 'influencer' then chosen_type := 'creator'; end if;
  if chosen_type not in (
    'brand', 'creator', 'agency', 'celebrity', 'event', 'media',
    'community', 'distributor', 'freelancer'
  ) then
    raise exception 'Unsupported Stagerang account type.' using errcode = '22023';
  end if;

  chosen_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100);
  legal_name := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160), '');
  insert into public.profiles (id, account_type, display_name, onboarding_completed, is_discoverable)
  values (new.id, chosen_type, chosen_name, false, false)
  on conflict (id) do nothing;
    insert into public.private_contacts (user_id, email, full_name)
  values (new.id, new.email, legal_name)
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(btrim(public.private_contacts.full_name), ''), excluded.full_name);
  return new;
end;
$function$;

create or replace function public.validate_completed_profile()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  private_phone text;
  private_full_name text;
begin
  if not new.onboarding_completed then return new; end if;

  if new.account_type in ('creator', 'celebrity', 'freelancer') then
    if nullif(btrim(new.display_name), '') is null
       or nullif(btrim(new.location), '') is null
       or nullif(btrim(new.bio), '') is null
       or nullif(btrim(new.category), '') is null then
      raise exception 'Display name, location, description, and category or profession are required to complete this profile.'
        using errcode = '23514';
    end if;
    if new.account_type in ('creator', 'freelancer') and nullif(btrim(new.avatar_url), '') is null then
      raise exception 'A profile photo is required to complete this profile.' using errcode = '23514';
    end if;
    if new.account_type = 'celebrity' and nullif(btrim(new.profession), '') is null then
      raise exception 'Profession or talent category is required to complete a Celebrity profile.' using errcode = '23514';
    end if;
    if new.account_type = 'freelancer' and (
      nullif(btrim(new.profession), '') is null or cardinality(new.skills) = 0
    ) then
      raise exception 'A Freelancer profession and at least one skill are required.' using errcode = '23514';
    end if;
  else
    if nullif(btrim(new.company_name), '') is null
       or nullif(btrim(new.category), '') is null
       or nullif(btrim(new.bio), '') is null
       or nullif(btrim(new.manager_name), '') is null then
      raise exception 'Organisation name, category, description, and owner or primary contact are required.'
        using errcode = '23514';
    end if;
    if new.account_type in ('community', 'distributor')
       and (nullif(btrim(new.location), '') is null or nullif(btrim(new.avatar_url), '') is null) then
      raise exception 'Location and profile logo are required for this organisation profile.' using errcode = '23514';
    end if;
    if new.account_type = 'agency' and nullif(btrim(new.agency_type), '') is null then
      raise exception 'Agency type is required to complete an Agency profile.' using errcode = '23514';
    end if;
    if new.account_type = 'community' and nullif(btrim(new.community_type), '') is null then
      raise exception 'Community type is required to complete a Community profile.' using errcode = '23514';
    end if;
    if new.account_type = 'distributor' and nullif(btrim(new.company_type), '') is null then
      raise exception 'Distributor type is required to complete a Distributor profile.' using errcode = '23514';
    end if;
  end if;

  select c.phone, c.full_name into private_phone, private_full_name
  from public.private_contacts c where c.user_id = new.id;
  if private_phone is null or private_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'A valid private mobile number is required to complete your profile.' using errcode = '23514';
  end if;
  if new.account_type in ('creator', 'freelancer') and nullif(btrim(private_full_name), '') is null then
    raise exception 'A private full name is required to complete this profile.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_completed_profile_before_write on public.profiles;
create trigger validate_completed_profile_before_write
before insert or update of account_type, display_name, company_name, agency_type, community_type,
  company_type, profession, skills, bio, category, location, manager_name, avatar_url, onboarding_completed
on public.profiles for each row execute function public.validate_completed_profile();

create or replace function public.validate_private_contact_creator_name()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if nullif(btrim(new.full_name), '') is null and exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.account_type in ('creator', 'freelancer') and p.onboarding_completed
  ) then
    raise exception 'A private full name is required for a completed Creator or Freelancer profile.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_private_contact_creator_name_before_write on public.private_contacts;
create trigger validate_private_contact_creator_name_before_write
before insert or update of full_name on public.private_contacts
for each row execute function public.validate_private_contact_creator_name();

-- Keep admin reporting live for every supported profile type.
create or replace view public.admin_user_directory as
select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
       p.account_type, p.display_name, p.company_name, p.location, p.is_discoverable,
       p.onboarding_completed, p.is_verified, p.bio, p.avatar_url,
       coalesce(pc.project_count, 0)::bigint as project_count,
       case when s.status = 'suspended' or (u.banned_until is not null and u.banned_until > now())
         then 'suspended' else 'active' end as account_status,
       case when p.id is null then 0
            when p.onboarding_completed then 100
            when p.account_type in ('creator', 'celebrity', 'freelancer') then round(100.0 * (
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
  (select count(*) from public.support_requests where status <> 'resolved')::bigint as open_support_requests,
  (select count(*) from public.profiles where account_type = 'community')::bigint as community_accounts,
  (select count(*) from public.profiles where account_type = 'distributor')::bigint as distributor_accounts,
  (select count(*) from public.profiles where account_type = 'freelancer')::bigint as freelancer_accounts;
revoke all on public.admin_dashboard_metrics from public, anon, authenticated;
grant select on public.admin_dashboard_metrics to service_role;

comment on column public.profiles.community_type is 'Community format such as online, offline, or hybrid.';
comment on column public.profiles.distribution_regions is 'Regions a Distributor serves; visible only through approved public profile queries.';


-- Extend the public discovery result additively, retaining the existing privacy,
-- block, discoverability, filtering, and pagination checks.
drop function if exists public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer);
create function public.discover_profiles(
  p_search text default null,
  p_type text default null,
  p_industry text default null,
  p_niche text default null,
  p_location text default null,
  p_language text default null,
  p_platform text default null,
  p_service text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  profile_id uuid, account_type text, display_name text, company_name text,
  agency_type text, category text, location text, bio text, avatar_url text,
  website_url text, follower_tier text, languages text[], content_categories text[],
  collaboration_categories text[], services text[], specialisations text[],
  portfolio_links text[], social_accounts jsonb, created_at timestamptz, total_count bigint,
  profession text, skills text[], content_formats text[], media_types text[],
  event_types text[], client_industries text[], company_type text,
  audience_type text, event_scale text, representation_status text,
  community_type text, membership_type text, member_range text,
  distribution_regions text[], business_capabilities text[], work_preference text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select p.*,
      coalesce((
        select jsonb_agg(jsonb_build_object('platform', sa.platform, 'profile_url', sa.profile_url) order by sa.platform)
        from public.social_accounts sa where sa.user_id = p.id and nullif(sa.profile_url, '') is not null
      ), '[]'::jsonb) as public_social_accounts
    from public.profiles p
    where p.is_discoverable
      and p.id <> (select auth.uid())
      and not exists (
        select 1 from public.profile_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
      )
      and (nullif(btrim(p_type), '') is null or p.account_type = lower(btrim(p_type)))
      and (nullif(btrim(p_industry), '') is null or lower(coalesce(p.category, '') || ' ' || coalesce(p.company_type, '') || ' ' || array_to_string(coalesce(p.client_industries, '{}'), ' ') || ' ' || array_to_string(coalesce(p.distribution_regions, '{}'), ' ')) like '%' || lower(btrim(p_industry)) || '%')
      and (nullif(btrim(p_niche), '') is null or lower(coalesce(p.category, '') || ' ' || coalesce(p.profession, '') || ' ' || array_to_string(coalesce(p.content_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.collaboration_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.skills, '{}'), ' ') || ' ' || array_to_string(coalesce(p.event_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.media_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_formats, '{}'), ' ') || ' ' || array_to_string(coalesce(p.business_capabilities, '{}'), ' ')) like '%' || lower(btrim(p_niche)) || '%')
      and (nullif(btrim(p_location), '') is null or lower(coalesce(p.location, '')) like '%' || lower(btrim(p_location)) || '%')
      and (nullif(btrim(p_language), '') is null or lower(array_to_string(coalesce(p.languages, '{}'), ' ')) like '%' || lower(btrim(p_language)) || '%')
      and (nullif(btrim(p_service), '') is null or lower(array_to_string(coalesce(p.services, '{}'), ' ') || ' ' || array_to_string(coalesce(p.specialisations, '{}'), ' ') || ' ' || array_to_string(coalesce(p.skills, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_formats, '{}'), ' ')) like '%' || lower(btrim(p_service)) || '%')
      and (nullif(btrim(p_platform), '') is null or exists (
        select 1 from public.social_accounts sa
        where sa.user_id = p.id and lower(sa.platform) like '%' || lower(btrim(p_platform)) || '%'
      ))
      and (nullif(btrim(p_search), '') is null or (
        lower(coalesce(p.display_name, '') || ' ' || coalesce(p.company_name, '') || ' ' || coalesce(p.agency_type, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.profession, '') || ' ' || coalesce(p.company_type, '') || ' ' || coalesce(p.community_type, '') || ' ' || coalesce(p.membership_type, '') || ' ' || coalesce(p.member_range, '') || ' ' || coalesce(p.work_preference, '') || ' ' || coalesce(p.audience_type, '') || ' ' || coalesce(p.event_scale, '') || ' ' || coalesce(p.location, '') || ' ' || coalesce(p.bio, '') || ' ' || coalesce(p.website_url, '') || ' ' || array_to_string(coalesce(p.languages, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.collaboration_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.services, '{}'), ' ') || ' ' || array_to_string(coalesce(p.specialisations, '{}'), ' ') || ' ' || array_to_string(coalesce(p.skills, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_formats, '{}'), ' ') || ' ' || array_to_string(coalesce(p.media_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.event_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.client_industries, '{}'), ' ') || ' ' || array_to_string(coalesce(p.distribution_regions, '{}'), ' ') || ' ' || array_to_string(coalesce(p.business_capabilities, '{}'), ' ')) like '%' || lower(btrim(p_search)) || '%'
        or exists (select 1 from public.social_accounts sa where sa.user_id = p.id and lower(sa.platform || ' ' || sa.profile_url) like '%' || lower(btrim(p_search)) || '%')
      ))
  ), counted as (
    select candidates.*, count(*) over() as result_count from candidates
  )
  select c.id, c.account_type, c.display_name, c.company_name, c.agency_type, c.category,
    c.location, c.bio, c.avatar_url, c.website_url, c.follower_tier,
    c.languages, c.content_categories, c.collaboration_categories, c.services,
    c.specialisations, c.portfolio_links, c.public_social_accounts, c.created_at, c.result_count,
    c.profession, c.skills, c.content_formats, c.media_types, c.event_types,
    c.client_industries, c.company_type, c.audience_type, c.event_scale, c.representation_status,
    c.community_type, c.membership_type, c.member_range, c.distribution_regions,
    c.business_capabilities, c.work_preference
  from counted c
  order by c.created_at desc, c.id
  limit greatest(1, least(coalesce(p_limit, 24), 48))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer) to authenticated;
