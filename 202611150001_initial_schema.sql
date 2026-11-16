-- Brand Media Collab initial schema. Empty tables; no demo data is seeded.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('brand', 'creator', 'agency')),
  display_name text not null default '',
  company_name text,
  agency_type text,
  bio text not null default '',
  category text,
  location text,
  website_url text,
  content_categories text[] not null default '{}',
  follower_tier text,
  is_discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.private_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

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

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_type text not null check (owner_type in ('brand', 'creator', 'agency')),
  project_type text not null check (project_type in ('brand_campaign', 'creator_idea')),
  project_name text not null,
  category text not null,
  location text,
  requirements text not null,
  application_deadline date,
  delivery_date date,
  timeline_start date,
  timeline_end date,
  creator_tiers text[] not null default '{}',
  platforms text[] not null default '{}',
  usage_permissions text,
  reshare_permissions text,
  budget_by_deliverable jsonb not null default '[]'::jsonb,
  status text not null default 'Open' check (status in ('Open', 'Draft', 'Paused', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  deliverable_type text not null,
  amount_min numeric(12,2),
  amount_max numeric(12,2),
  currency text not null default 'INR',
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'interested' check (status in ('interested', 'rejected', 'working_together', 'withdrawn')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, applicant_id)
);

create table if not exists public.saved_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_group boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  attendee_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  calendar_event_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  payer_id uuid references auth.users(id) on delete set null,
  payee_id uuid references auth.users(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  status text not null default 'pending',
  provider_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id, created_at desc);
create index if not exists projects_discovery_idx on public.projects(status, application_deadline);
create index if not exists applications_project_idx on public.applications(project_id, created_at desc);
create index if not exists applications_user_idx on public.applications(applicant_id, created_at desc);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_type text;
begin
  chosen_type := coalesce(new.raw_user_meta_data ->> 'account_type', 'creator');
  if chosen_type = 'influencer' then chosen_type := 'creator'; end if;
  if chosen_type not in ('brand', 'creator', 'agency') then chosen_type := 'creator'; end if;
  insert into public.profiles (id, account_type, display_name)
  values (new.id, chosen_type, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  insert into public.private_contacts (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.private_contacts enable row level security;
alter table public.platform_admins enable row level security;
alter table public.social_accounts enable row level security;
alter table public.projects enable row level security;
alter table public.project_deliverables enable row level security;
alter table public.applications enable row level security;
alter table public.saved_projects enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.meetings enable row level security;
alter table public.support_requests enable row level security;
alter table public.payment_records enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists profiles_read_members on public.profiles;
create policy profiles_read_members on public.profiles for select to authenticated using (is_discoverable or id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists profiles_write_self on public.profiles;
create policy profiles_write_self on public.profiles for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid()) or (select public.is_platform_admin())) with check (id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists private_contacts_self_or_admin on public.private_contacts;
create policy private_contacts_self_or_admin on public.private_contacts for select to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists private_contacts_write_self on public.private_contacts;
create policy private_contacts_write_self on public.private_contacts for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists private_contacts_update_self on public.private_contacts;
create policy private_contacts_update_self on public.private_contacts for update to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin())) with check (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists platform_admins_read_self on public.platform_admins;
create policy platform_admins_read_self on public.platform_admins for select to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists social_accounts_read_members on public.social_accounts;
create policy social_accounts_read_members on public.social_accounts for select to authenticated using (true);
drop policy if exists social_accounts_owner_manage on public.social_accounts;
create policy social_accounts_owner_manage on public.social_accounts for all to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin())) with check (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists projects_discover_or_owner on public.projects;
create policy projects_discover_or_owner on public.projects for select to authenticated using (status = 'Open' or owner_id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists projects_owner_insert on public.projects;
create policy projects_owner_insert on public.projects for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists projects_owner_update on public.projects;
create policy projects_owner_update on public.projects for update to authenticated using (owner_id = (select auth.uid()) or (select public.is_platform_admin())) with check (owner_id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists projects_owner_delete on public.projects;
create policy projects_owner_delete on public.projects for delete to authenticated using (owner_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists deliverables_read_project_members on public.project_deliverables;
create policy deliverables_read_project_members on public.project_deliverables for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.status = 'Open' or p.owner_id = (select auth.uid()) or (select public.is_platform_admin()))));
drop policy if exists deliverables_owner_manage on public.project_deliverables;
create policy deliverables_owner_manage on public.project_deliverables
for all to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and (p.owner_id = (select auth.uid()) or (select public.is_platform_admin()))
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and (p.owner_id = (select auth.uid()) or (select public.is_platform_admin()))
  )
);

drop policy if exists applications_reader on public.applications;
create policy applications_reader on public.applications for select to authenticated using (applicant_id = (select auth.uid()) or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())) or (select public.is_platform_admin()));
drop policy if exists applications_insert_self on public.applications;
create policy applications_insert_self on public.applications for insert to authenticated with check (applicant_id = (select auth.uid()));
drop policy if exists applications_update_parties on public.applications;
create policy applications_update_parties on public.applications for update to authenticated using (applicant_id = (select auth.uid()) or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())) or (select public.is_platform_admin())) with check (applicant_id = (select auth.uid()) or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())) or (select public.is_platform_admin()));

drop policy if exists saved_projects_self on public.saved_projects;
create policy saved_projects_self on public.saved_projects for all to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin())) with check (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists conversations_members_read on public.conversations;
create policy conversations_members_read on public.conversations for select to authenticated using (created_by = (select auth.uid()) or (select public.is_conversation_member(id)) or (select public.is_platform_admin()));
drop policy if exists conversations_creator_insert on public.conversations;
create policy conversations_creator_insert on public.conversations for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists members_read_conversation on public.conversation_members;
create policy members_read_conversation on public.conversation_members for select to authenticated using (user_id = (select auth.uid()) or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = (select auth.uid())) or (select public.is_platform_admin()));
drop policy if exists members_creator_add on public.conversation_members;
create policy members_creator_add on public.conversation_members for insert to authenticated with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = (select auth.uid())));
drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated using ((select public.is_conversation_member(conversation_id)) or (select public.is_platform_admin()));
drop policy if exists messages_member_send on public.messages;
create policy messages_member_send on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and (select public.is_conversation_member(conversation_id)));

drop policy if exists meetings_parties_read on public.meetings;
create policy meetings_parties_read on public.meetings for select to authenticated using (organizer_id = (select auth.uid()) or attendee_id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists meetings_organizer_manage on public.meetings;
create policy meetings_organizer_manage on public.meetings for all to authenticated using (organizer_id = (select auth.uid()) or (select public.is_platform_admin())) with check (organizer_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists support_owner_admin_read on public.support_requests;
create policy support_owner_admin_read on public.support_requests for select to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists support_owner_insert on public.support_requests;
create policy support_owner_insert on public.support_requests for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists support_owner_admin_update on public.support_requests;
create policy support_owner_admin_update on public.support_requests for update to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin())) with check (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists payments_parties_admin_read on public.payment_records;
create policy payments_parties_admin_read on public.payment_records for select to authenticated using (payer_id = (select auth.uid()) or payee_id = (select auth.uid()) or (select public.is_platform_admin()));
drop policy if exists payments_admin_manage on public.payment_records;
create policy payments_admin_manage on public.payment_records for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

drop policy if exists audit_admin_read on public.admin_audit_logs;
create policy audit_admin_read on public.admin_audit_logs for select to authenticated using ((select public.is_platform_admin()));
drop policy if exists audit_admin_insert on public.admin_audit_logs;
create policy audit_admin_insert on public.admin_audit_logs for insert to authenticated with check ((select public.is_platform_admin()) and admin_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
