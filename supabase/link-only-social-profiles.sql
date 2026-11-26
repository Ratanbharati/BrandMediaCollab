-- Link-only profile support for Brand Media Collab.
-- This stores public URLs only. It does not authorize Instagram/YouTube or fetch analytics.
begin;

alter table public.profiles
  add column if not exists website_url text;

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  profile_url text not null,
  follower_count bigint,
  engagement_rate numeric(6,3),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform, profile_url)
);

alter table public.social_accounts
  add column if not exists platform text,
  add column if not exists profile_url text,
  add column if not exists follower_count bigint,
  add column if not exists engagement_rate numeric(6,3),
  add column if not exists last_synced_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'social_accounts'
      and indexdef ilike '%unique%(user_id, platform, profile_url)%'
  ) then
    create unique index social_accounts_profile_link_unique_idx
      on public.social_accounts (user_id, platform, profile_url);
  end if;
end;
$$;

alter table public.social_accounts enable row level security;
grant select, insert, update, delete on public.social_accounts to authenticated;

-- Members can manage their own links. Admins retain their existing moderation access.
drop policy if exists social_accounts_owner_manage on public.social_accounts;
create policy social_accounts_owner_manage
  on public.social_accounts for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_platform_admin()));

-- Other signed-in members see links only for discoverable profiles, respecting blocks.
drop policy if exists social_accounts_read_members on public.social_accounts;
create policy social_accounts_read_members
  on public.social_accounts for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_platform_admin())
    or exists (
      select 1 from public.profile_blocks b
      where b.blocker_id = (select auth.uid()) and b.blocked_id = social_accounts.user_id
    )
    or exists (
      select 1 from public.profiles p
      where p.id = social_accounts.user_id and p.is_discoverable
        and not exists (
          select 1 from public.profile_blocks b
          where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
             or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
        )
    )
  );

commit;
