# Brand Media Collab — Supabase connection

This project is a Next.js site that currently displays the existing HTML prototype in `/public/site`.
The Supabase integration in this package connects **sign up / log in, profile save, and create/edit/delete/list your own projects**. Other areas (project discovery, applications, messaging, meetings, social metrics syncing, and admin dashboards) remain prototype screens and are not yet connected to database records.

## Supabase setup

1. In Supabase **SQL Editor**, run `supabase/migrations/202611150001_initial_schema.sql` once. It creates empty tables and Row Level Security policies.
2. In Supabase **Settings → API Keys**, use the `sb_publishable_...` key. Never use the secret key in the browser or Vercel `NEXT_PUBLIC_` variables.
3. Configure Supabase **Authentication → URL Configuration**. Set the Site URL to your Vercel domain and add that domain's `/site/**` redirect URL. For local testing, add `http://localhost:3000/site/**`.

## Vercel environment variables

Add these under the Vercel project → **Environment Variables**. Select Production and Preview (and Development if shown):

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL, e.g. `https://your-project-ref.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_...` key

Redeploy after changing environment variables or the GitHub source. Do not add a Supabase secret/service-role key to this frontend project.

## Uploading the project to GitHub

Extract this ZIP on your computer. Open the extracted folder and upload its **contents** to the root of the GitHub repository (so `app`, `public`, `supabase`, and `package.json` appear at the repository root). Do not upload only the ZIP file. Commit the changes to `main`; Vercel should deploy from the connected repository.

## First account and admin access

Sign-up may require email confirmation depending on the Supabase Auth setting. Confirm the email, log in, and finish the profile. The SQL migration does not create an admin account. Platform admin membership must be provisioned securely after the first account is created; never grant admin by a browser form or expose a service-role key.

## Data protection notes

The migration enables RLS on the application tables. Private contacts are only selectable by that account and platform admins. Public profile data is visible to authenticated users when discoverable. Keep social tokens and any future service-role key server-side. Review the policies and auth email settings before inviting real users.
