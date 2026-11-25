# Brand Media Collab — Website UI/UX Audit and Improvement Plan

**Date:** 25 November 2026  
**Audit stage:** Source inspection and limited read-only live-site inspection, completed before implementation.

## Scope and evidence

- Reviewed the current checkout at commit `71e3838` (`Add files via upload`), 24 HTML pages under `public/site/`, shared `design-system.css` and `design-system.js`, the category selector, the static site verifier, package scripts, the existing design-system/audit reports, and the nine-type Supabase migration.
- Ran `pnpm test` before making changes. It passed the static site verifier and TypeScript check.
- Opened the deployed signed-in site in the available Chrome session and inspected its accessibility tree. The snapshot showed the current internal navigation, feed, project cards, account profile context, activity panel, and chat actions with live content. The browser automation handle switched to another open tab during visual capture; no further browser interaction was attempted.
- The public web viewer could not fetch the production URL. No safe, stable browser session was available for viewport screenshots or interaction testing.
- Prior audit documentation records the nine account types and corresponding source/database support. No Supabase credentials or test-account authorization were available for hosted workflow testing.

This is a source-based review of the latest available checkout plus a limited desktop live snapshot. It is not a certification of every live route or backend behavior.

## What is working well

- The site has one shared design layer loaded across the canonical page set, central font/color/spacing tokens, a consistent local SVG navigation icon set, keyboard-focus styling, reduced-motion support, and a shared signed-in shell.
- The shell has separate desktop navigation and compact mobile destinations, account menu, global search handoff, and unread message/notification indicators.
- The user-visible product already covers landing/auth, all nine profile types in source, profile setup/edit, projects, applications, discovery, connections, messages, notifications, settings, support, and admin pages.
- Live snapshot confirmed that Home is connected to real project and activity content and exposes project detail, save, and chat actions. This confirms rendered content exists; it does not verify each backend action.
- Existing static verification and TypeScript checks pass.

## Audit findings and improvement plan

| Existing condition / problem | Recommended improvement | Pages or components | Priority | Expected outcome | Status |
|---|---|---|---|---|---|
| The shared style layer contains a number of successive corrective sections and several overlapping responsive thresholds (including 680, 720, 767, 800, 900, 1023, 1120px). This makes the final winning rule difficult to predict and raises the chance that a change on one viewport undoes another. | Consolidate only the high-use shared typography/control/mobile-shell rules that are supported by source evidence; leave workflow-specific page rules intact. Add source checks for the resulting shared contracts. | `design-system.css`, `design-system.js`, site verifier | High | A more predictable common baseline with fewer accidental cross-page regressions. | Partly fixed: shared type/control rules centralized; full breakpoint consolidation remains |
| The shared tokens exist, but HTML pages still define substantial inline styles. Source counts show the Home and Messages pages alone contain over 100 `font-size` declarations each; Projects, Dashboard, signup and landing also have many. | Continue moving common roles (page title, section title, card title, body, label, caption, controls) to the shared token layer where selectors can target existing semantic classes safely. Avoid a risky wholesale rewrite of page markup. | Shared design system plus existing page classes | High | Similar interface elements read and behave consistently without flattening the product’s page layouts. | Partly fixed: internal title/section/control roles updated; inline legacy rules remain |
| The `landing-preview.html` document title still says “Stagerang,” while the active landing page and product are Brand Media Collab. | Correct preview metadata and visible preview branding references that are strictly stale product naming; preserve the page’s illustrative/preview status. | Landing preview | Medium | No old brand name appears in the browser tab for the current preview. | Fixed in source; noindex retained |
| The current mobile feed CSS intentionally stacks content and hides some secondary profile panels at narrow widths, while later responsive rules restore some of those panels. The source order and multiple breakpoints make mobile information visibility hard to reason about. | Make the mobile information hierarchy explicit: retain essential identity and activity context, collapse secondary information behind existing navigation or a clear disclosure, and use one well-defined responsive rule per shell behavior. Do not remove useful content. | Home feed mobile shell | High | A readable mobile feed that preserves helpful information without crowding the post stream. | Partly fixed: contradictory hide rule removed; rendered viewport still needs inspection |
| Existing audit reports state that 320/375/430/768/1024/1440/1920px rendered screenshots, contrast measurements, and browser interaction checks were not completed. | Add or use an available browser viewport runner only if already present; otherwise report viewport checks as blocked rather than infer a visual pass from CSS. | All 24 pages; critical flows first | High | Honest evidence for mobile, tablet, laptop, and desktop behavior. | Blocked by browser tooling |
| Source and migration support nine account types, but the hosted signup, onboarding, profile, application, messaging, and admin paths have not been tested with nine accounts. | Keep the nine-role support unchanged; schedule role-by-role and two-user testing against a configured Supabase test project. | Auth, profiles, Explore, Projects, Connections, Messages, Admin | Critical for release; outside safe local validation | Demonstrated role-specific behavior and authorization from the real backend. | Blocked by hosted credentials/test accounts |
| The live desktop snapshot shows project status and “Open chat” together as intended for active work; it does not establish whether each action persists correctly. | Preserve current real-data actions and status; test save, open chat, apply, and status synchronization only in a disposable authorized test environment. | Home and Projects cards; application/chat flows | High | No false-success or stale state in cross-page workflows. | Not live-tested |
| Prior audit identified narrow SEO indexing, incomplete legal pages, GTM scope needing privacy review, and absent team/invitation schema. These are product/backend questions, not safe UI-only assumptions. | Keep these items documented and avoid adding fake functionality or privacy claims during this UI pass. | Public pages, analytics, Settings, backend roadmap | Medium | Design work does not imply missing services are operational. | Documented follow-up |

## Implementation boundary

The implementation will preserve the nine account types, existing routes, live data contracts, Supabase integration, and Brand Media Collab’s cream/green visual identity. Changes will focus on a small number of source-verified inconsistencies: shared type/control behavior, the mobile shell’s information visibility rules, stale preview metadata, and automated assertions. No schema migration or production data change is planned.

## Review checklist after implementation

- `pnpm test` and `pnpm build` pass.
- JavaScript syntax and local page wiring pass the existing verifier.
- A new automated check confirms current product naming in landing preview and required shared CSS contracts.
- The diff touches only the audit/documentation and UI sources required for those fixes.
- Rendered viewport screenshots, keyboard/contrast measurements, live Supabase workflows, and production-domain routing remain explicitly unverified unless those tools and credentials become available.
