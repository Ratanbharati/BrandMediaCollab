# Changelog

## 2026-11-22 — Documentation, audit and delivery hygiene

- Added the master product/technical snapshot and supporting audit, architecture, database, SEO, journeys, environment, deployment and change records.
- Recorded the nine account types and clarified which capabilities are implemented in source, partial, missing, or unverified against live services.
- Added the profile discovery Realtime SQL to the canonical `supabase/migrations/` chain (the existing root-level copy is not canonical).
- Kept this migration additive/idempotent; it only adds `public.profiles` to the Realtime publication if absent.
- Standardized shared internal-page type/control styles and changed the home feed project-type tabs to wrap rather than force horizontal scrolling.
- Updated repository/package branding and upload documentation for Brand Media Collab.
- Added an automated verifier assertion for the canonical Realtime migration.
- Ran repository static checks and production build; see `PROJECT_AUDIT_REPORT.md` for exact outcome and limitations.

No live database rows, production credentials, or hosted settings were changed as part of this repository documentation/delivery task.

## 2026-11-25 — Project state and deadline consistency

- Made the home feed and project directory show actions from the same project status, application status, and application deadline logic.
- Existing accepted applications open their project conversation through `submit_project_interest`; sent, rejected, expired, and closed states no longer offer an inappropriate new-interest action.
- Fixed malformed project-card save-button markup found during JavaScript syntax validation.
- Adjusted the unread badge position to keep it inside the navigation item.
- Re-ran Node syntax checks, `pnpm test` (site verifier and TypeScript), and `pnpm build`; all passed. Live Supabase/browser workflows remain unverified without hosted access and test accounts.
- Packaged a clean source ZIP without dependencies, build cache, browser profiles, archived duplicate source folders, or real environment files.
- Added the calm internal typography scale, restored Explore to the normal page-title size, and unified desktop nav labels while keeping landing hero styles independent.
- Replaced the home feed's three-row category tabs with a one-row All/active-category filter and a More menu for zero-count categories; reduced the composer to one project/idea action.
- Removed untracked/redundant home profile stats and decorative arrows from the requested internal actions; added static regression checks.
- Full internal-page component unification and five-viewport visual audit remain incomplete and are called out in `PROJECT_AUDIT_REPORT.md`.

## 2026-11-25 — LinkedIn-grade internal shell follow-up

- Replaced the prior 28px internal-title token with 20/28px per the newer rework prompt; landing headline sizing remains separate.
- Added shared compact search, desktop Notifications navigation, Me/account menu styles, and a five-item mobile bottom navigation with More destinations.
- Routed global search terms into existing Explore/Projects search inputs using the `q` URL parameter.
- Added static checks for the internal app shell and search handoff.
- Validation: changed JS syntax checks passed; `pnpm test` passed; `pnpm build` passed after creating a missing generated `.next` output directory that Windows had denied on the first attempt.
- No database/API schema changes. No browser screenshots, live Supabase tests, or full page-by-page UI rebuild were completed; remaining work is documented in `PROJECT_AUDIT_REPORT.md`.
