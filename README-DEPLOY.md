# Stagerang deployment notes

The production site is served from `public/site`. Vercel must use the repository root as its Root Directory (leave the Root Directory field empty).

## Included workflows

- Brand, Creator, and Agency account types and separate Brand project, Creator idea, and Agency project views on Home and Projects.
- Supabase-backed signup, login, password reset, profiles, project posts, saved items, applications/interest, dashboard summaries, and project-linked conversations.
- Profile editing stays tied to the signed-in account type.
- A protected owner console at `/site/admin-dashboard.html` for member/profile, project, application, support-request, and admin-audit records.

## Deployment

Preserve the package folder structure when copying it to the connected GitHub repository. Commit and push to `main`, then wait for the newest Vercel Production deployment to show **Ready**. Hard-refresh `https://www.stagerang.com` with **Ctrl+Shift+R**.

Keep the existing Supabase project and user data. Vercel deployment does not execute SQL migrations. Do not rerun the initial schema on a database that already contains accounts. The admin console setup is in `ADMIN-SETUP.md`.

## Remaining integration limits

- Activity alerts are in-app; push notifications aren’t included. The notification panel needs the existing `notifications` table/policies to be present in Supabase; when absent, the UI shows a fallback.
- Social-network OAuth and automatic follower-count syncing aren’t implemented.
- Google Calendar integration and automatic calendar invitations aren’t included.
- Messages refresh periodically rather than using push delivery. The admin console does not reveal private chat bodies.
