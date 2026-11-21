-- Initialize every new Auth user and their base rows in the same transaction.
-- Preserve existing rows; the profile insert is idempotent on the Auth user ID.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  chosen_type text;
  chosen_name text;
begin
  chosen_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'creator'));
  if chosen_type = 'influencer' then
    chosen_type := 'creator';
  end if;

  if chosen_type not in ('brand', 'creator', 'agency', 'celebrity', 'event', 'media') then
    raise exception 'Unsupported Stagerang account type.' using errcode = '22023';
  end if;

  chosen_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100);

  insert into public.profiles (
    id, account_type, display_name, onboarding_completed, is_discoverable
  ) values (
    new.id, chosen_type, chosen_name, false, false
  )
  on conflict (id) do nothing;

  insert into public.private_contacts (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update
    set email = excluded.email;

  return new;
end;
$function$;
