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
