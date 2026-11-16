# Upload the Stagerang admin console

This is an admin-only update. It adds a protected owner console at `/site/admin-dashboard.html` and its server API. It does not add or require a SQL migration.

## Upload to GitHub

Extract the ZIP. Upload the files and folders inside it to the root of `Ratanbharati/BrandMediaCollab` on the `main` branch, keeping the `app/api/admin` and `public/site` folder paths intact. Commit the changes and wait for Vercel’s newest Production deployment to show **Ready**.

## One-time Vercel configuration

Open Vercel → Project → **Settings → Environment Variables**. Add:

- `STAGERANG_ADMIN_EMAIL`: the owner account’s exact verified sign-in email.
- `SUPABASE_SERVICE_ROLE_KEY`: the connected project’s service-role secret. Keep it server-only; never prefix it with `NEXT_PUBLIC_`.

Keep the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Redeploy after saving the variables.

## Sign in and manage Stagerang

Open `https://www.stagerang.com/site/admin-dashboard.html` and sign in with the verified owner account. If `platform_admins` is empty, the first sign-in automatically adds the configured owner. No SQL needs to be run. After setup, use the website console for routine administration; Supabase is not needed to browse accounts and activity.

The console shows account/profile records, projects, applications, support requests, and admin actions. You can hide/show a profile or permanently delete a test account after typing its exact email and confirming. Deletion removes the Auth account and linked rows according to the existing cascade rules. Do not delete accounts containing real user data. Private message bodies are intentionally excluded.

If the owner is not admitted, check that the deployment has the exact verified owner email configured. If `platform_admins` already has an admin, that existing admin must grant access; the first-owner bootstrap only runs when the table is empty.
