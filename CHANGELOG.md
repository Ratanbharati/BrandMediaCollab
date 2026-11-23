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
