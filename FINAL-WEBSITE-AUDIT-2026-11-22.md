# Brand Media Collab — Final Local Website Audit

Audit date: 2026-11-22  
Scope: current local checkout, code and migrations. This is not a live production certification.

## Executive result

**Ready for continued staging, not verified ready for production.** The current source passes the repository verifier, TypeScript, and a Next.js production build. The verifier checks 24 static HTML pages, 12 browser scripts, local references, shared design-system loading, and source-level wiring for all nine profile types, authentication, projects, applications, notifications, and selected realtime flows.

No Supabase credentials or test project are configured in this checkout (`.env.local` is absent). Consequently, signup, email delivery, live data persistence, RLS behavior, deletion against actual storage, realtime delivery, cross-account workflows, and production deployment could not be exercised. No live accounts or data were created or changed in this audit.

## Pages and source reviewed

Active frontend pages in `public/site/`:

- `index.html`, `landing-preview.html`
- `feed.html`, `projects.html`, `project-form.html`, `my-projects.html`, `saved-opportunities.html`, `applications.html`
- `explore.html`, `creator-profile.html`, `brand-profile.html`, `my-profile.html`, `edit-profile.html`, `profile-setup.html`
- `dashboard.html`, `dashboard-preview.html`, `messages.html`, `notifications.html`, `settings.html`, `help.html`
- `admin-dashboard.html`, `logout.html`, `reset-password.html`, `update-password.html`

Reviewed supporting code: `app/` API routes and Next.js shell, `public/site/*.js`, `public/site/design-system.css`, `public/site/design-system.js`, all 30 canonical SQL migration files, `scripts/verify-site.mjs`, and the README/setup/QA guidance.

## Verification results

| Area | Status | Evidence / limits |
|---|---|---|
| Static page and source checks | PASS | `pnpm test:site`: 24 pages, 12 scripts, required local scripts/links, shared UI assets, nine role labels/mappings, selected auth/data/realtime hooks |
| TypeScript | PASS | `pnpm test` includes `pnpm exec tsc --noEmit`; command exited successfully on 2026-11-22 |
| Production build | PASS | After clearing only the ignored `.next` cache, `pnpm build` completed with Next.js 15.5.29 on 2026-11-22 and emitted the app/API route table |
| Local HTTP route smoke test | BLOCKED | The app server started, but the sandbox denied local socket access when requesting `127.0.0.1`; deployed routes could not be smoke-tested from this session |
| Authentication with Supabase | BLOCKED | No `.env.local`, disposable test project, or test identities in the checkout |
| Nine signup/profile journeys | NOT TESTED | Source supports all nine roles; no end-to-end user journeys were executed |
| Projects/applications across two accounts | NOT TESTED | Requires authenticated test accounts and persisted test records |
| Connections, messages, unread status and notifications | NOT TESTED | Realtime source hooks exist; no live subscription/session was available |
| Admin login, authorization, moderation and deletion | NOT TESTED | Protected routes and admin operations are present in source; no admin session or backend request was exercised |
| Supabase schema, RLS, Storage and migration state | BLOCKED | Migration source was reviewed; live schema, policies, storage buckets, and migration ledger were unavailable |
| Responsive visual QA at 360/390/768/1024/1440 | NOT TESTED | CSS source was inspected and feed category tabs were corrected to wrap; no rendered viewport comparison/browser automation was run in this audit |
| Console, network, accessibility tree and performance | NOT TESTED | Requires running browser sessions and live app configuration |
| Lint/unit/integration/browser E2E | NOT TESTED | No lint, unit, integration, or E2E runner is configured in `package.json` |
| Team invitations | FAIL / absent | Current profile setup UI indicates invitations may be configured later; reviewed schema has no team/invitation workflow |

## Nine account types

The source and migration include Creator, Brand, Agency, Celebrity, Event, Media, Community, Distributor, and Freelancer. `scripts/verify-site.mjs` statically checks their presence in signup, project classification, Explore filters, conversation filters, and the nine-type migration. Static presence does not verify behavior or database acceptance.

| Profile | Signup source | Profile creation/edit | Explore | Projects | Connections | Messaging |
|---|---|---|---|---|---|---|
| Creator | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Brand | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Agency | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Celebrity | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Event | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Media | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Community | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Distributor | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |
| Freelancer | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Source present; E2E not tested | Not tested live | Not tested live |

## Design system found in source

Primary shared tokens are in `public/site/design-system.css`. The project retains page-level inline CSS, so these values are the shared baseline, not a guarantee that every component uses only these values.

### Color tokens

| Token | Value | Use |
|---|---|---|
| `--sr-ink` | `#1b2b22` | Main text |
| `--sr-muted` | `#788078` | Secondary text |
| `--sr-paper` | `#f6f5f0` | Page background |
| `--sr-surface` | `#fffefa` | Card/surface background |
| `--sr-line` | `#e9e7df` | Borders |
| `--sr-green` | `#b9ee73` | Accent/highlight |
| `--sr-deep` | `#293d30` | Deep brand/button color |
| `--sr-focus` | `rgb(105 153 69 / 28%)` | Focus halo |

Page-specific styles define additional colors, including success, warning, and error shades; these are not fully centralized and vary in the source.

### Typography

- Body: `DM Sans`, then Arial, sans-serif.
- Display/headings: `Manrope`, then DM Sans, Arial, sans-serif.
- Fonts are loaded from Google Fonts in page markup; offline/local font fallback is Arial/sans-serif.
- Shared scale: 12px (`0.75rem`), 14px (`0.875rem`), 16px (`1rem`), 18px (`1.125rem`).
- Internal page heading: `clamp(26px, 2.5vw, 34px)`; marketing/Explore hero heading: `clamp(36px, 5.5vw, 72px)` desktop and `clamp(32px, 10vw, 52px)` mobile.
- Section heading: `clamp(20px, 1.8vw, 24px)`; card heading: 18px.
- Shared heading weight: 700. Standard buttons and fields use 14px; dense feed category/composer controls use 13px; internal navigation uses 13px desktop and 10.5px mobile. Page-specific captions and metadata still have some smaller sizes.

### Spacing, controls and layout

- Shared spacing tokens: 4, 8, 12, 16, 20, 24, and 32px.
- Shared control radius: 10px; card radius: 16px.
- Focus ring: 3px with green at 28% opacity.
- Mobile buttons/tabs/fields: minimum 44px under 720px; baseline controls are 40px minimum in shared CSS.
- Primary navigation: 68px desktop; mobile wraps with a 66px minimum and a 48px nav row.
- Icons: local outline SVG set, 18×18px, 1.8px stroke.
- Main layout width, card padding, shadows, and exact button padding are page-specific rather than fully tokenized.
- Shared responsive breakpoint: 720px. Page-level breakpoints also include 850px, 650px, and 480px; these remain inconsistent by design/page.
- Minimum body width is 320px; tables scroll inside wrappers; page-level horizontal overflow is clipped.
- Only a light theme is present in the shared tokens. A separate dark theme was not found in the reviewed shared design system.

## Backend and security source review

- Supabase is the intended data source. The browser config endpoint returns only the project URL and publishable key; the admin service-role key is referenced in server API code and not found in `public/`.
- The migration chain enables RLS on the core profile, project, application, conversation, message, notification, and admin-related tables and adds ownership/participant policies. This is a source review only; hosted policy state was not queried.
- The nine-role migration is additive in source, but applying it to the live project and validating compatibility remains an operator step.
- Admin APIs call a backend authorization helper and use server-side service credentials. The newest local admin account-delete code additionally checks admin status, protects the signed-in account, confirms the target email, removes avatar bucket files, deletes the Auth user, and writes audit events. This code has not been run against Supabase; confirm cleanup across every bucket if additional user-owned buckets exist.
- Added the idempotent `20261119001000_enable_profile_discovery_realtime.sql` to the canonical migration folder after finding that the existing update guide referenced only a root-level duplicate. No RLS policy was changed or disabled.

## Hygiene changes made during this audit

- Added ignore rules for local browser automation profiles and generated screenshots. Such browser profiles may contain session state and should not be committed or uploaded.
- Added ignore rules for extracted delivery snapshots and prior ZIP artifacts to prevent accidental source uploads.
- Normalized internal page navigation and common control typography to shared DM Sans sizing while preserving the marketing hero display scale.
- Changed the home feed's nine role/project tabs from a horizontal-scroll strip to a responsive wrapping grid (two columns on mobile, auto-fit on larger screens), so all nine account categories are reachable without a scrollbar.
- Rebuilt the delivery archive with `app/`, `public/`, `supabase/`, and manifests directly at ZIP root. The previous archive had a `brand-media-collab/` wrapper that could lead to uploading a nested folder instead of replacing the deployed root.
- No user records, credentials, or production database data were modified.

## Remaining risks and next actions

1. Configure a separate Supabase test project and test-only credentials, then apply/review migrations against its migration history.
2. Run disposable-account flows for each of the nine roles, then two-user project, connection, messaging, notification, and admin workflows.
3. Validate live RLS, Auth email/reset settings, Storage buckets/policies, and Realtime publication; source text alone cannot establish hosted state.
4. Add a browser E2E runner and viewport screenshots at 360, 390, 768, 1024, and 1440px; add lint and unit checks.
5. Implement team invitations only if still in product scope; the current schema/UI does not provide the full feature.
6. Confirm the current Git commit, Vercel production deployment, environment variables, and domain response from the owner’s connected dashboards.

## Deployment assessment

**Staging candidate with limitations. Not production-certified.** Local source verification, TypeScript, and production build passed. Live backend behavior, security policy state, all nine end-to-end journeys, responsive rendering, and production deployment were not verified in this run.
