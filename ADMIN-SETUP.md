# Stagerang owner console setup

The live owner console is served at `/site/admin-dashboard.html`. Sign in there with the owner’s existing verified Stagerang account.

## Vercel environment variables

In Vercel, open the project’s **Settings → Environment Variables** and add:

- `STAGERANG_ADMIN_EMAIL`: the exact verified email used by the platform owner’s Stagerang account.
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role secret for the connected project. Store this as a server-only variable. Never prefix it with `NEXT_PUBLIC_`, put it in a browser file, or send it in chat.

Keep the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables. Redeploy after adding environment variables.

## First owner sign-in

If `platform_admins` has no member yet, the first sign-in to the console automatically registers the authenticated, email-verified account whose email exactly matches `STAGERANG_ADMIN_EMAIL`. If an admin already exists, only accounts already in `platform_admins` can use the console. No SQL migration or manual database edit is required.

## What the console can do

- Show live counts and paged member records, including account email and linked profile details.
- Search members and hide/show profiles in discovery.
- Browse live projects, applications, support requests, and admin audit entries.
- Permanently delete an account only after typing its exact email and confirming a second prompt. The admin cannot delete the account currently being used. User-owned records follow the existing database foreign-key cascade rules.

Private campaign message bodies are not included in the console. They remain visible only to conversation participants unless a specific support-report review workflow is added.

## Recovery

If an admin loses access, the platform owner must restore admin membership through a trusted server/database administration path. Do not add a public “make me admin” button or expose the service-role secret.
