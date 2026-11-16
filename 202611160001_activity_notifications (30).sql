-- In-app alerts for application activity and private messages. Run once in Supabase SQL Editor.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  application_id uuid references public.applications(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  type text not null check (type in ('application_received','application_status','new_message')),
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notifications_mark_own on public.notifications;
create policy notifications_mark_own on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Let either participant read the two membership rows for their private chat.
drop policy if exists members_read_conversation on public.conversation_members;
create policy members_read_conversation on public.conversation_members for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_conversation_member(conversation_id)) or (select public.is_platform_admin()));

create or replace function public.has_applied_to_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications a where a.project_id=p_project_id and a.applicant_id=(select auth.uid()));
$$;
drop policy if exists projects_discover_or_owner on public.projects;
create policy projects_discover_or_owner on public.projects for select to authenticated
using (status='Open' or owner_id=(select auth.uid()) or (select public.has_applied_to_project(id))
  or exists (select 1 from public.saved_projects s where s.project_id=id and s.user_id=(select auth.uid()))
  or (select public.is_platform_admin()));

create or replace function public.notify_application_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_owner uuid; project_title text;
begin
  select p.owner_id, p.project_name into project_owner, project_title from public.projects p where p.id = new.project_id;
  if tg_op = 'INSERT' and project_owner is not null and project_owner <> new.applicant_id then
    insert into public.notifications(user_id,actor_id,project_id,application_id,type,title,body)
    values (project_owner,new.applicant_id,new.project_id,new.id,'application_received','New project interest','Someone expressed interest in “'||coalesce(project_title,'your project')||'”.');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.applicant_id is not null and project_owner = auth.uid() then
    insert into public.notifications(user_id,actor_id,project_id,application_id,type,title,body)
    values (new.applicant_id,project_owner,new.project_id,new.id,'application_status','Project application updated','Your application for “'||coalesce(project_title,'a project')||'” is now '||replace(new.status,'_',' ')||'.');
  end if;
  return new;
end; $$;
drop trigger if exists applications_notify_activity on public.applications;
create trigger applications_notify_activity after insert or update on public.applications for each row execute function public.notify_application_activity();

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_title text; sender_name text;
begin
  select p.project_name into project_title from public.conversations c left join public.projects p on p.id=c.project_id where c.id=new.conversation_id;
  select coalesce(nullif(pr.display_name,''),nullif(pr.company_name,''),'A member') into sender_name from public.profiles pr where pr.id=new.sender_id;
  insert into public.notifications(user_id,actor_id,project_id,conversation_id,type,title,body)
  select cm.user_id,new.sender_id,c.project_id,new.conversation_id,'new_message','New project message',coalesce(sender_name,'A member')||' sent a message in “'||coalesce(project_title,'your conversation')||'”.'
  from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
  return new;
end; $$;
drop trigger if exists messages_notify_activity on public.messages;
create trigger messages_notify_activity after insert on public.messages for each row execute function public.notify_new_message();
