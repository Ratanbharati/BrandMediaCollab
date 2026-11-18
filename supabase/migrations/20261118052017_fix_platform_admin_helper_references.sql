-- The platform-admin helper was moved into the non-exposed app_private schema.
-- Keep the profile/project guards calling that helper instead of the removed
-- public.is_platform_admin() function.

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.account_type is distinct from old.account_type
     and not (select app_private.is_platform_admin()) then
    raise exception 'Account type cannot be changed after account setup.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_project_owner_classification()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  account_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Project ownership cannot be reassigned.'
        using errcode = '42501';
    end if;
    new.owner_type := old.owner_type;
    new.project_type := old.project_type;
    return new;
  end if;

  select p.account_type into account_kind
  from public.profiles as p
  where p.id = new.owner_id;

  if account_kind is null then
    raise exception 'A saved account profile is required before posting.'
      using errcode = '23503';
  end if;
  if new.owner_id is distinct from (select auth.uid())
     and not (select app_private.is_platform_admin()) then
    raise exception 'Projects must be created for the signed-in account.'
      using errcode = '42501';
  end if;

  new.owner_type := account_kind;
  new.project_type := case
    when account_kind = 'creator' then 'creator_idea'
    else 'brand_campaign'
  end;
  return new;
end;
$$;

