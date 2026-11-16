# Stagerang workflow update package

This update fixes the Home, Projects, Dashboard, Messages, and profile-edit workflows. The live site changes only after the files are uploaded to GitHub, committed, and deployed by Vercel.

## Upload the update

1. Extract this ZIP. At the top level you should see `app`, `public`, `supabase`, `package.json`, and this guide.
2. Open `Ratanbharati/BrandMediaCollab` on GitHub and select the `main` branch.
3. Use **Add file → Upload files** and upload the extracted folder’s contents into the repository root. Don’t put them inside another folder.
4. Commit the changes to `main`. In Vercel, wait for the newest deployment to show **Ready** and **Production**.
5. Open `https://www.stagerang.com` and hard refresh with **Ctrl+Shift+R**.

The Agency account journey and the files that implement each step are listed in `AGENCY-WORKFLOW.md`.

No new SQL migration is required for these workflow changes. Keep all existing Supabase tables and user data. The project notification panel needs `202611160001_activity_notifications.sql`, and the saved-project visibility update is `202611170001_saved_projects_visibility.sql`. If either has not yet been run successfully, run that exact migration once in Supabase SQL Editor. Do not rerun a migration that already succeeded, and never rerun the initial schema on a project that contains your account data.

## What changed

- **Home and Projects** now use the same post grouping rule: Agency account posts appear under Agency projects; Creator account posts appear under Creator ideas; Brand account posts appear under Brand projects. The Projects page has all three tabs and the matching Agency sidebar count. Search and category, creator-tier, platform, location, scope, saved, and application filters apply to the selected type.
- **Dashboard** no longer shows an account-type selector. It has separate Brand projects, Creator ideas, and Agency projects tables, plus a distinct Applications sent table. Tables and summaries use live Supabase rows; the date range filters each table and recalculates its totals. The calendar presets use the current local date.
- **Messages** project snapshot counts use this account’s projects and applications, conversations, messages, and unread-message notifications. It refreshes every 20 seconds. An application withdrawn by the account is excluded from active interest totals.
- **Profile editing** opens the signed-in user’s existing account type and hides the type switcher. A Creator account opens the Creator profile form; Brand and Agency accounts open their respective forms. The old `edit-profile.html` address redirects to the locked editor.
- **Profile navigation** now sends the Home identity card to the signed-in user’s live profile. Clicking a member name on a project still opens that project owner’s live profile. This link correction requires no SQL change.
- **Agency workflow** labels agency campaigns distinctly on the post form and in My projects. Agency posts are grouped on Home and Projects, reported in their own Dashboard table, and support applicant review, private chats, and individual delivery of bulk messages.

If data still looks old after deployment, check that the production deployment used the newest Git commit. If a page shows a Supabase error, share the exact message and the deployment commit so the failing query or policy can be identified.
