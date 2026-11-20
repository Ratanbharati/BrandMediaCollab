# Stagerang Phase 4 implementation

## Included changes

- Added a protected Notifications page at `public/site/notifications.html` with live Supabase-backed updates, unread/read filters, per-item and bulk read actions, and pagination.
- Added an unread notifications badge and Notifications link in the signed-in navigation.
- Removed the notification panel and notification-table reads from the Dashboard. Notifications are now managed on their own page.
- Aligned project chat controls with the existing authorization rule: project chats and bulk messages are available after the application is accepted.
- Added source-level verification for the dedicated notifications route and dashboard separation.

## Apply the patch

Copy the paths in this ZIP into the matching paths in the GitHub repository, then commit and push them to the deployment branch. This ZIP does not push to GitHub or deploy to Vercel.

The code uses the existing Supabase notification, project, application, connection, and messaging schema and RLS policies. No new SQL migration is included. Before relying on this in production, confirm that all existing migrations under `supabase/migrations` are applied to the Supabase project; live database state was not available to verify here.

## Verification performed

- `pnpm test` — passed (site/link checks and TypeScript check).
- `pnpm build` — passed (Next.js production build).

These checks do not sign in to a live Supabase account or verify production Realtime delivery. Use a test account after deploying to confirm real data and notifications.
