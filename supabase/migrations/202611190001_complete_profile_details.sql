-- Add the public profile details required by role-specific onboarding.
-- Mobile numbers remain in private_contacts under its existing owner/admin RLS.
alter table public.profiles
  add column if not exists languages text[] not null default '{}',
  add column if not exists manager_name text,
  add column if not exists manager_title text,
  add column if not exists collaboration_categories text[] not null default '{}',
  add column if not exists services text[] not null default '{}',
  add column if not exists specialisations text[] not null default '{}',
  add column if not exists portfolio_links text[] not null default '{}',
  add column if not exists onboarding_completed boolean not null default false;

-- Safe compatibility entrypoint for older clients/policies. The actual
-- membership check stays in the private schema and still depends on auth.uid().
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin();
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.validate_completed_profile()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  private_phone text;
begin
  if not new.onboarding_completed then
    return new;
  end if;

  if new.account_type = 'creator' then
    if nullif(btrim(new.display_name), '') is null
       or nullif(btrim(new.location), '') is null
       or nullif(btrim(new.bio), '') is null then
      raise exception 'Creator name, location, and bio are required to complete onboarding.'
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

  select c.phone into private_phone
  from public.private_contacts c
  where c.user_id = new.id;

  if private_phone is null or private_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A valid private mobile number is required to complete onboarding.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_completed_profile_before_write on public.profiles;
create trigger validate_completed_profile_before_write
before insert or update of account_type, display_name, company_name, agency_type, bio, category, location, manager_name, onboarding_completed
on public.profiles
for each row execute function public.validate_completed_profile();

create or replace function public.validate_private_contact_phone()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.phone is not null and new.phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Mobile number must use international format, such as +919876543210.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_private_contact_phone_before_write on public.private_contacts;
create trigger validate_private_contact_phone_before_write
before insert or update of phone on public.private_contacts
for each row execute function public.validate_private_contact_phone();

