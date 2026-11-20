-- Expand the shared profile and project model to all six Stagerang account types.
-- Existing profile/project rows and IDs remain unchanged.

alter table public.profiles
  add column if not exists profession text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists content_formats text[] not null default '{}',
  add column if not exists media_types text[] not null default '{}',
  add column if not exists event_types text[] not null default '{}',
  add column if not exists client_industries text[] not null default '{}',
  add column if not exists company_type text,
  add column if not exists audience_type text,
  add column if not exists event_scale text,
  add column if not exists representation_status text;

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type in ('creator', 'brand', 'agency', 'celebrity', 'event', 'media'));
alter table public.profiles drop constraint if exists profiles_representation_status_check;
alter table public.profiles add constraint profiles_representation_status_check
  check (representation_status is null or representation_status in ('self_managed', 'represented'));

alter table public.projects
  add column if not exists target_profile_types text[] not null default '{}',
  add column if not exists required_collaborators jsonb not null default '[]'::jsonb,
  add column if not exists required_skills text[] not null default '{}',
  add column if not exists required_languages text[] not null default '{}';
alter table public.projects drop constraint if exists projects_owner_type_check;
alter table public.projects add constraint projects_owner_type_check
  check (owner_type in ('creator', 'brand', 'agency', 'celebrity', 'event', 'media'));
alter table public.projects drop constraint if exists projects_project_type_check;
alter table public.projects add constraint projects_project_type_check
  check (project_type in ('creator_idea', 'brand_campaign', 'agency_project', 'celebrity_project', 'event_project', 'media_project'));
alter table public.projects drop constraint if exists projects_required_collaborators_array;
alter table public.projects add constraint projects_required_collaborators_array
  check (jsonb_typeof(required_collaborators) = 'array');

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
  from public.profiles as p
  where p.id = new.owner_id;

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
  end;
  return new;
end;
$$;

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
  audience_type text, event_scale text, representation_status text
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
      and (nullif(btrim(p_industry), '') is null or lower(coalesce(p.category, '') || ' ' || coalesce(p.company_type, '') || ' ' || array_to_string(coalesce(p.client_industries, '{}'), ' ')) like '%' || lower(btrim(p_industry)) || '%')
      and (nullif(btrim(p_niche), '') is null or lower(coalesce(p.category, '') || ' ' || coalesce(p.profession, '') || ' ' || array_to_string(coalesce(p.content_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.collaboration_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.skills, '{}'), ' ') || ' ' || array_to_string(coalesce(p.event_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.media_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_formats, '{}'), ' ')) like '%' || lower(btrim(p_niche)) || '%')
      and (nullif(btrim(p_location), '') is null or lower(coalesce(p.location, '')) like '%' || lower(btrim(p_location)) || '%')
      and (nullif(btrim(p_language), '') is null or lower(array_to_string(coalesce(p.languages, '{}'), ' ')) like '%' || lower(btrim(p_language)) || '%')
      and (nullif(btrim(p_service), '') is null or lower(array_to_string(coalesce(p.services, '{}'), ' ') || ' ' || array_to_string(coalesce(p.specialisations, '{}'), ' ') || ' ' || array_to_string(coalesce(p.skills, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_formats, '{}'), ' ')) like '%' || lower(btrim(p_service)) || '%')
      and (nullif(btrim(p_platform), '') is null or exists (
        select 1 from public.social_accounts sa
        where sa.user_id = p.id and lower(sa.platform) like '%' || lower(btrim(p_platform)) || '%'
      ))
      and (nullif(btrim(p_search), '') is null or (
        lower(coalesce(p.display_name, '') || ' ' || coalesce(p.company_name, '') || ' ' || coalesce(p.agency_type, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.profession, '') || ' ' || coalesce(p.company_type, '') || ' ' || coalesce(p.audience_type, '') || ' ' || coalesce(p.event_scale, '') || ' ' || coalesce(p.location, '') || ' ' || coalesce(p.bio, '') || ' ' || coalesce(p.website_url, '') || ' ' || array_to_string(coalesce(p.languages, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.collaboration_categories, '{}'), ' ') || ' ' || array_to_string(coalesce(p.services, '{}'), ' ') || ' ' || array_to_string(coalesce(p.specialisations, '{}'), ' ') || ' ' || array_to_string(coalesce(p.skills, '{}'), ' ') || ' ' || array_to_string(coalesce(p.content_formats, '{}'), ' ') || ' ' || array_to_string(coalesce(p.media_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.event_types, '{}'), ' ') || ' ' || array_to_string(coalesce(p.client_industries, '{}'), ' ')) like '%' || lower(btrim(p_search)) || '%'
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
    c.client_industries, c.company_type, c.audience_type, c.event_scale, c.representation_status
  from counted c
  order by c.created_at desc, c.id
  limit greatest(1, least(coalesce(p_limit, 24), 48))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer) to authenticated;
