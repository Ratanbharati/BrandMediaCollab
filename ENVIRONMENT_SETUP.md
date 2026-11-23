# Environment setup

The project reads these variables. Names and historical naming are preserved from the source; `STAGERANG_ADMIN_EMAIL` is still the configured variable name even though the product brand is now Brand Media Collab.

| Variable | Required use | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public browser configuration; not a secret. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key | Public browser configuration; database safety must come from RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged admin API operations | Secret. Never use in client code, `NEXT_PUBLIC_*`, screenshots, or ZIPs. |
| `STAGERANG_ADMIN_EMAIL` | Exact verified owner email for the controlled first-admin bootstrap | Server configuration; not a password. Keep it limited to the intended project. |

## Local development

1. Copy `.env.example` to `.env.local` in the repository root.
2. Replace placeholders with values from the correct Supabase project.
3. Confirm `.env.local` is ignored by Git (`.gitignore`).
4. Restart `pnpm dev` after changing variables.

## Vercel

Add the same variable names in Vercel Project Settings → Environment Variables for the appropriate Development, Preview, and Production environments. Use a service key only where admin APIs require it; never expose it to browser bundles. Redeploy after changes. Ensure preview deployments use a non-production Supabase project when possible.

## Supabase Auth configuration

Set the Supabase Site URL to the actual production domain, then allow only the callback/reset URLs needed for local development, preview, and production. Configure email/password and provider delivery according to the owner’s account. Email delivery and verification behavior cannot be determined from this file alone.

## Secret handling

- Do not commit `.env.local` or copy real values into `.env.example`.
- Rotate any secret accidentally pasted into chat, committed, or placed in a public file.
- A publishable key is not a substitute for RLS. A service-role key bypasses RLS and belongs only in trusted server runtime.
- GTM container ID `GTM-N843Z826` is a public tracking identifier embedded in page source, not a Supabase secret. Analytics behavior still needs verification in GTM/GA4.
