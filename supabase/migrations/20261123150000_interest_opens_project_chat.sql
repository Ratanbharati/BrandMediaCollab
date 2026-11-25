-- Start a private project conversation when a member expresses interest.
-- Direct profile conversations remain restricted to accepted connections.

drop policy if exists conversations_creator_insert on public.conversations;
create policy conversations_creator_insert on public.conversations
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and is_group = false
    and (
      (
        project_id is not null
        and exists (
          select 1
          from public.projects p
          join public.applications a on a.project_id = p.id
          where p.id = conversations.project_id
            and a.status in ('interested', 'working_together')
            and (
              (p.owner_id = (select auth.uid()) and a.applicant_id <> (select auth.uid()))
              or (a.applicant_id = (select auth.uid()) and p.owner_id <> (select auth.uid()))
            )
            and not exists (
              select 1 from public.profile_blocks b
              where (b.blocker_id = p.owner_id and b.blocked_id = a.applicant_id)
                 or (b.blocker_id = a.applicant_id and b.blocked_id = p.owner_id)
            )
        )
      )
      or (
        project_id is null
        and exists (
          select 1 from public.profile_connections pc
          where pc.status = 'accepted'
            and (
              (pc.requester_id = (select auth.uid()) and pc.recipient_id <> (select auth.uid()))
              or (pc.recipient_id = (select auth.uid()) and pc.requester_id <> (select auth.uid()))
            )
            and not exists (
              select 1 from public.profile_blocks b
              where (b.blocker_id = pc.requester_id and b.blocked_id = pc.recipient_id)
                 or (b.blocker_id = pc.recipient_id and b.blocked_id = pc.requester_id)
            )
        )
      )
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
        and c.is_group = false
        and (
          (
            c.project_id is not null
            and exists (
              select 1
              from public.projects p
              join public.applications a on a.project_id = p.id
              where p.id = c.project_id
                and a.status in ('interested', 'working_together')
                and (
                  (p.owner_id = (select auth.uid()) and
                    (user_id = (select auth.uid()) or user_id = a.applicant_id))
                  or
                  (a.applicant_id = (select auth.uid()) and
                    (user_id = (select auth.uid()) or user_id = p.owner_id))
                )
                and not exists (
                  select 1 from public.profile_blocks b
                  where (b.blocker_id = p.owner_id and b.blocked_id = a.applicant_id)
                     or (b.blocker_id = a.applicant_id and b.blocked_id = p.owner_id)
                )
            )
          )
          or (
            c.project_id is null
            and (
              user_id = (select auth.uid())
              or exists (
                select 1 from public.profile_connections pc
                where pc.status = 'accepted'
                  and (
                    (pc.requester_id = (select auth.uid()) and pc.recipient_id = user_id)
                    or (pc.recipient_id = (select auth.uid()) and pc.requester_id = user_id)
                  )
                  and not exists (
                    select 1 from public.profile_blocks b
                    where (b.blocker_id = pc.requester_id and b.blocked_id = pc.recipient_id)
                       or (b.blocker_id = pc.recipient_id and b.blocked_id = pc.requester_id)
                  )
            )
          )
        )
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
        and (
          (pc.requester_id = chat.created_by and pc.recipient_id = new.user_id)
          or (pc.recipient_id = chat.created_by and pc.requester_id = new.user_id)
        )
        and not exists (
          select 1 from public.profile_blocks b
          where (b.blocker_id = pc.requester_id and b.blocked_id = pc.recipient_id)
             or (b.blocker_id = pc.recipient_id and b.blocked_id = pc.requester_id)
        )
    ) then
      raise exception 'Direct messages require an accepted connection.' using errcode = '42501';
    end if;
  elsif not exists (
    select 1
    from public.projects p
    join public.applications a on a.project_id = p.id
    where p.id = chat.project_id
      and a.status in ('interested', 'working_together')
      and (
        (p.owner_id = chat.created_by and
          (new.user_id = chat.created_by or new.user_id = a.applicant_id))
        or
        (a.applicant_id = chat.created_by and
          (new.user_id = chat.created_by or new.user_id = p.owner_id))
      )
      and not exists (
        select 1 from public.profile_blocks b
        where (b.blocker_id = p.owner_id and b.blocked_id = a.applicant_id)
           or (b.blocker_id = a.applicant_id and b.blocked_id = p.owner_id)
      )
  ) then
    raise exception 'Project chat requires an active project interest.' using errcode = '42501';
  end if;

  if (select count(*) from public.conversation_members cm where cm.conversation_id = new.conversation_id) >= 2 then
    raise exception 'A private conversation can only have two members.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_one_to_one_project_chat() from public, anon, authenticated;

drop policy if exists messages_member_send on public.messages;
create policy messages_member_send on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select app_private.is_conversation_member(messages.conversation_id))
    and not exists (
      select 1
      from public.conversation_members mine
      join public.conversation_members other on other.conversation_id = mine.conversation_id and other.user_id <> mine.user_id
      join public.profile_blocks b
        on (b.blocker_id = mine.user_id and b.blocked_id = other.user_id)
        or (b.blocker_id = other.user_id and b.blocked_id = mine.user_id)
      where mine.conversation_id = messages.conversation_id
        and mine.user_id = (select auth.uid())
    )
    and (
      exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id and c.project_id is null
      )
      or exists (
        select 1
        from public.conversations c
        join public.projects p on p.id = c.project_id
        join public.applications a on a.project_id = p.id
        where c.id = messages.conversation_id
          and a.status in ('interested', 'working_together')
          and (
            (p.owner_id = (select auth.uid()) and a.applicant_id <> (select auth.uid()))
            or (a.applicant_id = (select auth.uid()) and p.owner_id <> (select auth.uid()))
          )
      )
    )
  );

-- Atomically persist the interest, private conversation, membership, and opener
-- message so a failed step cannot leave a partial conversation behind.
create or replace function public.submit_project_interest(p_project_id uuid, p_message text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_project_name text;
  v_application_id uuid;
  v_application_status text;
  v_conversation_id uuid;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_new_submission boolean := false;
begin
  if v_user_id is null then
    raise exception 'Please log in before expressing interest.' using errcode = '42501';
  end if;
  if p_project_id is null then
    raise exception 'Choose a project before expressing interest.' using errcode = '22023';
  end if;
  if length(coalesce(v_message, '')) > 1000 then
    raise exception 'Your note must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  select p.owner_id, p.project_name
    into v_owner_id, v_project_name
    from public.projects p
    where p.id = p_project_id;
  if not found then
    raise exception 'This project is unavailable.' using errcode = 'P0002';
  end if;
  if v_owner_id = v_user_id then
    raise exception 'You cannot express interest in your own project.' using errcode = '42501';
  end if;

  if v_message is null then
    v_message := 'Hi, I am interested in "' || coalesce(v_project_name, 'this project') || '". Let us discuss it here.';
  end if;

  select a.id, a.status
    into v_application_id, v_application_status
    from public.applications a
    where a.project_id = p_project_id and a.applicant_id = v_user_id
    for update;

  if not found then
    insert into public.applications(project_id, applicant_id, status, message)
    values (p_project_id, v_user_id, 'interested', v_message)
    returning id into v_application_id;
    v_application_status := 'interested';
    v_new_submission := true;
  elsif v_application_status = 'withdrawn' then
    update public.applications
      set status = 'interested', message = v_message, updated_at = now()
      where id = v_application_id;
    v_application_status := 'interested';
    v_new_submission := true;
  elsif v_application_status not in ('interested', 'working_together') then
    raise exception 'This project application is no longer active.' using errcode = '42501';
  end if;

  select c.id
    into v_conversation_id
    from public.conversations c
    where c.project_id = p_project_id
      and c.is_group = false
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c.id and cm.user_id = v_user_id
      )
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c.id and cm.user_id = v_owner_id
      )
    order by c.created_at
    limit 1;

  if v_conversation_id is null then
    insert into public.conversations(project_id, created_by, is_group)
    values (p_project_id, v_user_id, false)
    returning id into v_conversation_id;

    insert into public.conversation_members(conversation_id, user_id)
    values (v_conversation_id, v_user_id), (v_conversation_id, v_owner_id);

    insert into public.messages(conversation_id, sender_id, body)
    values (v_conversation_id, v_user_id, v_message);
  elsif v_new_submission then
    insert into public.messages(conversation_id, sender_id, body)
    values (v_conversation_id, v_user_id, v_message);
  end if;

  return v_conversation_id;
end;
$$;

revoke all on function public.submit_project_interest(uuid, text) from public, anon;
grant execute on function public.submit_project_interest(uuid, text) to authenticated;

