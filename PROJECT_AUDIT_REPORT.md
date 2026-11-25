# Brand Media Collab — Project Audit Report

**Audit date:** 22 November 2026  
**Scope:** Current checkout, active `public/site/` pages, Next.js `app/`, scripts, project documents, and 30 canonical Supabase SQL migrations. **No live Supabase or Vercel inspection was possible.**

## Executive status

The codebase contains a working-shaped product architecture and source for the nine account types. Local static/source verification, TypeScript, and production build passed. The audit does **not** certify production readiness: no hosted migration state, Auth provider, RLS behavior, storage policy, realtime stream, actual user journey, or deployed domain was tested. Responsive screenshots, browser console, and network requests were also unavailable in this run.

## Findings and actions

| Priority | Finding | Evidence / impact | Action/status |
|---|---|---|---|
| P0 release gate | Hosted authorization cannot be verified from this checkout. | Admin APIs use a server service key and database policies; no Supabase credentials/session available to test authorization boundaries. A source review is not a security certification. | **Open / blocked:** run test-project RLS and unauthorized-access tests before production sign-off. |
| P0 release gate | Deployment state/domain were not verified. | Local files do not prove GitHub `main`, Vercel Production, DNS/TLS, or custom-domain response are current. | **Open / blocked:** compare Git commit SHA with Vercel deployment and verify domain from owner account. |
| P1 | Nine-type sign-up/profile journeys and cross-account work remain untested. | SQL/code supports Creator, Brand, Agency, Celebrity, Event, Media, Community, Distributor, Freelancer, but no test identities or backend config. | **Open / blocked:** run nine disposable profiles and two-user project/connection/chat workflows. |
| P1 | Browser-level responsive, accessibility and interaction audit is incomplete. | Source verifier checks HTML/script references, not rendered behavior. No browser E2E/viewport tool is configured in `package.json`. | **Open:** add Playwright/browser runner and test 360/390/768/1024/1440px; keyboard and contrast checks. |
| P1 | Supabase migrations must be reconciled with hosted history before applying. | 30 ordered files are checked in; live schema/history unavailable. A Realtime publication SQL file was stranded at repository root although the update guide referred to it. | **Partly fixed:** put the same idempotent profile-publication migration under `supabase/migrations/`; compare migration ledger and apply only pending reviewed migrations. Never rerun initial schema on populated DB. |
| P2 | Team membership and invitation workflow is not present in schema. | No `teams`, `team_members`, or `invitations` tables in reviewed migration set; profile UI language is not a complete backend workflow. | **Documented missing:** scope and implement if required. |
| P2 | Self-service account deletion is not established. | Admin API source has a protected deletion path; no ordinary member deletion journey found. | **Documented missing:** provide self-service or documented support request if product requires it; test storage cleanup. |
| P2 | Search engine footprint is intentionally narrow. | Sitemap currently lists homepage only; app/profile/project routes are authenticated or noindex. | **Documented gap:** keep private pages private; design opt-in public routes before indexing member/project data. |
| P2 | Analytics measurement is unverified and privacy scope needs review. | GTM container `GTM-N843Z826` appears in source on 22 HTML pages, including signed-in/admin pages; no container/GA4 access or event taxonomy. | **Documented risk:** audit GTM tags/consent and exclude sensitive authenticated/admin views as appropriate. |
| P2 | Repository root contains duplicate historical copies and backup folders. | Root listing includes numbered HTML/JS/SQL copies and `brand-media-collab-supabase-ready`; active source is `public/site/`, Next routes are in `app/api/`. | **Mitigated in delivery ZIP:** package includes canonical source only, no backup folders or root duplicate pages. Repository cleanup should be a separate reviewed change. |
| P2 | Previous archive wrapper could create a nested upload. | Prior ZIP root paths started with `brand-media-collab/`, so extracting/copying that folder could put the site under a nested directory and leave active files untouched. | **Fixed in delivery:** new master ZIP has `app/`, `public/`, `supabase/`, manifests at archive root; upload guide requires checking changed-file list. |
| P3 | Page-owned styles remain mixed with shared system. | Many HTML pages contain long inline CSS; shared tokens cannot fully normalize every caption, spacing, and component. | **Partially improved:** shared internal nav/control typography and feed tab wrapping added. Continue page-by-page visual QA without replacing the brand. |
| P3 | Legal and informational pages are incomplete/unclear. | Active sitemap has `help.html`, but no separate About, Privacy, or Terms HTML page was found. Landing footer destinations need live route review. | **Open / product decision:** create accurate legal pages and validate footer links. |
| P3 | Payment, social OAuth, follower sync and calendar are not end-to-end features. | `payment_records`, `meetings`, and social URL data exist, but no billing provider/OAuth follower sync/calendar authorization flow was verified. | **Documented scope gap:** do not market these as operational. |

## Pages, APIs, and database reviewed

- **24 active HTML pages:** `public/site/index.html`, `landing-preview.html`, `feed.html`, `projects.html`, `project-form.html`, `my-projects.html`, `saved-opportunities.html`, `applications.html`, `explore.html`, `creator-profile.html`, `brand-profile.html`, `my-profile.html`, `edit-profile.html`, `profile-setup.html`, `dashboard.html`, `dashboard-preview.html`, `messages.html`, `notifications.html`, `settings.html`, `help.html`, `admin-dashboard.html`, `logout.html`, `reset-password.html`, and `update-password.html`.
- **Browser modules:** `bmc-app.js`, `bmc-supabase.js`, `projects-live.js`, `applications-live.js`, `explore-live.js`, `connections-live.js`, `dashboard-live.js`, `messages-live.js`, `notifications-live.js`, `password-reset.js`, `admin-dashboard.js`, and shared `design-system.js` (12 scripts counted by verifier).
- **Next.js routes:** `GET /api/supabase-config`; `GET/POST /api/verification-requests`; `POST /api/reports`; `GET /api/admin/data`; `PATCH /api/admin/data`; `PATCH/DELETE /api/admin/users`.
- **Database:** 21 source tables/entities, two admin views (`admin_user_directory`, `admin_dashboard_metrics`), discovery function output, RLS, functions/triggers, avatar storage, and 30 migration files. Full entity inventory and source caveats: [DATABASE_DOCUMENTATION.md](DATABASE_DOCUMENTATION.md).

## Verification actually executed

| Check | Result | Limits |
|---|---|---|
| `pnpm test` | **PASS** | Static verifier reports 24 HTML pages, 12 scripts, shared design-system wiring, nine account/project types, auth/profile source checks, local references and selected integrity/realtime hooks; TypeScript `--noEmit` included. |
| `pnpm build` | **PASS** | Next.js 15.5.29 optimized production build completed after clearing only ignored `.next` cache. |
| Archive integrity | **PASS** | Master ZIP contains 114 files and all 30 canonical migrations; required project/docs paths are present, every entry decompressed, no empty entries, wrapper folder, `.env.local`, dependencies, or build cache. Archive size is approximately 425 KB. |
| Local HTTP smoke test | **BLOCKED** | Server started, but sandbox denied local socket access to `127.0.0.1`. |
| Lint/unit/integration/browser E2E | **NOT CONFIGURED / NOT RUN** | No lint/unit/integration/E2E runner exists in package scripts. |
| Live Auth, database, Realtime, admin, domain | **NOT TESTED** | No Supabase credentials, Vercel access, test accounts, or browser network session. |

## Deployment assessment

**Staging candidate with significant verification limits; not production-certified.** The source builds, but production readiness depends on checking the deployed commit, hosted migrations/policies, test-user journeys, responsive rendering, and domain behavior. See [END-TO-END-QA-REPORT.md](END-TO-END-QA-REPORT.md) and [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Follow-up audit — 25 November 2026

Reviewed the attached implementation and UI/UX audit prompts against the active source and applied a focused consistency fix to project interest states.

- Home feed and project discovery now derive availability from the same project status, application deadline, and the signed-in user's application status.
- Existing interested applications show a non-repeatable “Interest sent” state; accepted/working-together applications link to the project conversation; rejected applications show “Not selected”; closed projects do not offer a new application.
- The project conversation action calls the existing `submit_project_interest` RPC and opens its returned conversation. The required SQL migration is `supabase/migrations/20261123150000_interest_opens_project_chat.sql`; it must be applied to the hosted Supabase project for this action to work.
- Project save button markup syntax was corrected during the follow-up verification.
- Navigation unread badge placement remains within the nav item bounds.

**Follow-up verification:** Node syntax checks passed for the five touched/live browser scripts. `pnpm test` passed, including the static site verifier and TypeScript check. The production build passed (Next.js 15.5.29). No browser-driven or hosted Supabase end-to-end test was possible, so conversation creation, realtime delivery, and database state are still **not live-verified**. Do not treat this report as production certification.

## Internal UI addendum — 25 November 2026

Applied a focused shared-style and home-feed pass from `BMC-Codex-Addendum-Calm-Internal-UI.md`:

- Added internal typography tokens: H1 28/36px (24/32px mobile, 600); section 18/28px (600); card title 16/24px (600); body 14/22px; label 14/20px; caption 12/16px; stat 24/32px. Shared body typography uses DM Sans and headings use Manrope, as in the existing design system. Landing-page hero scale remains separate; Explore now uses the internal H1 scale.
- Unified desktop internal navigation labels at 14/500 and increased navigation icons to 20px. Mobile navigation text stays at 12px to fit the existing six-item row; mobile form controls use 16px text.
- Added a 12px floor for common text roles and darker common muted text, standardized status pill sizing, and kept project-type tabs in one horizontally scrollable row.
- Home feed now starts with an All filter; categories with results appear in the row and zero-count categories are available in More. The composer keeps one project/idea action. The untracked profile-view statistic and redundant account-type stat are removed; creator tier remains for creator accounts. Internal action arrows were removed from the cited UI actions.
- Added static verifier checks for the internal title tokens, Explore scale, and home All/More/composer behavior.

**Design-system completion is partial.** Many page templates still contain inline, legacy type declarations, and not every card, CTA, sidebar row, notification row, message snapshot, date format, and AppShell/PageHeader was refactored to the requested shared component. Source scans still find page-specific values. Five viewport screenshots, rendered contrast measurements, and browser interaction checks were not performed. The table and CTA rules in the addendum therefore remain follow-up work rather than verified completion.

**Verification after this follow-up:** Node syntax checks passed for the modified browser scripts. `pnpm test:site` passed after the latest home-feed and token changes. A production build and full `pnpm test` passed after the typography and feed changes; the first concurrent build/test attempt raced on generated `.next/types`, then the sequential build passed. Live Supabase and browser-level verification remain blocked by unavailable hosted access and test accounts.

## Follow-up — LinkedIn-grade internal UI pass (25 November 2026)

The latest rework brief supersedes the earlier 28px internal-title target: internal H1/section headings now use 20/28px; landing-page hero scale remains separate. Existing design tokens use DM Sans for body text and Manrope for display headings, with the current cream/forest/lime palette retained.

Implemented in the shared static-site shell:

- Added a compact 56px internal header search field, account “Me” menu styling, desktop Notifications navigation, and mobile header search/messages controls.
- Added a fixed five-destination mobile bar (Home, Projects, Explore, Notifications, More) with a compact More menu for Dashboard, Messages, profile, settings, Help, and Log out. Kept link targets on existing pages.
- Connected global search submission to the existing Projects or Explore query field through the `q` URL parameter.
- Added shell and query-handoff assertions to `scripts/verify-site.mjs`.
- Preserved current auth, Supabase, project and messaging contracts; no schema or API changes were made.

**Still incomplete / not verified:** This is a focused shared-shell implementation, not the full page-by-page redesign in the prompt. Existing Home, Projects, Explore, Dashboard, Messages, Notifications, signup, profile and admin layouts retain legacy page-specific markup and styles. The progressive three-step signup, project/person card unification, dashboard table redesign, message two-pane changes, date standardization, and zero-count More controls are not completed. No rendered screenshots at 1440/1280/1024/768/390px, keyboard walkthrough, contrast measurement, or live Supabase/browser E2E check was produced in this environment. Do not treat this as complete visual QA or production certification.

**Verification performed:** `node --check` passed for the changed JavaScript files; `pnpm test` passed (static verifier and TypeScript); `pnpm build` passed on Next.js 15.5.29. On the first build attempt Windows denied creation of a generated `.next` output directory; after creating that missing build-output directory, the sequential production build completed. Live service behavior remains unverified.
