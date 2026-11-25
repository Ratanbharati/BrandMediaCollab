# Supabase migration update guide — Brand Media Collab

The checked-in migration chain currently has **30 SQL files** in `supabase/migrations/`. It is an ordered history, not a single script. Applying migrations is separate from uploading code to GitHub or deploying on Vercel.

## Before changing an existing project

1. Confirm you selected the intended Supabase project (especially Production vs test).
2. Back up production and verify a restore path.
3. Inspect the current schema and migration ledger. With the Supabase CLI, use `supabase migration list` after linking the correct project; also review the Dashboard migration history if that is your workflow.
4. Compare the deployed database with the ordered files under `supabase/migrations/`. Apply only migrations confirmed missing and compatible with the current state.
5. Do not paste all 30 files as one batch. Never rerun `202611150001_initial_schema.sql` on a populated project. Do not disable RLS.

## Nine account types

The most recent account expansion is `20261121130000_expand_to_nine_account_types.sql`. It extends the existing schema to Creator, Brand, Agency, Celebrity, Event, Media, Community, Distributor, and Freelancer. Review its constraints and triggers against existing records before applying. The SQL chain also includes earlier incremental role/profile changes; a database that has only part of the older six-type chain needs careful migration-history reconciliation rather than rerunning files blindly.

## Profile discovery Realtime migration

`20261119001000_enable_profile_discovery_realtime.sql` is an additive migration that adds `public.profiles` to the `supabase_realtime` publication only if it is not already present. A copy had previously been left at repository root; the canonical migration now lives in `supabase/migrations/`. Use the canonical copy and do not apply both copies.

After the migration is recorded/applied, this read-only check should return one row:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'profiles';
```

The page still depends on RLS and its `discover_profiles` RPC to control which profiles are returned. Publication membership does not grant table access.

## Post-migration checks

- Confirm the project/account profile constraints contain all nine account types and matching project types.
- Create test accounts in a non-production project and verify Auth-trigger profile initialization for each role.
- Check RLS and privacy defaults, profile discoverability, application status rules, connection uniqueness, accepted-chat restrictions, and notification ownership.
- Confirm avatar Storage policies and Realtime publication membership separately.
- Run the journeys in `USER-JOURNEYS.md`; do not infer success from the SQL editor reporting “Success”.

The migration files in this package are not proof that they are applied to the live database. This repository-only review did not connect to the owner’s Supabase project.
