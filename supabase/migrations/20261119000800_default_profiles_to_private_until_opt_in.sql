-- New accounts stay off Explore unless the owner chooses to be discoverable.
alter table public.profiles alter column is_discoverable set default false;
