# Stagerang deployment notes

The production site is served from `public/site`. Vercel must use the repository root as its Root Directory (leave the Root Directory field empty). Root-level HTML copies are archives; edit the files under `public/site` for the live website.

## Included workflows

- Brand, Creator, and Agency account types and separate Brand project, Creator idea, and Agency project views on Home and Projects.
- Home and Projects classify each post by its owner’s saved account type and explicitly hide cards outside the selected tab.
- Supabase-backed signup, login, password reset, profiles, project posts, saved items, applications/interest, dashboard summaries, project-linked conversations, support requests, and account data export.
- Profile editing stays tied to the signed-in account type.
- A protected owner console at `/site/admin-dashboard.html` for member/profile, project, application, support-request, and admin-audit records.

## Deployment

Preserve the package folder structure when copying it to the connected GitHub repository. Commit and push to `main`, then wait for the newest Vercel Production deployment to show **Ready**. Hard-refresh `https://www.stagerang.com` with **Ctrl+Shift+R**.

Keep the existing Supabase project and user data. Vercel deployment does not execute SQL migrations. Do not rerun the initial schema on a database that already contains accounts. The admin console setup is in `ADMIN-SETUP.md`.

The Creator, Brand, and Agency click-by-click journeys and post-deployment acceptance checklist are in `USER-JOURNEYS.md`.

The owner console click-by-click workflow and admin limitations are in `ADMIN-WORKFLOW.md`.

## Remaining integration limits

- Activity alerts are in-app; push notifications aren’t included. The notification panel needs the existing `notifications` table/policies to be present in Supabase; when absent, the UI shows a fallback.
- Social-network OAuth and automatic follower-count syncing aren’t implemented.
- Google Calendar integration and automatic calendar invitations aren’t included.
- Messages refresh periodically rather than using push delivery. The admin console does not reveal private chat bodies.
- Account deletion is requested through Support; a member cannot delete an account from Settings.
- Terms and privacy policy documents are not published in the landing-page signup flow yet.
