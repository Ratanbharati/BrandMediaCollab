-- Let the person who created a block open that profile to undo the block.
drop policy if exists profiles_read_members on public.profiles;
create policy profiles_read_members on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app_private.is_platform_admin())
    or exists (
      select 1 from public.profile_blocks b
      where b.blocker_id = (select auth.uid()) and b.blocked_id = profiles.id
    )
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
