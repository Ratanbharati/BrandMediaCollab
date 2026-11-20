# Brand Media Collab — Supabase connection

This project is a Next.js site that displays the interface from `/public/site`.
Connected Supabase features: signup/login, profile basics, profile photo upload, own-project create/edit/delete/list, live open-project feed, project discovery, and one-at-a-time interest applications. First-time profile completion opens the account's profile; later logins open the feed. Demo cards are removed from the live feed and project directory.

Still to connect before treating the whole platform as operational: conversations/messages and group outreach, meetings and calendar reminders, email invitations, social-provider follower syncing, richer dashboards, profile portfolio/social links, and admin tools. The current UI for those areas may still be a prototype. Do not invite real users based on those unfinished areas.

## Supabase setup

1. In Supabase **SQL Editor**, run `supabase/migrations/202611150001_initial_schema.sql` once. It creates empty tables and Row Level Security policies.
2. If the initial schema is already installed, run `supabase/migrations/202611150002_avatar_storage.sql` once to add the avatar column, public avatar bucket, and owner-only upload/delete policies.
3. In Supabase **Settings → API Keys**, use the `sb_publishable_...` key. Never use the secret key in the browser or Vercel `NEXT_PUBLIC_` variables.
4. Configure Supabase **Authentication → URL Configuration**. Set the Site URL to your Vercel domain and add that domain's `/site/**` redirect URL. For local testing, add `http://localhost:3000/site/**`.

## Vercel environment variables

Add these under the Vercel project → **Environment Variables**. Select Production and Preview (and Development if shown):

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL, e.g. `https://your-project-ref.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_...` key

Redeploy after changing environment variables or the GitHub source. Do not add a Supabase secret/service-role key to this frontend project.

## Uploading the project to GitHub

Extract this ZIP on your computer. Upload its contents into the GitHub app directory configured as Vercel's Root Directory (for this account's existing repository upload, that directory is `brand-media-collab-supabase-ready`). Inside that directory, `app`, `public`, `supabase`, and `package.json` must sit directly together. Do not create a second nested `brand-media-collab-supabase-ready` directory. Commit the changes to `main`; Vercel should deploy from the connected repository.

## First account and admin access

Sign-up may require email confirmation depending on the Supabase Auth setting. Confirm the email, log in, and finish the profile. The SQL migration does not create an admin account. Platform admin membership must be provisioned securely after the first account is created; never grant admin by a browser form or expose a service-role key.

## Data protection notes

The migration enables RLS on the application tables. Private contacts are only selectable by that account and platform admins. Public profile data is visible to authenticated users when discoverable. Keep social tokens and any future service-role key server-side. Review the policies and auth email settings before inviting real users.
