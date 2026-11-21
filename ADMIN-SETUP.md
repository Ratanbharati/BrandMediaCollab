# Stagerang owner console setup

The owner console is served at `/site/admin-dashboard.html`. It uses the owner’s existing Stagerang Supabase Auth account. Admin authorization is checked by the server against `public.platform_admins`; public signup cannot assign this role.

This package does not include an owner email, password, or admin membership record. Configure the verified owner's email through a private environment setting and grant membership only through the trusted bootstrap/database procedure described below.

## Required Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never add the `NEXT_PUBLIC_` prefix or include the value in frontend files.
- `STAGERANG_ADMIN_EMAIL=owner@example.com` — replace the placeholder privately with the exact verified owner email; used only for tightly controlled first-owner bootstrap if the admin table is empty.

After changing Vercel environment variables, redeploy the application. This task does not publish or deploy the repository.

## Database migration

The migrations add moderation/report/verification tables, profile verification and project moderation fields, account suspension gates for database and storage access, minimal admin-only directory/metrics views, and indexes. The package does not assume migrations are applied in any Supabase project. Check that project's migration history and schema, then apply only missing migrations in version order. The Vercel deployment must include the matching API code before using these tables.

## Admin features

- Live aggregate counts for six account types, active users in the last 30 days, projects, applications, collaborations, connections, reports, verification, suspensions, support, and audit actions.
- Server-paginated user directory with search, account type/status filters, profile details, completion percentage, projects count, verification state, and reversible visibility/suspension controls.
- Project visibility moderation, report review, verification decisions, support status, and an audit log.
- Profile/project reports and member verification-request forms create records using the signed-in member’s own session and database policies.
- Private contact fields, credentials, tokens, Auth metadata, and message bodies are not returned to the admin console.
- Permanent account deletion is intentionally unavailable from this dashboard.

## Sign in

1. Open `https://www.brandmediacollab.com/site/admin-dashboard.html` after the new code is uploaded and deployed.
2. Sign in with the existing owner account. The server checks membership before showing the console data.
3. If login succeeds but admin access is denied, confirm this account is present in `public.platform_admins` and verify the Vercel server-only environment variables. Do not add a frontend “make admin” action or share the service-role key.

The owner password is not stored in this code bundle. Use the existing account or the Supabase password-recovery flow.
