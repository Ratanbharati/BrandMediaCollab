# Stagerang upload guide

## Before upload

- This ZIP is for the existing GitHub repository `Ratanbharati/BrandMediaCollab`.
- In Vercel → Project Settings → Build and Deployment → Root Directory, leave the field empty. Do not enter `\`, `\.`, `./`, or a subfolder.
- Do not change DNS, Resend records, or Supabase tables for this code upload.

## Upload the package to GitHub

1. Download and extract `Stagerang-Supabase-Ready.zip`.
2. Open the extracted folder. You should immediately see `app`, `public`, `supabase`, `package.json`, `tsconfig.json`, `README-DEPLOY.md`, and this guide.
3. Open GitHub → `Ratanbharati/BrandMediaCollab` → branch `main`.
4. Choose **Add file → Upload files**.
5. Select the contents inside the extracted folder. Upload them to the repository root, allowing GitHub to replace same-named files. Do not upload the outer folder itself and do not put these files inside `brand-media-collab-supabase-ready`.
6. Commit the upload directly to `main`.

## After upload: verify Vercel

1. In Vercel → `brand-media-collab` → Deployments, wait for the deployment from the new Git commit to say **Ready** and show the blue **Production** badge.
2. If build fails, open that deployment → Build Logs and use the first error line to diagnose. Do not repeatedly redeploy an unchanged failed build.
3. In Project Settings → Build and Deployment, Root Directory must remain empty. If the setting was changed, save it and make one fresh deployment from the latest `main` commit.
4. In Project Settings → Environment Variables, confirm Production has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never put a Supabase secret/service-role key in these variables.
5. Open `https://www.stagerang.com` in a private/incognito window and sign in with the existing test accounts. Confirm profile, feed, project creation, dashboard, and accepted-collaboration messaging behavior.

## Supabase settings to verify (do not rerun the schema)

1. Keep the existing tables and user rows. This package does not require dropping tables or deleting accounts.
2. In Authentication → URL Configuration, Site URL should be `https://www.stagerang.com` (or the site's chosen canonical domain). Allow the site's `/site/**` callback URL and any required Vercel preview callback URL.
3. Existing Resend SMTP sender/domain setup is independent of this upload. Keep it as configured; verify email confirmation with a new test address after deployment.
4. Authenticated profile and project rows live in `profiles` and `projects`; applications in `applications`; conversation threads/messages in `conversations`, `conversation_members`, and `messages`.

## Current limitations

Dashboard counts and project rows read Supabase. Individual conversation messages are stored in Supabase and the page refreshes the open conversation periodically. A chat can be started from an accepted (`working_together`) application. Group chats, bulk outreach, full read receipts, calendar invitations/reminders, social OAuth/follower syncing, and a complete admin workflow are not included yet. Do not interpret static old mockup screens as real records or working features.
