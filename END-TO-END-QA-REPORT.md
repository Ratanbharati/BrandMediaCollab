# Brand Media Collab — End-to-End QA Report

> **Superseded:** This report is the historical 2026-11-20 snapshot. The current source now includes all nine profile types. See [FINAL-WEBSITE-AUDIT-2026-11-22.md](FINAL-WEBSITE-AUDIT-2026-11-22.md) for the latest local test/build results and current verified/blocked statuses.

Date: 2026-11-20

## Test setup and limits

- The checkout has no `.env.local`, no Supabase CLI, and no connected Supabase test project. The only environment file is the placeholder `.env.example`.
- No test users were created. Without the real project URL, publishable key, configured email provider, and a safe test project, signup and persisted two-user workflows cannot be exercised honestly.
- `package.json` provides `test:site` and `test` only. There are no configured lint, unit, integration, browser, or end-to-end test commands or declared Playwright/Cypress dependencies.
- Browser console, network requests, database logs, RLS denials, Realtime delivery, and real viewport screenshots were not collected.

## QA matrix

| Feature | Status | Tested | Issue | Fix / next action |
|---|---|---|---|---|
| Static site/source verification | PASS | Yes — `pnpm test:site` checked 24 HTML pages, 12 scripts, shared assets, local links, six account/project types, and selected feature wiring | Static checks do not exercise live persistence or browser interactions | Keep as repository verification; add browser tests when a configured test environment exists |
| Type checking | PASS | Yes — `pnpm test` runs `tsc --noEmit` | None found | No change needed |
| Production build | PASS | Yes — final `pnpm build` compiled, type-checked, generated static pages, and completed route tracing | Intermittent Windows `EPERM` creating generated `.next` admin-route directories. It recurred once after cache cleanup; a direct write probe succeeded and a subsequent build completed. Root cause is not conclusively identified. | Final build passed. If it recurs, stop other Next processes, check OneDrive/endpoint-protection locks and directory permissions, clear only generated `.next`, and retry. |
| Creator account E2E | BLOCKED | No live signup/login/profile/dashboard/project/message workflow | Missing Supabase configuration and test account | Configure a separate test Supabase project and create a disposable Creator account |
| Brand account E2E | BLOCKED | No live workflow | Missing Supabase configuration and test account | Configure a separate test Supabase project and create a disposable Brand account |
| Agency account E2E | BLOCKED | No live workflow | Missing Supabase configuration and test account | Configure a separate test Supabase project and create a disposable Agency account |
| Celebrity account E2E | BLOCKED | No live workflow | Missing Supabase configuration and test account | Configure a separate test Supabase project and create a disposable Celebrity account |
| Event account E2E | BLOCKED | No live workflow | Missing Supabase configuration and test account | Configure a separate test Supabase project and create a disposable Event account |
| Media account E2E | BLOCKED | No live workflow | Missing Supabase configuration and test account | Configure a separate test Supabase project and create a disposable Media account |
| Authentication: signup, login, validation, duplicate, reset, verification, persistence, logout, protected routes | BLOCKED | Not against Supabase Auth | No configured Supabase endpoint, email provider, or disposable credentials | Run the listed auth matrix on the test project; do not use production users for destructive tests |
| Profiles: create, validation, save, edit, refresh, privacy, discovery, completion | BLOCKED | Not against persisted accounts | Same missing live backend and accounts | Run one profile lifecycle per account type on the test project |
| Project search and filters | BLOCKED | Source wiring checked; no live result set | Requires project/profile rows in Supabase | Seed known test records and assert result sets and filter behavior |
| Project create/edit/publish/save/application workflow | BLOCKED | No two-user live workflow | Requires authenticated users and database writes | Test the Account A → Account B workflow against test data |
| Connection request and acceptance | BLOCKED | Not live | Requires Realtime-enabled Supabase and two users | Verify both sides’ state and notification after request/accept |
| Messaging, unread count, and read state | BLOCKED | Not live | Requires two users, messages, notifications, and Realtime | Verify persisted replies, unread counts, and read-state updates in both sessions |
| Notifications and dashboard statistics | BLOCKED | Not live | Requires generated activity and live database records | Compare counts/records before and after each test action |
| Admin login, user search, moderation, verification, suspension, audit | BLOCKED | Source exists; no live role/account test | Requires configured owner/admin account, service key, and test users | Test authorized admin and normal-user denial in a separate test project |
| Team invitations | FAIL | Source/schema inspected | The current schema has no teams or invitations table/workflow; the UI reports invitations unavailable | Implement the feature and persistence workflow before accepting this test as applicable |
| Responsive CSS baseline | PASS | Source/static check only — shared design-system assets load on all 24 HTML pages and include mobile rules | This is not a rendered viewport test | Keep the shared breakpoints and add screenshot/browser coverage |
| 360px, 390px, 768px, 1024px, 1440px rendered viewport QA | NOT TESTED | No browser viewport run | No browser automation test setup used in this QA | Add Playwright/Cypress and capture each critical route at each viewport |
| Lint | NOT TESTED | No lint command or declared ESLint setup | Lint is not configured in `package.json` | Add/configure lint before treating lint status as passing |
| Unit tests | NOT TESTED | No unit-test command/framework configured | No unit tests in package scripts | Add tests for pure data mapping and validation functions |
| Integration tests | NOT TESTED | No integration test command configured | No backend test environment | Add database-backed tests on an isolated Supabase project |
| Browser E2E tests | NOT TESTED | No E2E framework/configuration | No Playwright/Cypress setup | Add E2E framework and test accounts after Supabase test configuration |
| Console/network/database/RLS/Realtime/performance diagnostics | NOT TESTED | No running authenticated browser session or live backend | Requires live app/backend and observability access | Collect browser logs, failed requests, Supabase logs, subscription status, and performance traces during E2E |

## Fix loop record

The production build encountered intermittent `EPERM` errors while Next.js created generated directories under `.next`. After verifying the directory was inside the workspace and was not a reparse point, I removed only the generated `.next` cache. The error recurred once; creating the reported directory and confirming a direct write probe succeeded was followed by a successful `pnpm build`. The exact source of the intermittent filesystem restriction remains unknown. `pnpm test` passed. No backend or account-flow issue can be validated against live behavior until a test Supabase configuration is available.

## Completion assessment

This QA run does **not** establish that the live application is fully functional. Repository checks, TypeScript, and production build passed. Six account lifecycles, authentication against Supabase, two-user persistence/Realtime, admin permissions, and rendered viewport coverage remain blocked or untested. Team invitations are a known missing feature in the current schema/workflow.
