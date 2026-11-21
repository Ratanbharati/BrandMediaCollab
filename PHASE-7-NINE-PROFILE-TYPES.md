# Phase 7 — Nine profile types

## Scope

The public account ecosystem now supports Creator, Brand, Agency, Celebrity, Event, Media, Community, Distributor, and Freelancer. Admin remains a protected platform role and is not a signup option.

## Implemented in source

- Signup and profile setup include Community, Distributor, and Freelancer.
- Community and Distributor use organization profiles; Freelancer uses an individual profile.
- Role-specific profile fields are saved, restored on edit, validated at completion, and surfaced in discovery where available.
- Explore has filters, headings, cards, and role labels for all nine types.
- Projects has role-specific tabs, side/mobile navigation, counts, classification labels, and details for all nine.
- Feed, messages, dashboard, admin user filters, admin metrics, and API role validation include all nine types.
- The Supabase migration expands account/project checks, server-side project classification, Auth profile initialization, profile completion validation, admin reporting, and profile discovery output.

## Database migration

Apply `supabase/migrations/20261121130000_expand_to_nine_account_types.sql` to the existing Supabase project using its normal migration workflow. It preserves existing profile/project rows and adds only profile columns and compatible checks/functions/views. Review the migration against the hosted schema first; it has not been applied to the live project from this workspace.

After applying, verify that:

1. `public.profiles` accepts all nine types and the three new profile fields.
2. `public.projects` accepts the new owner/project classifications.
3. `public.discover_profiles` returns its previous columns plus the appended new fields.
4. Auth signup creates an incomplete profile for each new type.
5. Profile completion validation rejects missing required fields for each type.
6. Authenticated users can discover visible profiles but cannot read hidden profiles or private contacts.
7. Admin metrics/directory still return expected rows.

## Checks run locally

- `pnpm test` — passed; static site checks and TypeScript.
- `pnpm exec next build` with `NEXT_DIST_DIR=.next-codex-check` — passed.
- Default `.next` build output failed once because Windows/OneDrive returned `EPERM` while creating a directory. The isolated output build completed successfully.
- Supabase SQL execution, RLS validation, live signup for the three new roles, production Explore queries, and two-user workflows — blocked here because no connected project credentials/test accounts are present in this workspace.

## Notes

- New account types share the current `profiles` table and existing collaboration/application model; no separate per-role account tables were introduced.
- Existing accounts and project rows are retained. Existing user profile type is not changed by the migration.
- Team membership and invitations are not added by this phase.
