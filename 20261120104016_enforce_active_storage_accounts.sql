-- Close avatar upload/update/delete access for suspended accounts while their
-- previously issued JWTs remain valid. Existing public avatar reads stay public.
drop policy if exists account_active_gate on storage.objects;
create policy account_active_gate on storage.objects as restrictive for all to authenticated
  using ((select app_private.is_account_active()))
  with check ((select app_private.is_account_active()));
