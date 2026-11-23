# Deployment guide

## What the deployment contains

This is a Next.js 15/React application shell whose root page serves the active static website from `public/site/`. API routes live under `app/api/`. Vercel deploys the application; Supabase migrations are a separate operator action and do not run automatically during `pnpm build`.

## Local setup

1. Install Node.js 22+ and pnpm 9+.
2. Extract the project ZIP. Open a terminal at the directory containing `package.json`.
3. Copy `.env.example` to `.env.local`, fill in the correct project values, and keep that file private.
4. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.
5. Visit `http://localhost:3000`.

## GitHub upload (Windows / GitHub Desktop)

1. Extract the ZIP into a temporary folder.
2. Open the existing repository clone in GitHub Desktop and choose **Show in Explorer**.
3. Copy the ZIP's project contents into that repository root. The root must contain `package.json`, `pnpm-lock.yaml`, `app/`, `public/`, `scripts/`, and `supabase/` directly; do not add a wrapper directory.
4. Review the GitHub Desktop changed-files list. Confirm active frontend changes are under `public/site/` and migration changes are under `supabase/migrations/`. Do not include `.env.local`, `node_modules`, `.next`, archive snapshots, or old duplicate files.
5. Commit the changes with a descriptive message and push to the branch connected to Vercel (usually `main`).
6. On GitHub, confirm the pushed commit contains the expected paths. Compare its commit SHA with the Vercel deployment's Source commit.

## Vercel production

1. Keep the Vercel project Root Directory set to the repository root (empty/default for this layout).
2. Configure the environment variables from `ENVIRONMENT_SETUP.md` for the intended Vercel environments. Keep the Supabase service key server-only.
3. Confirm the production deployment corresponds to the commit just pushed and reaches **Ready**.
4. Test the deployed site in a private browser window and hard-refresh. Deployment Ready only confirms a build/deploy, not Supabase runtime functionality.
5. Check Vercel logs and browser network/console for route, configuration, and API errors.

## Supabase migration procedure

1. Back up production and use a staging Supabase project for validation.
2. Inspect the existing schema and `supabase_migrations.schema_migrations` history (or the CLI migration history) before applying SQL.
3. Apply only the missing, reviewed migrations in order. Never rerun the initial schema blindly against a populated database.
4. Verify RLS, Auth redirects, storage and Realtime in the Supabase project. Do not disable RLS to resolve an error.
5. Run the nine-role and two-user acceptance journeys from `USER-JOURNEYS.md` using disposable accounts.

## Rollback

For a frontend release, redeploy the previous known-good Vercel deployment or revert the Git commit. Database migrations may not be safely reversible; inspect each migration and restore from a verified backup when needed. Do not assume a Git revert undoes database changes.

## Release checklist

- `pnpm test` and `pnpm build` pass on the release commit.
- Environment variables and Auth redirect URLs point to the intended project/domain.
- Supabase migration history matches the reviewed migration set.
- Production deployment Source SHA matches the GitHub commit.
- Homepage, login, onboarding, project discovery, profile discovery, messages, notifications and admin authorization receive smoke checks.
- Private routes and sensitive data remain protected; no secret files are in Git or the ZIP.

Live deployment and DNS status must be checked in the owner’s GitHub/Vercel/Supabase accounts; this guide does not claim those external systems were updated.
