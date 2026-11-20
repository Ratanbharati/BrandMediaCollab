-- Profile discovery, private connection requests, and connected-user chat.

create table if not exists public.profile_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint profile_connections_not_self check (requester_id <> recipient_id)
);

create unique index if not exists profile_connections_pair_unique
  on public.profile_connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index if not exists profile_connections_requester_status_idx
  on public.profile_connections (requester_id, status, updated_at desc);
create index if not exists profile_connections_recipient_status_idx
  on public.profile_connections (recipient_id, status, updated_at desc);

create table if not exists public.profile_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint profile_blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.profile_connections enable row level security;
alter table public.profile_blocks enable row level security;
grant select, insert, update on public.profile_connections to authenticated;
grant select, insert, delete on public.profile_blocks to authenticated;

drop policy if exists profile_connections_read_participant on public.profile_connections;
create policy profile_connections_read_participant on public.profile_connections
  for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
drop policy if exists profile_connections_request on public.profile_connections;
create policy profile_connections_request on public.profile_connections
  for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and status = 'pending'
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.is_discoverable)
  );
drop policy if exists profile_connections_update_participant on public.profile_connections;
create policy profile_connections_update_participant on public.profile_connections
  for update to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  with check (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists profile_blocks_read_participant on public.profile_blocks;
create policy profile_blocks_read_participant on public.profile_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));
drop policy if exists profile_blocks_create_self on public.profile_blocks;
create policy profile_blocks_create_self on public.profile_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);
drop policy if exists profile_blocks_remove_self on public.profile_blocks;
create policy profile_blocks_remove_self on public.profile_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

create or replace function app_private.guard_profile_connection_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.requester_id is distinct from (select auth.uid()) or new.status <> 'pending' then
      raise exception 'Connection requests must be created by the signed-in requester.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.profile_blocks b
      where (b.blocker_id = new.requester_id and b.blocked_id = new.recipient_id)
         or (b.blocker_id = new.recipient_id and b.blocked_id = new.requester_id)
    ) then
      raise exception 'This profile is unavailable for connection requests.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.recipient_id and p.is_discoverable) then
      raise exception 'This profile is not accepting connection requests.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.requester_id <> new.requester_id or old.recipient_id <> new.recipient_id then
    if old.status not in ('declined', 'canceled') or new.status <> 'pending'
       or (select auth.uid()) not in (old.requester_id, old.recipient_id)
       or new.requester_id <> (select auth.uid()) then
      raise exception 'Connection participants cannot be changed.' using errcode = '42501';
    end if;
    if old.requester_id = (select auth.uid()) and new.recipient_id <> old.recipient_id then
      raise exception 'Connection participants cannot be changed.' using errcode = '42501';
    elsif old.recipient_id = (select auth.uid()) and new.recipient_id <> old.requester_id then
      raise exception 'Connection participants cannot be changed.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.profile_blocks b
      where (b.blocker_id = new.requester_id and b.blocked_id = new.recipient_id)
         or (b.blocker_id = new.recipient_id and b.blocked_id = new.requester_id)
    ) then
      raise exception 'This profile is unavailable for connection requests.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.recipient_id and p.is_discoverable) then
      raise exception 'This profile is not accepting connection requests.' using errcode = '42501';
    end if;
  elsif old.status = 'pending' and old.recipient_id = (select auth.uid()) and new.status in ('accepted', 'declined') then
    new.accepted_at := case when new.status = 'accepted' then now() else null end;
  elsif old.status = 'pending' and old.requester_id = (select auth.uid()) and new.status = 'canceled' then
    new.accepted_at := null;
  elsif old.status in ('declined', 'canceled') and new.status = 'pending'
        and (select auth.uid()) in (old.requester_id, old.recipient_id) then
    new.requester_id := (select auth.uid());
    new.recipient_id := case when old.requester_id = (select auth.uid()) then old.recipient_id else old.requester_id end;
    if exists (
      select 1 from public.profile_blocks b
      where (b.blocker_id = new.requester_id and b.blocked_id = new.recipient_id)
         or (b.blocker_id = new.recipient_id and b.blocked_id = new.requester_id)
    ) then
      raise exception 'This profile is unavailable for connection requests.' using errcode = '42501';
    end if;
    new.accepted_at := null;
    new.created_at := now();
  else
    raise exception 'Invalid connection request state change.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_profile_connection_before_write on public.profile_connections;
create trigger guard_profile_connection_before_write
before insert or update on public.profile_connections
for each row execute function app_private.guard_profile_connection_write();
revoke all on function app_private.guard_profile_connection_write() from public, anon, authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('application_received', 'application_status', 'new_message', 'connection_request', 'connection_accepted', 'connection_declined'));

create or replace function app_private.notify_profile_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id, actor_id, type, title, body)
    values (new.recipient_id, new.requester_id, 'connection_request', 'New connection request', 'A Stagerang member would like to connect with you.');
  elsif old.status is distinct from new.status and new.status = 'accepted' then
    insert into public.notifications(user_id, actor_id, type, title, body)
    values (new.requester_id, new.recipient_id, 'connection_accepted', 'Connection accepted', 'Your connection request was accepted. You can now message each other.');
  elsif old.status is distinct from new.status and new.status = 'declined' then
    insert into public.notifications(user_id, actor_id, type, title, body)
    values (new.requester_id, new.recipient_id, 'connection_declined', 'Connection request updated', 'Your connection request was declined.');
  elsif old.status is distinct from new.status and new.status = 'pending' then
    insert into public.notifications(user_id, actor_id, type, title, body)
    values (new.recipient_id, new.requester_id, 'connection_request', 'New connection request', 'A Stagerang member would like to connect with you.');
  end if;
  return new;
end;
$$;
drop trigger if exists profile_connections_notify on public.profile_connections;
create trigger profile_connections_notify
after insert or update on public.profile_connections
for each row execute function app_private.notify_profile_connection();
revoke all on function app_private.notify_profile_connection() from public, anon, authenticated;

create or replace function public.discover_profiles(
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
  portfolio_links text[], social_accounts jsonb, created_at timestamptz, total_count bigint
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
      and (nullif(btrim(p_industry), '') is null or lower(coalesce(p.category, '')) like '%' || lower(btrim(p_industry)) || '%')
      and (nullif(btrim(p_niche), '') is null or lower(coalesce(p.category, '') || ' ' || array_to_string(p.content_categories, ' ') || ' ' || array_to_string(p.collaboration_categories, ' ')) like '%' || lower(btrim(p_niche)) || '%')
      and (nullif(btrim(p_location), '') is null or lower(coalesce(p.location, '')) like '%' || lower(btrim(p_location)) || '%')
      and (nullif(btrim(p_language), '') is null or lower(array_to_string(p.languages, ' ')) like '%' || lower(btrim(p_language)) || '%')
      and (nullif(btrim(p_service), '') is null or lower(array_to_string(p.services, ' ') || ' ' || array_to_string(p.specialisations, ' ')) like '%' || lower(btrim(p_service)) || '%')
      and (nullif(btrim(p_platform), '') is null or exists (
        select 1 from public.social_accounts sa
        where sa.user_id = p.id and lower(sa.platform) like '%' || lower(btrim(p_platform)) || '%'
      ))
      and (nullif(btrim(p_search), '') is null or (
        lower(coalesce(p.display_name, '') || ' ' || coalesce(p.company_name, '') || ' ' || coalesce(p.agency_type, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.location, '') || ' ' || coalesce(p.bio, '') || ' ' || coalesce(p.website_url, '') || ' ' || array_to_string(p.languages, ' ') || ' ' || array_to_string(p.content_categories, ' ') || ' ' || array_to_string(p.collaboration_categories, ' ') || ' ' || array_to_string(p.services, ' ') || ' ' || array_to_string(p.specialisations, ' ')) like '%' || lower(btrim(p_search)) || '%'
        or exists (select 1 from public.social_accounts sa where sa.user_id = p.id and lower(sa.platform || ' ' || sa.profile_url) like '%' || lower(btrim(p_search)) || '%')
      ))
  ), counted as (
    select candidates.*, count(*) over() as result_count from candidates
  )
  select c.id, c.account_type, c.display_name, c.company_name, c.agency_type, c.category,
    c.location, c.bio, c.avatar_url, c.website_url, c.follower_tier,
    c.languages, c.content_categories, c.collaboration_categories, c.services,
    c.specialisations, c.portfolio_links, c.public_social_accounts, c.created_at, c.result_count
  from counted c
  order by c.created_at desc, c.id
  limit greatest(1, least(coalesce(p_limit, 24), 48))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.discover_profiles(text, text, text, text, text, text, text, text, integer, integer) to authenticated;

-- Discoverable profiles remain visible only when neither side has blocked the other.
drop policy if exists profiles_read_members on public.profiles;
create policy profiles_read_members on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app_private.is_platform_admin())
    or (is_discoverable and not exists (
      select 1 from public.profile_blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = profiles.id)
         or (b.blocker_id = profiles.id and b.blocked_id = (select auth.uid()))
    ))
  );
drop policy if exists social_accounts_read_members on public.social_accounts;
create policy social_accounts_read_members on public.social_accounts
  for select to authenticated
  using (
    user_id = (select auth.uid()) or (select app_private.is_platform_admin())
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

-- A direct conversation is allowed only between accepted connections. Existing
-- project conversations continue to require a working-together application.
drop policy if exists conversations_creator_insert on public.conversations;
create policy conversations_creator_insert on public.conversations
  for insert to authenticated
  with check (
    created_by = (select auth.uid()) and is_group = false
    and (
      (project_id is not null and exists (
        select 1 from public.projects p join public.applications a on a.project_id = p.id
        where p.id = conversations.project_id and a.status = 'working_together'
          and (p.owner_id = (select auth.uid()) or a.applicant_id = (select auth.uid()))
      ))
      or (project_id is null and exists (
        select 1 from public.profile_connections pc
        where pc.status = 'accepted'
          and ((pc.requester_id = (select auth.uid()) and pc.recipient_id <> (select auth.uid()))
            or (pc.recipient_id = (select auth.uid()) and pc.requester_id <> (select auth.uid())))
          and not exists (
            select 1 from public.profile_blocks b
            where (b.blocker_id = pc.requester_id and b.blocked_id = pc.recipient_id)
               or (b.blocker_id = pc.recipient_id and b.blocked_id = pc.requester_id)
          )
      ))
    )
  );

drop policy if exists members_creator_add on public.conversation_members;
create policy members_creator_add on public.conversation_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = (select auth.uid()) and c.is_group = false
        and (
          (c.project_id is not null and exists (
            select 1 from public.projects p join public.applications a on a.project_id = p.id
            where p.id = c.project_id and a.status = 'working_together'
              and ((p.owner_id = (select auth.uid()) and (user_id = (select auth.uid()) or a.applicant_id = user_id))
                or (a.applicant_id = (select auth.uid()) and (user_id = (select auth.uid()) or p.owner_id = user_id)))
          ))
          or (c.project_id is null and (
            user_id = (select auth.uid())
            or exists (
              select 1 from public.profile_connections pc
              where pc.status = 'accepted'
                and ((pc.requester_id = (select auth.uid()) and pc.recipient_id = user_id)
                  or (pc.recipient_id = (select auth.uid()) and pc.requester_id = user_id))
                and not exists (
                  select 1 from public.profile_blocks b
                  where (b.blocker_id = pc.requester_id and b.blocked_id = pc.recipient_id)
                     or (b.blocker_id = pc.recipient_id and b.blocked_id = pc.requester_id)
                )
            )
          ))
        )
    )
  );

create or replace function app_private.enforce_one_to_one_project_chat()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chat public.conversations;
begin
  select c.* into chat from public.conversations c where c.id = new.conversation_id;
  if not found or chat.is_group then
    raise exception 'Only one-to-one conversations are supported.' using errcode = '42501';
  end if;
  if chat.project_id is null then
    if new.user_id <> chat.created_by and not exists (
      select 1 from public.profile_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = chat.created_by and pc.recipient_id = new.user_id)
          or (pc.recipient_id = chat.created_by and pc.requester_id = new.user_id))
        and not exists (
          select 1 from public.profile_blocks b
          where (b.blocker_id = pc.requester_id and b.blocked_id = pc.recipient_id)
             or (b.blocker_id = pc.recipient_id and b.blocked_id = pc.requester_id)
        )
    ) then
      raise exception 'Direct messages require an accepted Stagerang connection.' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from public.projects p join public.applications a on a.project_id = p.id
    where p.id = chat.project_id and a.status = 'working_together'
      and ((p.owner_id = chat.created_by and (new.user_id = chat.created_by or a.applicant_id = new.user_id))
        or (a.applicant_id = chat.created_by and (new.user_id = chat.created_by or p.owner_id = new.user_id)))
  ) then
    raise exception 'Project conversations require an accepted project collaboration.' using errcode = '42501';
  end if;
  if (select count(*) from public.conversation_members cm where cm.conversation_id = new.conversation_id) >= 2 then
    raise exception 'A private conversation can only have two members.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_one_to_one_project_chat on public.conversation_members;
create trigger enforce_one_to_one_project_chat
before insert on public.conversation_members
for each row execute function app_private.enforce_one_to_one_project_chat();
revoke all on function app_private.enforce_one_to_one_project_chat() from public, anon, authenticated;

drop policy if exists messages_member_send on public.messages;
create policy messages_member_send on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select app_private.is_conversation_member(messages.conversation_id))
    and not exists (
      select 1 from public.conversation_members mine
      join public.conversation_members other on other.conversation_id = mine.conversation_id and other.user_id <> mine.user_id
      join public.profile_blocks b on (b.blocker_id = mine.user_id and b.blocked_id = other.user_id)
        or (b.blocker_id = other.user_id and b.blocked_id = mine.user_id)
      where mine.conversation_id = messages.conversation_id and mine.user_id = (select auth.uid())
    )
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profile_connections') then
    execute 'alter publication supabase_realtime add table public.profile_connections';
  end if;
end;
$$;
