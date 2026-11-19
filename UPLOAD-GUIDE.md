# Stagerang six-type update package

This ZIP contains the updated active project source with the correct folder structure. The production pages are served from `public/site`; Next.js API routes live in `app/api`. It adds Creator, Brand, Agency, Celebrity, Event, and Media role support across signup, profiles, Explore, projects, the home feed, dashboard, and Messages. It also includes the Supabase migrations and a separate database update guide.

## Safest upload method: GitHub Desktop

1. Download and extract the ZIP. At the top level, check for `app`, `public`, `supabase`, `package.json`, `tsconfig.json`, and this guide. Do not upload the ZIP file itself.
2. In GitHub Desktop, clone `Ratanbharati/BrandMediaCollab` on `main` if it is not already cloned. Choose **Repository → Show in Explorer** to open its local folder.
3. Copy the extracted package contents into the cloned repository folder, keeping all folders in place and replacing files when asked. Do not copy a `.git` folder. The admin API files must stay under `app/api/admin/`; never place `route.ts` files loose at the repository root.
4. Remove the obsolete `brand-media-collab-supabase-ready` nested backup folder and old root-level duplicate page/API files from the clone. The current app uses `public/site/` for pages and `app/api/` for APIs.
5. In GitHub Desktop, review the changed-file list, commit to `main`, and click **Push origin**. Wait for Vercel’s newest Production deployment to show **Ready**.
6. Apply/check the Supabase migrations using [SUPABASE-UPDATE-GUIDE.md](SUPABASE-UPDATE-GUIDE.md). The website code deploy and database update are separate steps.
7. Wait for Vercel’s newest Production deployment to show **Ready**, then open `https://www.stagerang.com` and hard-refresh with **Ctrl+Shift+R**.

Avoid uploading files from different subfolders together into the repository root with GitHub’s web uploader. That flattens paths and creates duplicates such as `route (1).ts`, which can break the build.

## Admin console setup

The owner console is `https://www.stagerang.com/site/admin-dashboard.html`. Use the verified owner account. Vercel Production must have `STAGERANG_ADMIN_EMAIL=ratnabharati.rb@gmail.com` and the server-only `SUPABASE_SERVICE_ROLE_KEY`, as described in `ADMIN-SETUP.md`. Never expose the service-role key in browser code.

Use `USER-JOURNEYS.md` for the Creator, Brand, and Agency click-by-click flows and the acceptance checklist after deployment.

Use `ADMIN-WORKFLOW.md` for the owner’s admin-console steps, safety boundaries, and post-deployment admin check.

## Database

Deployment does not run SQL and does not modify or erase Supabase data. Keep the existing Supabase project and its tables. Do not rerun the initial schema on a database that already contains accounts. The six-role schema update is `supabase/migrations/20261119000900_six_type_collaboration_ecosystem.sql`; profile-feed Realtime is enabled by `supabase/migrations/20261119001000_enable_profile_discovery_realtime.sql`. Check the migration status and apply only what is missing, in that order. Follow the database guide before running SQL.

## Included workflows and known limits

- Signup, login, password reset, profile setup and editing, account-type-specific profile pages, and profile links.
- Separate Brand, Creator, Agency, Celebrity, Event, and Media project/profile filters; project creation, discovery, search/filtering, saved items, and interest/application flows.
- Dashboard sections and conversation filters for all six roles; counts use Supabase records.
- Project-linked conversations, unread indicators, and periodic message/activity refresh. Notifications are in-app rather than push alerts.
- Protected owner console for live accounts/profiles, projects, applications, support requests, and admin audit entries. Profile visibility can be changed; test accounts can be permanently deleted after exact-email confirmation. Chat message bodies remain private.

Social-network OAuth and automatic follower syncing, push notifications, and automatic Google Calendar integration are not included. Review `AGENCY-WORKFLOW.md` and `ADMIN-SETUP.md` for details.
