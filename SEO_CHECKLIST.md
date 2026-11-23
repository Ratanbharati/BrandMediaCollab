# SEO checklist — Brand Media Collab

**Evidence date:** 22 November 2026. This records source configuration, not Google indexing or Search Console results.

## Implemented in source

- Landing page (`public/site/index.html`) defines a page title, description, canonical URL, Open Graph and Twitter/X metadata, and Organization/WebSite JSON-LD.
- `public/robots.txt` permits crawling and references `https://www.brandmediacollab.com/sitemap.xml`.
- `public/sitemap.xml` currently lists only the canonical homepage.
- Preview pages are marked `noindex`; authenticated application pages should not be search results.
- GTM container `GTM-N843Z826` appears in the static page set. Presence of the loader does not establish that GA4 is configured, consent is handled, or events are received.

## Gaps and recommendations

| Area | Current state | Recommended next step |
|---|---|---|
| Public indexable URLs | Homepage only in sitemap; no dedicated indexed profile/project route identified | Decide which public profile/project pages are intended for discovery, then create stable server-rendered/crawlable routes with privacy checks. |
| Sitemap | One URL | Generate only canonical, public, indexable routes; exclude previews, login, dashboards, messages, settings, and admin. |
| Metadata | Homepage metadata present | Add unique metadata on every intended public route; avoid generic duplicated titles/descriptions. |
| Structured data | Organization and WebSite on landing | Validate JSON-LD with Google's tools; add breadcrumbs only to routes that actually display breadcrumbs. |
| Robots/indexation | robots allows crawl; private page tags exist in source | Confirm all private pages return `noindex` and require authentication; robots.txt alone is not access control. |
| Canonical/redirects | Homepage canonical present; domain redirect/DNS is external | Verify www/non-www canonical and redirects over HTTPS after domain setup. |
| Analytics | GTM loader present | Inspect GTM container and GA4 property, configure consent/privacy, define aggregate product events, and verify events in DebugView. |
| Performance | Not measured with Lighthouse/PageSpeed in this session | Run Lighthouse/PageSpeed on deployed public pages; optimize LCP image, layout shift, font loading and scripts based on measurements. |
| Social cards | OG/Twitter tags present on homepage | Verify preview image URL returns a crawlable image with correct dimensions and Brand Media Collab identity. |
| Legal/trust pages | No active dedicated About/Terms/Privacy routes confirmed | Publish accurate public company/product/legal pages before seeking broad indexing or advertising. |

## Indexing policy

Index public marketing/help pages and intentionally public profiles/projects only after explicit privacy rules and crawlable routes exist. Do not index account setup, login/recovery, private profiles, dashboards, projects requiring membership, conversations/messages, notifications, account settings, or admin routes. Keep private data protected by authentication and RLS; `noindex` is not a security control.

## Manual release checks

1. Open the deployed homepage source and confirm canonical, title, description, OG/Twitter and JSON-LD values match the chosen domain and brand.
2. Fetch `/robots.txt` and `/sitemap.xml` from production and verify HTTP success and canonical host.
3. Check every private route for authentication enforcement and `noindex` metadata.
4. Run structured-data validation and Lighthouse on the deployed URL.
5. In Search Console, verify domain ownership, submit the sitemap, and inspect canonical/index coverage.
6. In GTM Preview and GA4 DebugView, confirm consent behavior and only the intended non-sensitive events. Never send message contents, email addresses, tokens, or private profile fields to analytics.

These external checks require the domain, Search Console, and analytics account access; they were not verified from this repository checkout.
