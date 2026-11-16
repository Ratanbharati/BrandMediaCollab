# Stagerang upload guide

## Before upload

- This ZIP is for the existing GitHub repository `Ratanbharati/BrandMediaCollab`.
- In Vercel → Project Settings → Build and Deployment → Root Directory, leave the field empty. Do not enter `\`, `\.`, `./`, or a subfolder.
- Do not change DNS or Resend records for this code upload. Run the one new notification migration below before testing dashboard alerts.

## Upload the package to GitHub

1. Download and extract `Stagerang-Update-Nov16.zip`.
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
5. Open `https://www.stagerang.com` in a private/incognito window (or use Ctrl+Shift+R). Confirm **Log in** and **Join now** appear in the landing-page header; open each to verify the login/signup form. Sign in with the existing test accounts and confirm a new interest appears in the owner's dashboard and Messages.
6. On Home, confirm posts are directly below the composer, switch between **Brand projects** and **Creator ideas**, and check the right side for real activity and notifications. The old sample conversation should no longer appear.
7. On Projects, switch tabs and confirm brand campaigns and creator ideas stay in their matching tab. Tab totals count currently open posts by post type. Sidebar totals are account-specific: My projects counts posts owned by this account; My applications counts distinct projects this account applied to; Saved projects counts distinct saved projects; Creator ideas counts currently open ideas. Application and saved counts may include closed posts, so they need not equal the open-post totals. Counts refresh every 30 seconds and immediately after save/interest actions. Test the search, category, tier, platform, and location filters.
8. On Messages, confirm the compact **Project snapshot** appears above the conversation list, choose a project, and check its live Interests, Chats, Messages, and Unread totals. The conversation list and selected conversation should show the project name.

## One safe Supabase update (do not rerun the initial schema)

1. On GitHub, after uploading this package, open `supabase/migrations/202611160001_activity_notifications.sql` and copy its full contents.
2. Supabase → SQL Editor → New query. Paste the copied SQL and click **Run** once. This adds an in-app notification table and triggers without deleting existing account, project, application, or message rows.
3. The SQL Editor should report success. If it reports an error, stop and share the error; do not rerun the initial schema.

## Supabase settings to verify

1. Keep the existing tables and user rows. This package does not require dropping tables or deleting accounts.
2. In Authentication → URL Configuration, Site URL should be `https://www.stagerang.com` (or the site's chosen canonical domain). Allow the site's `/site/**` callback URL and any required Vercel preview callback URL.
3. Also add this exact recovery callback to Redirect URLs: `https://www.stagerang.com/site/update-password.html`. If you use the apex domain instead, add its matching callback too. Save the URL Configuration.
4. Existing Resend SMTP sender/domain setup is independent of this upload. Keep it as configured; verify password recovery with a test account after deployment.
5. Profile rows remain in `profiles`; posts belong to their author in `projects`; responses to posts live separately in `applications` with `project_id` and `applicant_id`; private chats/messages remain in `conversations`, `conversation_members`, and `messages`. In-app alerts are in `notifications`.

## Test password reset after deployment

1. Open the site's login dialog and choose **Log in**.
2. Enter the account email and click **Forgot password?**.
3. Check the inbox and spam folder for the recovery email and follow its link.
4. On the Stagerang page, choose and confirm a new password of at least 8 characters, save it, then log in with it.
5. If no email arrives, check Supabase Authentication → Logs and verify SMTP and the allowed callback URL.

## What the updated flow does

- An interested person adds a note; the application is saved and a private project conversation starts immediately for both people.
- Home shows database-backed posts under the composer, separated into Brand projects and Creator ideas. Its right sidebar shows account activity totals and in-app notifications; the Messages navigation badge counts unread message alerts.
- The dashboard separates posts owned by the signed-in account from applications that account sent to others' posts.
- Project owners can review each response, update its status, open that person's chat, or send the same message privately to all interested people (each receives an individual message, not a group chat).
- Dashboard notifications are in-app only and need the migration above. Email/push alerts, group chats, calendar invitations/reminders, social OAuth/follower syncing, and a complete admin workflow are not included yet.
- Search filters live projects and creator ideas from Supabase. Preview/sample cards are hidden while live content loads.
