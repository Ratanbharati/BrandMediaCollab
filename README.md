# Brand Media Collab

Brand Media Collab is a collaboration platform for creators, brands, agencies, celebrities, event organizers, media organizations, communities, distributors, and freelancers. This repository contains the active Next.js application, its static frontend, API routes, Supabase migrations, and setup documentation.

## What's in this project

- `public/site/` — active website pages, browser scripts, shared styles, and assets. This is the frontend served by the app.
- `app/` — Next.js shell and server API routes, including protected admin endpoints.
- `supabase/migrations/` — ordered database schema and policy changes. SQL changes are not applied automatically during deployment.
- `scripts/` — repository verification scripts.
- `pnpm-lock.yaml` — locked package dependency versions.
- `AUTH-SETUP.md`, `ADMIN-SETUP.md`, `SUPABASE-UPDATE-GUIDE.md`, `README-DEPLOY.md`, and `END-TO-END-QA-REPORT.md` — setup, deployment, security, and test guidance.
- `MASTER_PROJECT_DOCUMENT.md` — product, feature, architecture and scope source of truth.
- `PROJECT_AUDIT_REPORT.md`, `TECHNICAL_ARCHITECTURE.md`, `DATABASE_DOCUMENTATION.md`, `USER-JOURNEYS.md`, `SEO_CHECKLIST.md`, `ENVIRONMENT_SETUP.md`, `DEPLOYMENT_GUIDE.md`, and `CHANGELOG.md` — supporting project documentation.

Older root-level HTML/JS/SQL copies and `brand-media-collab-supabase-ready/` are archived snapshots. They are not the active frontend. Make website changes in `public/site/`.

## Prerequisites

- Node.js 22 or later.
- pnpm 9 or later (the included lockfile uses format version 9).
- A Supabase project for authentication and database-backed features.

## Install and run locally

1. Download and unzip the project.
2. Open a terminal in the unzipped project folder.
3. Copy `.env.example` to `.env.local`.
4. Fill in the Supabase values described below. Keep `.env.local` private; it is ignored by Git.
5. Install dependencies and start the local app:

   ```sh
   pnpm install --frozen-lockfile
   pnpm dev
   ```

6. Open `http://localhost:3000`.

To create `.env.local` in Windows PowerShell, run `Copy-Item .env.example .env.local`. Do not upload a real `.env.local` file to GitHub or include it in a ZIP shared with others.

## Environment variables

Set these names in `.env.local` locally and in the hosting provider's server environment:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. This value is public configuration. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key used by the browser and server API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for protected admin API operations. Never put it in browser code or a `NEXT_PUBLIC_` variable. |
| `STAGERANG_ADMIN_EMAIL` | Exact verified owner email allowed to bootstrap the first admin only when the admin table is empty. |

Use the safe placeholders in `.env.example` as a template, not as working credentials. Obtain real values from the Supabase project owner. Do not paste secrets into source files, issues, or chat.

## Supabase setup

1. Create or select the intended Supabase project. Use a separate test project for QA and disposable accounts; do not run destructive tests on production data.
2. Review every SQL file in `supabase/migrations/` in timestamp order. The first migration initializes the schema; later files make incremental changes. If the database already has Stagerang data, compare the Supabase migration history and current schema before applying anything. Never rerun the initial schema blindly.
3. Apply only migrations that are not already present, using the Supabase SQL Editor or the Supabase CLI connected to the correct project. Back up production before schema changes. See `SUPABASE-UPDATE-GUIDE.md` for the project's migration notes.
4. In Supabase Authentication settings, enable email/password sign-in, configure the email provider, and set the Site URL and allowed local/production/preview redirect URLs. Follow `AUTH-SETUP.md` for the callback paths and account verification checklist.
5. Set the required environment variables. RLS and policies must stay enabled; do not use a service-role key in the frontend.

Supabase database migrations are not run by `pnpm build` or Vercel deployment. Migration changes need to be reviewed and applied separately.

## Authentication and account setup

Public account types are Creator, Brand, Agency, Celebrity, Event, Media, Community, Distributor, and Freelancer. Admin is not a public signup option. Signup uses Supabase Auth and profile/account initialization depends on the matching database migrations and Auth trigger. Email verification/reset email delivery depends on your Supabase Auth provider configuration.

See `AUTH-SETUP.md` for redirect and email settings and the live auth acceptance checklist. Do not use real customer accounts for test signups.

## Admin owner setup

The admin console is at `/site/admin-dashboard.html`. Admin access requires all of the following: a signed-in verified Supabase user, matching authorization in `public.platform_admins`, the server-only service key for privileged API operations, and the exact `STAGERANG_ADMIN_EMAIL` setting. The first-owner bootstrap is restricted to that verified configured email and only when the platform-admin table is empty. Never grant admin from frontend code or expose the service-role key.

Set these values through the hosting provider's secret environment-variable settings, redeploy, then sign in with the owner's existing Supabase Auth account. No owner password is included in this package. Detailed instructions and limitations are in `ADMIN-SETUP.md` and `ADMIN-WORKFLOW.md`.

## Tests and build

```sh
pnpm test
pnpm build
```

`pnpm test` runs the static site verifier and TypeScript checking. `pnpm build` creates the production Next.js build. This repository currently has no configured unit, integration, lint, or browser E2E test runner. A successful local test/build does not prove that Supabase email, RLS, real-time delivery, admin permissions, or production deployment work. Read `END-TO-END-QA-REPORT.md` and `USER-JOURNEYS.md` for verified scope and live test steps.

## Deploy to Vercel

1. Import the repository into Vercel with the repository root as the project root directory (leave Root Directory empty).
2. Add the four required environment variables to the correct environments. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
3. Deploy the intended Git branch and wait for its production deployment to report Ready.
4. Apply any reviewed, unapplied Supabase migrations separately.
5. Configure Supabase Auth Site URL and redirect URLs for the production domain.
6. Open the site in a private browser window and run the smoke-test steps in `README-DEPLOY.md` / `USER-JOURNEYS.md` with dedicated accounts.

The ZIP contains source and instructions; it does not deploy code or change GitHub, Vercel, or Supabase by itself.

## Troubleshooting

- **Supabase configuration missing:** check that `.env.local` exists locally or that all four hosting variables are set, then restart the dev server or redeploy.
- **Auth redirects to the wrong page:** check Supabase Site URL and allowed callback URLs against `AUTH-SETUP.md`.
- **Admin shows access denied:** check the authenticated account email, `STAGERANG_ADMIN_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, and `public.platform_admins`. Never solve this by adding a client-side admin flag.
- **Database/API errors after deploy:** confirm the correct migrations were applied once, RLS remains enabled, and hosting uses the same Supabase project as the environment values.
- **A code change is not visible:** confirm the intended commit and deployment are live, edit active files in `public/site/`, and hard-refresh or use a private window to rule out browser cache.
- **Build reports a `.next` filesystem error:** stop running dev/build processes, remove only the generated `.next` directory, and rerun `pnpm build`. If it continues, check Windows/OneDrive permissions or file-locking tools; a successful retry does not identify the underlying cause.

## Known limitations and QA status

The latest local QA report records static verification, TypeScript, and a production build as passing. Live end-to-end tests for the nine account types, Supabase Auth/email, persisted two-user workflows, realtime, admin authorization/moderation, and responsive browser rendering were not completed because this checkout had no Supabase test configuration or disposable test accounts. Team invitations are not implemented in the current schema/workflow. Review `END-TO-END-QA-REPORT.md` before treating the application as production-verified.
