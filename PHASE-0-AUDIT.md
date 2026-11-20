# Stagerang Phase 0 Audit

**Snapshot:** GitHub `main` at `71e3838` (`Add files via upload`)  
**Audit date:** 2026-11-20  
**Production data:** preserved; no existing rows were changed or deleted.

## Architecture

- Next.js 15.5 is the hosting shell and serves the active site from `public/site`.
- The product pages are static HTML/CSS/JavaScript that use Supabase JS; server routes are under `app/api`.
- `/api/supabase-config` returns only the public URL and publishable key. The service-role key is read only by server-side admin routes.
- `brand-media-collab-supabase-ready`, root-level HTML/JS/SQL copies, and similarly named files are archived copies. Production page changes belong in `public/site`.
- The repository had no `.gitignore`, root `.env.example`, lockfile, or automated verification workflow. These are added in this work.

## Application and data audit

- The active signup UI, profile setup, project form, Explore page, Projects page, and message filters include Creator, Brand, Agency, Celebrity, Event, and Media.
- Project ownership/type mapping and category tabs exist for all six types. Feed updates use Supabase Realtime with a 30-second polling fallback.
- Messages, applications, notifications, connections, dashboard, and project pages contain Supabase-backed reads/writes and Realtime subscriptions; static checks alone cannot prove their authenticated behavior.
- Profile-editing fields are role-specific. Public profile queries use the `discover_profiles` RPC and hide profiles unless discoverability is enabled.
- The admin routes authenticate a Supabase user server-side, check `platform_admins`, keep service-role access on the server, and audit sensitive changes. The current admin UI/API is a partial console; suspension/restoration, formal verification, report queues, and platform settings are not present.
- Settings supports profile visibility, password/email flows, export, and support requests. Member account deletion is handled through Support; permanent deletion is available only through the owner console.
- Social OAuth/follower sync and push/browser notifications are not implemented. The app uses in-app notifications and browser notification APIs only where permission already exists.

## Connected Supabase project

- The connected project is active and healthy. All 18 public application tables have RLS enabled.
- The database contains the six supported account types. No row-level user data was selected during this audit.
- The Realtime publication includes profiles, projects, applications, saved projects, connections, conversations, members, messages, and notifications.
- Supabase health advisor returned no findings.
- Supabase security advisor reports leaked-password protection disabled. This is a Supabase Auth dashboard setting and was not changed here.
- Performance advisor initially reported 19 foreign-key columns without indexes and four overlapping permissive SELECT policy pairs. An additive index-only migration was applied to the existing database and is recorded as `20261120085108_add_missing_foreign_key_indexes`. The four SELECT policy pairs remain unchanged pending a semantics review. Immediately after creating the indexes, Supabase's advisor reported them as unused because they have not yet been exercised by production query traffic.
- The migration ledger was checked. Never replay `202611150001_initial_schema` against the populated production project.

## Hosting and delivery state

- A local production build passes. The Vercel connector for the connected team returns no project or deployment records, so this session could not verify production environment variables or which commit is live.
- No code has been pushed or deployed from this workspace. The attached ZIP is a local source package, not evidence of a production deployment.
- Authenticated multi-user checks and visual mobile/desktop review require a reachable local/deployed browser session and dedicated test accounts. The attempted local HTTP probe could not cross the sandbox boundary, so it is not counted as a pass.

## Phase 0 outcome

The active source, database, deployment boundary, and known gaps are identified. The implementation preserves the existing architecture and data, adds reproducible local checks, and records the safe database index improvement. End-to-end production readiness is still pending the workflow acceptance run and Vercel deployment verification described in `USER-JOURNEYS.md` and `README-DEPLOY.md`.
