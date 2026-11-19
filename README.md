# Stagerang

Stagerang is a Next.js shell that serves the existing application from `public/site` and its Supabase migrations from `supabase/migrations`. The HTML and scripts in `public/site` are the active frontend; root-level HTML files are archival copies unless a deployment guide explicitly says otherwise. The current role update supports Creator, Brand, Agency, Celebrity, Event, and Media profiles and projects while preserving the existing site design.

## Local setup

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local` and set the values from the existing Supabase project. The publishable key is intended for browser use; keep `SUPABASE_SERVICE_ROLE_KEY` server-side and never commit real credentials.
3. Install dependencies with `npm install`.
4. Start the local app with `npm run dev`, then open `http://localhost:3000`.

`STAGERANG_ADMIN_EMAIL` should be the exact email configured as the sole platform admin. This only enables the admin route's email check; the matching authenticated Supabase user and database authorization must also be configured.

## Build and deployment

Run `npm run build` before deployment. In Vercel, use the repository root as the project Root Directory. Deployment does not apply Supabase SQL migrations. Review and apply only missing migrations to the existing Supabase project; do not rerun the initial schema against a database with user data. For the six-type update, see [SUPABASE-UPDATE-GUIDE.md](SUPABASE-UPDATE-GUIDE.md). See [README-DEPLOY.md](README-DEPLOY.md), [ADMIN-SETUP.md](ADMIN-SETUP.md), and [USER-JOURNEYS.md](USER-JOURNEYS.md) for deployment and acceptance details.

## Current verification scope

The repository snapshot used for this package has no Git metadata, installed dependencies, or authenticated Supabase/GitHub/Vercel connection available to this session. Local static checks can validate JavaScript syntax and HTML script syntax, but they cannot establish production database behavior, run the Next.js build, inspect deployed logs, or publish changes. A production audit must additionally verify the deployed revision, Supabase migration ledger and RLS policies, live API payloads, and browser journeys with authenticated test accounts.

## Application behavior

The Applications page loads the signed-in user's records from Supabase, filters the results by status, supports interest withdrawal, and refreshes on Supabase Realtime changes with a polling fallback. Project conversations and profile/project links require the corresponding existing Supabase policies and tables. Database policy changes must be implemented as reviewed migrations and verified against the connected project before claiming end-to-end behavior.
