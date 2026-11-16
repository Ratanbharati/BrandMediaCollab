# Stagerang update package

This package corrects the live source for the landing-page account links, Projects page, live counts, and Messages project snapshot. The files are arranged for the repository root used by Vercel.

## Upload to GitHub

1. Extract this ZIP. The extracted folder should contain `app`, `public`, `supabase`, `package.json`, and this guide at its top level.
2. Open the existing `Ratanbharati/BrandMediaCollab` repository on the `main` branch.
3. Choose **Add file → Upload files** and upload the extracted folder’s contents into the repository root. Do not place them inside `brand-media-collab-supabase-ready` or another subfolder.
4. Commit the files to `main`. In Vercel, check that the project is linked to this repository and that a deployment for the new commit reaches **Ready** and **Production**. A deployment for an older commit will keep showing the old site.
5. Open `https://www.stagerang.com` and hard-refresh with **Ctrl+Shift+R**.

## Apply the safe Supabase policy update

This package adds one migration: `supabase/migrations/202611170001_saved_projects_visibility.sql`.

1. Open that exact file in GitHub after upload and copy all its SQL.
2. In Supabase, open **SQL Editor → New query**, paste it, and click **Run** once.
3. Do not rerun the initial schema or delete any tables. This update keeps public discovery limited to open posts and permits each account to view posts it saved, even if those posts later close.

## Check the results

- Landing page: **Log in** and **Join now** are visible in the header.
- Projects: **Brand projects** contains brand campaigns; **Creator ideas** contains creator posts. Search and the category, creator-tier, platform, and location filters apply to the selected tab and account scope.
- Left counts are loaded from Supabase: own posts, distinct projects applied to, distinct saved projects, and currently open creator ideas. The tab totals show currently open posts of each type. Counts refresh every 30 seconds and after save/interest actions.
- Sidebar **My applications** and **Saved projects** show the matching rows instead of sample counts. A saved or applied closed post remains available after the SQL update above.
- Messages: the compact **Project snapshot** shows per-project interests, chats, messages, and unread-message notifications. The thread list and conversation contents come from Supabase.

If a Supabase query fails, the Projects page displays the actual error instead of redirecting away or silently using sample content. Share that message and the Vercel deployment commit if anything still looks old.

## Scope

This update fixes the behaviors listed above. It does not add social-network follower syncing, external calendar integrations, or email/push notifications. In-app unread counts rely on the existing activity-notifications migration and the `notifications` table.
