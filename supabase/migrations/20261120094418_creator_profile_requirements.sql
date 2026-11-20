-- Keep Creator legal names private and enforce the Creator completion contract.
alter table public.private_contacts
  add column if not exists full_name text;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  chosen_type text;
  chosen_name text;
  legal_name text;
begin
  chosen_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'creator'));
  if chosen_type = 'influencer' then
    chosen_type := 'creator';
  end if;

  if chosen_type not in ('brand', 'creator', 'agency', 'celebrity', 'event', 'media') then
    raise exception 'Unsupported Stagerang account type.' using errcode = '22023';
  end if;

  chosen_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100);
  legal_name := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160), '');

  insert into public.profiles (
    id, account_type, display_name, onboarding_completed, is_discoverable
  ) values (
    new.id, chosen_type, chosen_name, false, false
  )
  on conflict (id) do nothing;

  insert into public.private_contacts (user_id, email, full_name)
  values (new.id, new.email, legal_name)
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(btrim(public.private_contacts.full_name), ''), excluded.full_name);

  return new;
end;
$function$;

create or replace function public.validate_completed_profile()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  private_phone text;
  private_full_name text;
begin
  if not new.onboarding_completed then
    return new;
  end if;

  if new.account_type = 'creator' then
    if nullif(btrim(new.display_name), '') is null
       or nullif(btrim(new.location), '') is null
       or nullif(btrim(new.bio), '') is null
       or nullif(btrim(new.category), '') is null
       or nullif(btrim(new.avatar_url), '') is null then
      raise exception 'Creator display name, location, bio, primary category, and profile photo are required to complete onboarding.'
        using errcode = '23514';
    end if;
  else
    if nullif(btrim(new.company_name), '') is null
       or nullif(btrim(new.category), '') is null
       or nullif(btrim(new.bio), '') is null
       or nullif(btrim(new.manager_name), '') is null then
      raise exception 'Company name, industry, about, and contact person are required to complete onboarding.'
        using errcode = '23514';
    end if;
    if new.account_type = 'agency' and nullif(btrim(new.agency_type), '') is null then
      raise exception 'Agency type is required to complete onboarding.' using errcode = '23514';
    end if;
  end if;

  select c.phone, c.full_name into private_phone, private_full_name
  from public.private_contacts c where c.user_id = new.id;

  if private_phone is null or private_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'A valid private mobile number is required to complete onboarding.'
      using errcode = '23514';
  end if;

  if new.account_type = 'creator' and nullif(btrim(private_full_name), '') is null then
    raise exception 'A private full name is required to complete a Creator profile.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_completed_profile_before_write on public.profiles;
create trigger validate_completed_profile_before_write
before insert or update of account_type, display_name, company_name, agency_type, bio, category, location, manager_name, avatar_url, onboarding_completed
on public.profiles
for each row execute function public.validate_completed_profile();

create or replace function public.validate_private_contact_creator_name()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if nullif(btrim(new.full_name), '') is null
     and exists (
       select 1 from public.profiles p
       where p.id = new.user_id and p.account_type = 'creator' and p.onboarding_completed
     ) then
    raise exception 'A private full name is required for a completed Creator profile.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_private_contact_creator_name_before_write on public.private_contacts;
create trigger validate_private_contact_creator_name_before_write
before insert or update of full_name on public.private_contacts
for each row execute function public.validate_private_contact_creator_name();
