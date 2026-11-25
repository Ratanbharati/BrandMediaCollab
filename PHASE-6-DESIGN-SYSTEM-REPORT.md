# Phase 6 — Global UI/UX Consistency & Responsive Repair

> **Build status update (2026-11-22):** A fresh `pnpm test` and `pnpm build` complete successfully in the current checkout. See [FINAL-WEBSITE-AUDIT-2026-11-22.md](FINAL-WEBSITE-AUDIT-2026-11-22.md) for the current audit and remaining live-backend/viewport-testing limits.

## What was standardized

- Added `public/site/design-system.css`, a shared design layer loaded on all 24 application HTML pages.
- Added typography tokens for page, section, and card headings; body and display font stacks; shared spacing, radii, colors, and focus-ring tokens.
- Normalized the heading family/line-height, base body typography, form-control font inheritance, label readability, empty/error/status text rhythm, and toast layering.
- Added reusable `.sr-button`, `.sr-field`, `.sr-card`, `.sr-tab`, `.sr-empty`, `.sr-error`, and `.sr-toast` component hooks; the shared script applies them to existing and dynamically rendered controls while retaining their current brand variants.
- Added one small local outline SVG icon family and `public/site/design-system.js`. It replaces the mixed Unicode icons in primary navigation and marked icon slots while preserving text labels and unread badges. It has no CDN dependency.
- Added shared keyboard focus-visible feedback, reduced-motion handling, 320px minimum viewport support, clipped page-level horizontal overflow, responsive control bounds, scrollable table wrappers, touch sizing, and mobile dialog limits.
- Preserved the existing green, cream, and dark-green Brand Media Collab palette and page-specific layouts.
- Reduced the signed-in product page heading scale to 26–34px while keeping the larger landing-page and Explore hero scale.
- Standardized signed-in navigation typography, common button text to 14px, form controls to 14px, and dense feed controls to 13px.
- Changed the nine home-feed project/account-category tabs to responsive wrapping, with two columns on mobile and no horizontal scrollbar.

## Pages improved

All 24 canonical pages in `public/site`: Admin dashboard, Applications, Brand profile redirect, Creator profile redirect, Dashboard preview, Dashboard, Edit profile redirect, Explore, Feed, Help, Landing page, Landing preview, Logout, Messages, My profile, My projects, Notifications, Profile setup, Project form, Projects, Reset password, Saved opportunities redirect, Settings, and Update password.

The three retired profile/edit/saved pages still redirect to their live destinations. They received the common assets too, so their fallback content remains styled consistently if redirects are unavailable.

## Responsive and accessibility repairs

- Mobile body content cannot widen the document beyond the viewport; media, inputs, selects, and text areas are constrained to their containers.
- Navigation links and actions receive a consistent minimum touch size, with 44px minimum-height primary navigation links on mobile.
- Tables can scroll within their own wrappers rather than pushing the full page sideways.
- Dialogs remain within the mobile viewport and support internal scrolling; focus outlines and reduced-motion preferences are shared.
- Main navigation glyphs now render through one consistent 18px outline SVG family with a uniform stroke and alignment.

## Verification

- `pnpm test` — passed. It checked 24 HTML pages, 12 scripts, the shared stylesheet/script on every page, all local links and script syntax, the Phase 5 checks, and TypeScript.
- `pnpm build` — blocked by Windows `EPERM` while Next.js tried to create a build-output directory under `api/admin`, including with a fresh temporary output directory. No frontend compile error was reported before the filesystem failure.
- This was a source-level responsive audit. I did not run real-device/browser viewport screenshots for all 24 pages in this session.

## Remaining inconsistencies

- Some page-specific controls still have their original sizes and visual variants. The shared system provides common tokens and baseline states while keeping existing page layouts and workflows intact.
- Inline action glyphs that are not in marked icon slots were not all replaced; primary navigation and explicitly marked icons now use the shared family.
- Several pages have custom breakpoint rules. Those remain in place and were not visually validated on physical mobile/tablet devices here.
- The production build is still unverified because of the workspace filesystem restriction.

## Addendum — 25 November 2026

The previous build-status bullets above describe the 22 November run and are superseded by this follow-up: the production build passed on 25 November after the generated `.next` API output directory was created in the workspace; the full `pnpm test` also passed when run sequentially after the build.

The internal-page tokens now defined in `public/site/design-system.css` are:

| Role | Desktop | Mobile / weight |
|---|---:|---|
| Page title | 28px / 36px | 24px / 32px, 600 |
| Section title | 18px / 28px | 600 |
| Card title | 16px / 24px | 600 |
| Body | 14px / 22px | 400 |
| Label and desktop nav | 14px / 20px | 500 |
| Caption | 12px / 16px | 400 |
| Stat | 24px / 32px | 600 |
| Mobile form control | — | 16px / 24px |

DM Sans remains the body/UI stack and Manrope remains the display/heading stack. Explore now uses the 28px internal page title instead of the landing hero scale. Desktop internal navigation is 14px and mobile nav remains 12px to fit the current one-row six-item layout. The home feed category row is now horizontally scrollable with All and active categories; zero-count categories are in More. The redundant non-creator account-type statistic and untracked profile-view statistic were removed, as were the composer’s extra profile/availability actions.

This is not a complete replacement of legacy inline style declarations. Page-specific font sizes, page shells, card and CTA variants, dashboard/message/notification details, and date formats still need a component-by-component pass. The exact five-width before/after screenshot review and rendered contrast measurements in the addendum were not performed. See [PROJECT_AUDIT_REPORT.md](PROJECT_AUDIT_REPORT.md) for remaining scope and tested/blocked status.

## LinkedIn-grade internal shell update — 25 November 2026

The latest rework prompt supersedes prior internal title sizing: internal page titles/section titles are 20px/28px at weight 600; card titles 16px/24px; body and labels 14px/20px; secondary/captions 12px/16px; stats 20px/28px. Heading font is Manrope; body font is DM Sans. Existing palette tokens remain: ink `#1b2b22`, muted `#788078`, paper `#f6f5f0`, surface `#fffefa`, border `#e9e7df`, lime `#b9ee73`, deep green `#293d30`; supplemental muted text uses `#68736b`.

The shell CSS now defines a 56px app header, 1128px internal content maximum, 300px preferred search width, and 60px mobile bottom bar. Tablet shell compacts the logo/navigation labels between 721px and 1023px; the existing small-screen breakpoint remains 720px. These are implementation values from source, not a full design-system convergence: legacy inline styles and page-specific sizes remain, so the requested seven-size maximum has not been verified.

The mobile and desktop navigation/search controls were implemented in the shared static shell. Full component unification and visual viewport verification are still outstanding; see the latest section in `PROJECT_AUDIT_REPORT.md`.

## Website-wide hierarchy and naming follow-up — 25 November 2026

- Internal page titles now use a shared 28px/36px desktop token and 24px/32px mobile token. Section titles use 22px/30px desktop and 20px/28px mobile; card titles remain 16px/24px. Body text remains 14px/20px and captions 12px/16px. Landing hero sizing remains independent.
- Standardized the shared desktop button minimum to 40px while preserving 44px mobile controls. The shared content maximum is now one `--sr-content-max: 1440px` token used by the internal shell and feed layout.
- Removed obsolete hide rules that conflicted with later rules restoring the Home, Projects, Explore, Dashboard, and Notifications headings. Removed the earlier narrow-screen rule that hid secondary Home profile information when the final mobile rule restores it.
- Updated `landing-preview.html` from the retired Stagerang name to Brand Media Collab and aligned its static account-type examples with the current nine profile types. The preview remains marked `noindex` and its call to action still leads to the real account setup.
- Added verifier assertions for title-size tokens, shared button sizing/content width, restored heading visibility contracts, and preview brand/account names.

**Verification:** `pnpm test` and `pnpm build` passed after these changes. No database, Supabase, authentication, route, or project-data behavior was changed. A safe viewport screenshot session and hosted Supabase test identities were unavailable; rendered sizes, contrast measurements, keyboard walkthroughs, and real backend flows remain unverified.
