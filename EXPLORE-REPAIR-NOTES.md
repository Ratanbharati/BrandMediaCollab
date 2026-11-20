# Explore page repair package

This ZIP contains the current Stagerang site files plus the Explore page repair and supporting six-profile-type / connection flows.

## Included behavior

- Discoverable profiles for Creator, Brand, Agency, Celebrity, Event, and Media accounts.
- Search and combined role, industry, niche, location, language, platform, and service filters.
- Profile cards link to member profiles; connection requests, accept/decline, cancel, block/unblock, and direct messaging use Supabase-backed state.
- Pagination, loading, empty, error/retry states, responsive filter layout, and profile/connection refresh behavior.

## Before upload

- Keep the package folder structure. The website is served from `public/site` by the existing Next.js root app.
- Keep the existing Supabase project and credentials. Do not run the initial schema on a populated project.
- Migration files after the original November 17 set are included for reference and for environments that have not applied them. Apply only migrations missing from that database's migration history. The live Stagerang project already has the six-type schema and profile realtime publication enabled, so these SQL files should not be blindly rerun there.
- This ZIP was prepared for local review. It has not been uploaded to GitHub or deployed.

## Local checks

JavaScript syntax checks were run for the Explore, connection, and shared application scripts. A full Next.js build and signed-in live flow test were not run in this environment.
