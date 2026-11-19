# Supabase update for the six Stagerang account types

This project uses the existing Supabase database. These steps add the six-role fields and allow Explore to receive profile updates through Supabase Realtime. They do not create accounts or remove existing records.

## Before applying SQL

1. Open the existing Stagerang project in the Supabase Dashboard. Do not create a new project.
2. Open **SQL Editor** and run this read-only check:

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.profiles'::regclass, 'public.projects'::regclass)
  and conname in (
    'profiles_account_type_check',
    'projects_owner_type_check',
    'projects_project_type_check'
  )
order by conname;
```

If the profile and project constraints already include `celebrity`, `event`, and `media` (and the project type constraint includes `celebrity_project`, `event_project`, and `media_project`), the six-role schema migration is already applied. Do not run it again.

## Apply only missing migrations

The migration files are in `supabase/migrations/` in this ZIP.

1. If the check above does not show all six profile/owner types, open `20261119000900_six_type_collaboration_ecosystem.sql` in the SQL Editor and run the full file.
2. Then run `20261119001000_enable_profile_discovery_realtime.sql`. This migration safely adds `public.profiles` to `supabase_realtime` only if it is not already included.
3. Do **not** run the initial schema migration (`202611150001_initial_schema.sql`) against the existing database. Do not disable RLS or change service-role keys for this update.

## Verify Realtime publication

Run this read-only query. It should return one row for `public.profiles`:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'profiles';
```

The Explore page listens for profile changes and refetches the profile list through the `discover_profiles` RPC, which retains the existing discoverability and block filters. If the query returns no rows after the migration, stop and review the SQL Editor error before deploying.

## Deploy the website code

After pushing the ZIP contents to the existing GitHub repository with the folder structure preserved, wait for the connected Vercel Production deployment to finish. No new Supabase URL, anon/publishable key, or service-role key is needed for these changes. Never put a service-role key into `public/site` or browser JavaScript.

After deployment, hard-refresh the site. Verify signup/profile type choices, all six Explore filters, all six Projects tabs, Messages filters, and project search. Real profile/project rows still depend on existing accounts and data; this update does not seed fake records.
