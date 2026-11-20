drop policy if exists conversations_creator_insert on public.conversations;
create policy conversations_creator_insert on public.conversations
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and project_id is not null
  and is_group = false
  and exists (
    select 1
    from public.projects p
    join public.applications a on a.project_id = p.id
    where p.id = conversations.project_id
      and a.status = 'working_together'
      and (p.owner_id = (select auth.uid()) or a.applicant_id = (select auth.uid()))
  )
);

drop policy if exists members_creator_add on public.conversation_members;
create policy members_creator_add on public.conversation_members
for insert to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.created_by = (select auth.uid())
      and c.project_id is not null
      and c.is_group = false
  )
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.conversations c
      join public.projects p on p.id = c.project_id
      join public.applications a on a.project_id = p.id and a.status = 'working_together'
      where c.id = conversation_id
        and c.created_by = (select auth.uid())
        and c.is_group = false
        and ((p.owner_id = (select auth.uid()) and a.applicant_id = user_id)
          or (a.applicant_id = (select auth.uid()) and p.owner_id = user_id))
    )
  )
);

create or replace function app_private.enforce_one_to_one_project_chat()
returns trigger
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
begin
  if exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and (c.is_group or c.project_id is null)
  ) then
    raise exception 'Project conversations must be one-to-one and linked to a project.' using errcode = '42501';
  end if;
  if (select count(*) from public.conversation_members cm where cm.conversation_id = new.conversation_id) >= 2 then
    raise exception 'A project conversation can only have two members.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_one_to_one_project_chat on public.conversation_members;
create trigger enforce_one_to_one_project_chat
before insert on public.conversation_members
for each row execute function app_private.enforce_one_to_one_project_chat();