# Phase 5 — Backend, Realtime & Data Consistency Audit

## Scope and verification limits

Reviewed the local repository source, migrations, frontend Supabase operations, RLS policies, and Realtime subscriptions. There is no live Supabase connection available in this session, so this report describes the checked-in schema and code; it does not claim that the production database has these migrations or policies applied.

## Tables reviewed

Existing schema tables reviewed: `profiles`, `private_contacts`, `platform_admins`, `social_accounts`, `projects`, `project_deliverables`, `applications`, `saved_projects`, `conversations`, `conversation_members`, `messages`, `meetings`, `support_requests`, `payment_records`, `admin_audit_logs`, `notifications`, `profile_connections`, `profile_blocks`, `admin_account_states`, `content_reports`, and `verification_requests`.

Foreign keys generally cascade for account-owned records and project children, while historical references such as moderation reviewers and some project references use `SET NULL`. Existing unique constraints cover one profile per auth user, one application per project/applicant, one save per user/project, one membership per conversation/user, one connection per unordered user pair, and one pending verification per user.

The current schema has no `teams`, `invitations`, or `account_settings` table. Collaboration state is represented by application status `working_together`; discoverability is stored on `profiles`. The team invitation UI is not backed by a table/workflow yet.

## Changes in this phase

- Added `supabase/migrations/20261120120000_phase5_application_integrity.sql`.
- Found the `app_private.is_platform_admin()` helper was referenced by policies and triggers but not created in the migration set. Added its secure definition before the first use for clean installs, and included an idempotent repair in the Phase 5 migration for already deployed databases.
- Application creation now requires the signed-in applicant, an open project, a non-owner applicant, an unexpired application deadline, and an eligible profile type when the project specifies target types.
- Application updates now use column-level grants and a trigger to keep identity fields immutable and constrain applicant/owner status transitions. Admin moderation remains server/admin controlled.
- Project owners can no longer self-edit project moderation metadata; trusted admin/service-role moderation remains supported.
- Removed hardcoded dashboard demo rows and the preview-only announcement dialog. Dashboard rows now come from `dashboard-live.js` and the database.
- Removed the `localStorage` project list from My Projects; the page uses its Supabase-backed renderer only.
- Applications no longer show a usable private-chat action before acceptance. The server already enforces accepted project collaborations; the UI now matches that rule.
- Message view now surfaces a warning if marking its message notifications read fails instead of silently ignoring the database error.
- Expanded `scripts/verify-site.mjs` with checks for these safeguards.

## RLS and data access review

RLS is enabled in the checked-in migrations for the main user and platform tables. Existing policies scope profiles, applications, saved projects, conversations/messages, notifications, connections/blocks, reports, verification requests, and admin data to owners/participants/admins. Account suspension adds a restrictive policy rather than disabling RLS. Moderation visibility hides reviewed projects from other members, and a profile trigger prevents self-assigned verification.

The Phase 5 migration tightens application insert/update enforcement without disabling RLS and restores the private admin authorization helper. Neither Phase 5 migration has been applied to the hosted Supabase project from this session.

## Realtime strategy found in the repository

- Realtime subscriptions are implemented for messages, unread notifications, connection state, project feed/list changes, application status changes, and dashboard project/application/chat activity.
- Notifications and connection updates use user ID filters; saved projects and conversation membership also use account filters. Other project/profile/application channels rely on RLS-scoped visibility and refresh/refetch handlers.
- Pages use ordinary database queries for profile initialization, Explore searches/filters, initial dashboard statistics, and historical/paginated notification lists.
- Several pages include a 30-second fallback refresh when a Realtime channel is not connected. Channels are cleaned up on page exit in the main messaging/dashboard flows.

## Verification results

- `pnpm test` — passed: 24 HTML pages, 11 scripts, local links/scripts, auth and profile checks, six account types, application integrity checks, mock-data removal, and Realtime wiring. TypeScript check also passed.
- `pnpm build` — passed after directing the temporary build output to a separate `.next-phase5` directory. The default `.next` path first returned Windows `EPERM`; the temporary config and build output were removed after the successful build.
- No live Supabase RLS/policy test or real multi-account workflow test was possible without a connected Supabase project and credentials.

## Manual Supabase work required

Apply pending migrations through the project’s migration workflow. The two relevant additions are `20261118052016_platform_admin_private_helper.sql` (for clean migration chains) and `20261120120000_phase5_application_integrity.sql` (idempotently restores the helper on already deployed databases and applies the Phase 5 guards). Then verify them against the hosted schema. Before promoting, exercise: own-project application rejection, closed/expired project rejection, target-profile mismatch, applicant withdraw/reapply, owner accept/reject, unauthorized participant update, accepted chat access, and project moderation field rejection for a non-admin. Confirm Realtime publication membership and production RLS against the actual Supabase project.

## Remaining gaps and risks

- Live production schema, RLS and Realtime publication state could not be verified here.
- Team invitations and a dedicated settings table/workflow are not implemented in the current schema.
- The original profile account-type check lists three account types; the six-type migration broadens it. Application eligibility is checked against the stored applicant profile and project target list. Validate all supported profile types against production data.
- The workspace’s default `.next` directory still returns Windows `EPERM`; a clean build succeeds when Next.js writes to a separate output directory.
