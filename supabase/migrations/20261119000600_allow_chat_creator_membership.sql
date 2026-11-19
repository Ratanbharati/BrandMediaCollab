-- Permit the authenticated creator of an accepted-connection chat to add their
-- own membership row; the other participant still must be the accepted peer.
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

