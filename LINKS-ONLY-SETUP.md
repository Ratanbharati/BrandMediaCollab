# BMC public profile links only

This version collects public Instagram, YouTube, website, and other profile URLs. It does **not** ask members to sign in to Instagram or Google and does **not** fetch follower counts or analytics.

## Supabase

Run `supabase/link-only-social-profiles.sql` once in the BMC project's Supabase SQL Editor. It ensures the website/social link columns and table are present and allows a member to manage their own links. Other signed-in members can read social links only when the profile is discoverable, subject to profile blocks.

## What a member does

1. Sign in to BMC and open **My Profile → Edit Profile**.
2. Enter a website URL in **Website link** if they have one.
3. Under **Social accounts**, choose **Add link** beside Instagram or YouTube.
4. Paste the full public URL, for example `https://www.instagram.com/yourname/` or `https://www.youtube.com/@yourchannel`.
5. Save the profile.
6. Turn on profile discoverability in Settings if they want other members to find and view the profile.

The website address is saved to `public.profiles.website_url`. Instagram, YouTube, and other social URLs are saved as rows in `public.social_accounts` with `user_id`, `platform`, and `profile_url`. The public member profile loads those saved URLs and displays them as links.

## Upload

Extract the companion link-only ZIP into the repository root, keeping the folder structure. Upload/commit the extracted files to GitHub and deploy a preview. Do not run the separate OAuth migration from an earlier package for this link-only flow.
