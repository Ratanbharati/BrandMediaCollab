# Stagerang — deployment and remaining setup

This is the full Next.js project. It serves the static site pages from `/public/site` and exposes the Supabase public configuration through `/api/supabase-config`.

## Connected features in this package

- Email/password signup and login through Supabase Auth.
- Forgot-password email and secure new-password page using Supabase Auth recovery links.
- Per-user profiles, profile editing, profile photo upload, and private contact record.
- Create, edit, list, and delete your own projects.
- Shared open-project feed and project discovery backed by Supabase.
- Express interest with a private note; the application is saved and a one-to-one project conversation starts immediately.
- Separate dashboard reports for projects this account posted and applications this account sent to other members' projects.
- Applicant review from each owned post, including status updates and individual chat links.
- Project-wide bulk updates delivered as separate private messages to each interested person.
- In-app notifications for received interest, application status changes, and new project messages (after running the added notification migration).
- Supabase-backed project discovery and search; the sample preview cards are hidden while live records load.
- Individual messages stored in Supabase and refreshed periodically.

## Still not complete

- Group chats (bulk updates are private one-to-one sends).
- Email or browser push notifications. Current alerts are in-app only.
- Read receipts/unread indicators and realtime messaging (messages refresh by polling).
- Calendar integration, invitations, and automated reminders.
- Social OAuth and follower-count syncing.
- Complete admin dashboard and production hardening/security review.

This remains a study project/prototype. Do not treat unfinished features as implemented just because an old screen mockup displays them.

## Supabase setup

1. Keep the existing tables and user data. Do not rerun the initial schema or avatar migration if they are already installed.
2. In Supabase **SQL Editor**, run only the new file `supabase/migrations/202611160001_activity_notifications.sql`. This adds private in-app notifications and database triggers; it does not delete or recreate data.
3. In Supabase **Settings → API Keys**, use the `sb_publishable_...` key. Never use the secret key in the browser or Vercel `NEXT_PUBLIC_` variables.
4. Keep Supabase **Authentication → URL Configuration** set to the canonical site URL and retain the recovery redirect `https://www.stagerang.com/site/update-password.html` and the site's `/site/**` redirect URL.

## Vercel environment variables

Add these under the Vercel project → **Environment Variables**. Select Production and Preview (and Development if shown):

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL, e.g. `https://your-project-ref.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_...` key

Redeploy after changing environment variables or the GitHub source. Do not add a Supabase secret/service-role key to this frontend project.

## Uploading this package to the connected GitHub repository

Vercel's Root Directory must be empty because this package's `app`, `public`, `supabase`, and `package.json` are at the repository root.

1. Extract this ZIP on your computer.
2. In `Ratanbharati/BrandMediaCollab` on GitHub, use **Add file → Upload files**.
3. Upload/replace the package contents at the repository root. The repository root should directly contain `app`, `public`, `supabase`, `package.json`, `tsconfig.json`, and `README-DEPLOY.md`—do not upload a containing folder as a new nested directory.
4. Commit the changes to `main`.
5. In Vercel, wait for the `main` deployment to become **Ready** and **Production**. Check the deployment commit hash matches the new GitHub commit.

See `UPLOAD-GUIDE.md` for the plain-language, screenshot-oriented sequence and the settings to verify after upload.

## First account and admin access

Sign-up may require email confirmation depending on the Supabase Auth setting. Confirm the email, log in, and finish the profile. The SQL migration does not create an admin account. Platform admin membership must be provisioned securely after the first account is created; never grant admin by a browser form or expose a service-role key.

## Data protection notes

The migrations enable RLS on the application tables. Private contacts are only selectable by that account and platform admins. Public profile data is visible to authenticated users when discoverable. Keep social tokens and any future service-role key server-side. Interest notes are visible to the application parties; chat messages are visible only to conversation members.
