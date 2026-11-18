-- Use a bracketed plus sign to avoid ambiguity in PostgreSQL regex escaping.
create or replace function public.validate_private_contact_phone()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.phone is not null and new.phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Mobile number must use international format, such as +919876543210.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

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

  select c.phone into private_phone from public.private_contacts c where c.user_id = new.id;
  if private_phone is null or private_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'A valid private mobile number is required to complete onboarding.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

