# Stagerang — deployment and remaining setup

This is the full Next.js project. It serves the static site pages from `/public/site` and exposes the Supabase public configuration through `/api/supabase-config`.

## Connected features in this package

- Email/password signup and login through Supabase Auth.
- Forgot-password email and secure new-password page using Supabase Auth recovery links.
- Per-user profiles, profile editing, profile photo upload, and private contact record.
- Create, edit, list, and delete your own projects.
- Shared open-project feed and project discovery backed by Supabase.
- Express interest in an open project and view applications for your projects.
- Dashboard project/application counts backed by the signed-in user's rows.
- Individual messages stored in Supabase for accepted collaborations; conversation list refreshes periodically.

## Still not complete

- Group chats and bulk campaign outreach.
- In-app accept/reject workflow UI for project applications (status changes may need admin/SQL until that UI is added).
- Read receipts/unread indicators and realtime messaging (messages refresh by polling).
- Calendar integration, invitations, and automated reminders.
- Social OAuth and follower-count syncing.
- Complete admin dashboard and production hardening/security review.

This remains a study project/prototype. Do not treat unfinished features as implemented just because an old screen mockup displays them.

## Supabase setup

1. In Supabase **SQL Editor**, run `supabase/migrations/202611150001_initial_schema.sql` once. It creates empty tables and Row Level Security policies.
2. If the initial schema is already installed, run `supabase/migrations/202611150002_avatar_storage.sql` once to add the avatar column, public avatar bucket, and owner-only upload/delete policies.
3. In Supabase **Settings → API Keys**, use the `sb_publishable_...` key. Never use the secret key in the browser or Vercel `NEXT_PUBLIC_` variables.
4. Configure Supabase **Authentication → URL Configuration**. Set the Site URL to your canonical site URL, add `https://www.stagerang.com/site/update-password.html` as an allowed redirect URL, and retain the site's `/site/**` redirect URL. For local testing, add `http://localhost:3000/site/**`.

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

The migration enables RLS on the application tables. Private contacts are only selectable by that account and platform admins. Public profile data is visible to authenticated users when discoverable. Keep social tokens and any future service-role key server-side. Review the policies and auth email settings before inviting real users.
