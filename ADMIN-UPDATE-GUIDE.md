# Phase 3 admin update upload guide

1. Upload the contents of the Phase 3 ZIP to the root of the `main` branch in `Ratanbharati/BrandMediaCollab`, preserving `app/api`, `public/site`, and `supabase/migrations` paths.
2. Confirm Vercel builds the `main` branch and Production deployment is Ready.
3. Keep `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), and `STAGERANG_ADMIN_EMAIL` configured in Vercel. Set the owner email privately; never commit it or upload the real service-role key to GitHub.
4. The Phase 3 migrations have already been applied to the connected production Supabase project. If deploying to a different project, apply all four Phase 3 migrations in version order before deployment.
5. Open `/site/admin-dashboard.html` and sign in with the existing owner account. Admin access is checked by the server; there is no admin signup or hard-coded password.

The ZIP contains code and migration files only. It does not contain login credentials and does not push to GitHub or deploy to Vercel.
