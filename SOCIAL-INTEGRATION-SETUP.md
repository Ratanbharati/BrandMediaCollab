# Brand Media Collab: Instagram and YouTube connection setup

This update adds optional, read-only Instagram and YouTube account connections to **Settings & Privacy → Connected services**. It uses the official platform OAuth screens, so BMC never sees a member's social password. Instagram Insights and YouTube Analytics are available only for the account that authorizes access. YouTube channel reports use `channel==MINE` and OAuth authorization; public channel statistics and private analytics are distinct APIs.

## What is included

- Instagram professional-account OAuth, account profile/follower summary, and available account insights.
- YouTube owner OAuth, channel summary, subscriber total (when public), lifetime views, and a recent analytics summary when available.
- Refresh and disconnect controls.
- Server-only encrypted access/refresh tokens; credentials are not returned to the browser.
- A migration that isolates OAuth credentials in a table with RLS enabled and no client read/write policies.
- Existing public `social_accounts` remains the source for social profile links and follower/subscriber count used in member discovery.

No BMC payment, publishing, inbox, or campaign-management access is requested. Review provider permission screens carefully before granting access.

## Before starting

You need access to:

1. The Meta developer account that will own the Instagram app.
2. The Google Cloud project that will own the YouTube OAuth client.
3. The production hosting environment settings (Vercel or the project's actual host).
4. The Supabase SQL editor for the BMC project.

Do not put app secrets, OAuth secrets, encryption keys, or the Supabase service-role key in browser code, a public repository, a screenshot, or a chat message.

## Step 1 — Upload this code and deploy a preview

Extract the accompanying ZIP into the root of the current GitHub repository, preserving folders, then commit and deploy a preview. Do not test against real users first. For preview testing, use the exact preview hostname as `BMC_SITE_URL` and register that hostname's callback URLs in both provider dashboards.

## Step 2 — Add the database migration

In the Supabase SQL editor, run:

`supabase/migrations/20261126120000_social_oauth_connections.sql`

This only creates the private credentials table, its index, and access restrictions. It does not modify or delete existing member data. The API uses the existing `social_accounts` table, so the initial BMC schema must already be installed.

## Step 3 — Configure Instagram / Meta

1. In Meta for Developers, create or open the BMC app and add the **Instagram API with Instagram Login** product/use case.
2. Set the Instagram OAuth redirect/callback URL to exactly:
   `https://YOUR_TEST_OR_PRODUCTION_HOST/api/social/callback/instagram`
3. Request only the scopes needed by this feature: `instagram_business_basic` and `instagram_business_manage_insights`.
4. Add the Instagram app ID and app secret to the hosting environment as `META_INSTAGRAM_APP_ID` and `META_INSTAGRAM_APP_SECRET`.
5. Initially test using Instagram professional (Creator or Business) accounts assigned to the Meta app as testers/developers. Before opening the feature to all BMC members, complete Meta's access review/business verification requirements for the requested permissions.

Meta's Instagram Login API supports professional accounts and does not require a linked Facebook Page. Access availability and review requirements are controlled by Meta and can change. See the [Instagram API changelog](https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/) and [Insights reference](https://developers.facebook.com/docs/graph-api/reference/shadow-ig-user/insights/).

## Step 4 — Configure YouTube / Google

1. In Google Cloud Console, select the BMC project and enable **YouTube Data API v3** and **YouTube Analytics API**.
2. Configure the OAuth consent screen with BMC's product name, contact email, authorized domains, privacy policy URL, and terms URL.
3. Create a **Web application** OAuth client.
4. Add this exact authorized redirect URI:
   `https://YOUR_TEST_OR_PRODUCTION_HOST/api/social/callback/youtube`
5. Add the OAuth client ID and client secret to hosting as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
6. During testing, add the Google account(s) that own test channels to the consent screen's test users. Before general release, complete Google's verification/security assessment steps for the requested scopes if Google requires them.

The feature requests read-only scopes for YouTube channel information and non-monetary analytics. A user must authorize the Google account that owns the channel; it cannot read analytics for arbitrary channels. See Google's [YouTube Analytics query reference](https://developers.google.com/youtube/analytics/reference/reports/query) and [channel reports guide](https://developers.google.com/youtube/analytics/channel_reports).

## Step 5 — Set server environment variables

Add these values in your hosting provider's **server environment settings** (Production and Preview as needed):

| Variable | Value |
| --- | --- |
| `BMC_SITE_URL` | Exact deployed site origin, e.g. `https://www.brandmediacollab.com` |
| `SOCIAL_OAUTH_CALLBACK_BASE_URL` | Optional. Leave blank to use `BMC_SITE_URL`; otherwise use the exact site origin. |
| `SOCIAL_OAUTH_STATE_SECRET` | A unique random string of at least 32 characters. |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Base64 output of 32 random bytes; keep stable or saved tokens cannot be decrypted. |
| `META_INSTAGRAM_APP_ID` | Meta app ID. |
| `META_INSTAGRAM_APP_SECRET` | Meta app secret. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth web client ID. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth web client secret. |

Generate the two secrets locally using Node.js:

```sh
node -e "const c=require('crypto'); console.log('SOCIAL_OAUTH_STATE_SECRET='+c.randomBytes(48).toString('base64url')); console.log('SOCIAL_TOKEN_ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'))"
```

Do not commit the generated values. Restart/redeploy after setting environment variables.

## Step 6 — Test using accounts you control

1. Open the deployed preview, sign in, and go to **Settings & Privacy → Connected services**.
2. Connect a Meta-assigned Instagram professional test account. Approve the requested read-only access. Confirm account name, public profile link, available follower count, and any available insights.
3. Connect a Google test account that owns a YouTube channel. Approve the read-only access. Confirm the channel name, subscriber total if visible, lifetime views, and whether recent analytics are available.
4. Use **Refresh insights** and check the displayed refresh time. Some metrics may be unavailable, delayed, rounded, permission-limited, or omitted by the platform.
5. Disconnect each account and confirm the social row and stored metrics are removed from BMC.
6. Try canceling authorization and a non-owner YouTube account. These should not create a connected account.
7. Check Supabase: the private table should contain encrypted token ciphertext, never plain access tokens. The public `social_accounts` table contains only the social profile URL and follower/subscriber total.

## If you see an error

- **“not configured”**: check the server environment variable names and redeploy.
- **redirect URI mismatch**: the callback URL must match character-for-character in both the provider console and deployed environment.
- **permission/invalid scope**: confirm the API product, exact scopes, app mode, tester access, and review status.
- **Instagram has no insights**: ensure it is a Creator or Business account and that Meta has granted insights access; some metrics do not exist for every account or time window.
- **No YouTube channel**: sign in with the Google account that owns/manages the channel.
- **Google says app is unverified**: continue only with approved test users during development; complete Google's verification process before public access.

## Important provider and privacy constraints

Provider approval is separate from the code and cannot be completed from this repository. Meta/Google can change scopes, access, metrics, app review, or retention requirements. Before launching to all users, review the current provider platform terms and data retention policies, add any required provider data deletion/revocation callback, and confirm the final privacy disclosures with your legal reviewer. BMC should request only the access it needs and provide a working disconnect/deletion path.

**Launch limitation:** this patch does not implement Meta's app-level data deletion request/deauthorization callback endpoint. Keep the Meta app in development/test mode until that callback and any other requirements shown in Meta's current App Review dashboard have been completed and reviewed.

## UI and policies in this patch

The existing form layouts are retained. Shared controls use the existing BMC font and palette, standardize label/control typography, improve focus contrast, and provide comfortable mobile control heights. Terms and Privacy pages are linked from the public site footer, settings, and signup consent. They are draft policies and need the operator's legal details and local legal review before production.
