# Stagerang deployment notes

This repository serves the production site from `public/site`. Vercel should deploy from the repository root with the Root Directory setting left empty.

## Current workflow behavior

- Home and Projects divide posts consistently into Brand projects, Creator ideas, and Agency projects using the posting account type and saved project type.
- Projects search, filters, owned/applied/saved scopes, and live counts use Supabase.
- Dashboard separates owned Brand projects, Creator ideas, and Agency projects from applications this account sent to other members. The date range affects all four tables and their totals.
- Messages shows a project activity summary derived from Supabase applications, conversations, messages, and unread notifications.
- Signup/login, password recovery, profiles, project posting, and private project conversations use the connected Supabase project.
- Profile editing is locked to the signed-in user’s saved account type.

## Deployment

Upload the contents of the project folder to the connected GitHub repository root, commit to `main`, and wait until the newest Vercel deployment shows **Ready** and **Production**. Afterward, hard-refresh `https://www.stagerang.com` with **Ctrl+Shift+R**.

Keep existing Supabase tables and user data. No new SQL is required for the workflow changes in this update. If the prior activity notifications or saved-project visibility migrations have not been applied, run each applicable migration once in Supabase SQL Editor. Do not rerun the initial schema on a database that already has accounts or data. Never put a Supabase service-role key in browser settings.

## Current integration limits

Notifications are in-app, and Messages refreshes periodically rather than using push delivery. Social account authorization/follower syncing and automatic calendar integration are not part of this update.
