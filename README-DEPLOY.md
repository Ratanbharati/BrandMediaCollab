# Stagerang deployment notes

This is the full Next.js project for `Ratanbharati/BrandMediaCollab`. It serves the site from `public/site` and uses the Supabase public project URL and publishable key.

## Included in this update

- Supabase signup, login, password recovery, profiles, and project posting.
- Live Home feed posts directly below the composer, split into **Brand projects** and **Creator ideas**. The list refreshes periodically.
- Home activity totals and notification list backed by Supabase.
- Projects discovery keeps Brand projects and Creator ideas separate; account-specific application and saved-project counts and filters update from Supabase.
- Messages has a project activity summary with application, chat, message, and unread-alert counts that refresh periodically.
- Expressing interest saves an application note and starts a private project conversation.
- Project posts and applications remain separate records; messages are stored in `messages`.
- Unread message alerts appear on the Messages navigation item.
- Dashboard rows and messages are read from Supabase rather than demo cards.

## Upload

Upload the contents of this project folder to the root of the connected GitHub repository, commit to `main`, and wait for Vercel to deploy. Keep Vercel Root Directory empty. Confirm the current production environment has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never expose a service-role key in browser settings.

## Supabase update

Keep existing user and table data. Do not rerun the initial schema. If it has not already been run successfully, execute `supabase/migrations/202611160001_activity_notifications.sql` once in Supabase SQL Editor. It creates private in-app notifications and activity triggers. If it already succeeded, do not run it again.

## Current limits

Notifications are in-app only. Message updates use periodic refresh, not realtime push. Group chats, calendar integration, social account authorization, and follower syncing are not included.
