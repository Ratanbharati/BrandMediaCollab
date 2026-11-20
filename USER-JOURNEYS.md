# Stagerang account journeys and UI acceptance checklist

This document describes what a member should click, what the page should show, and what data should persist. Use it to review the deployed website with separate test accounts for Creator, Brand, and Agency. A passing screen means the real account data changed in Supabase and is still visible after sign-out/sign-in; a toast or a temporary browser-only change is not enough.

```mermaid
flowchart TD
    A[Landing page] --> B[Join now or Log in]
    B --> C[Choose Creator, Brand, or Agency]
    C --> D[Confirm email]
    D --> E[Complete matching profile]
    E --> F[Home: role-specific feed and activity]
    F --> G[Projects: Brand projects]
    F --> H[Projects: Creator ideas]
    F --> I[Projects: Agency projects]
    G --> J[Show interest with a note]
    I --> J
    H --> K[Brand or Agency shows interest]
    J --> L[My applications and project chat]
    K --> M[Owner dashboard: review responses]
    L --> N[Messages: continue private project conversation]
    M --> N
    E --> O[Post matching the account type]
    O --> P[My projects and matching feed tab]
    P --> Q[Dashboard counts and activity]
    N --> Q
    Q --> R[Log out, log in, and verify saved live records]
```

## Shared start: new account and every later login

1. Open `https://www.stagerang.com`. The landing page shows **Log in** and **Join now**.
2. Click **Join now**. Choose one account type: **Creator / Influencer**, **Brand**, or **Agency**. Enter name, email, and password, then submit.
3. Confirm the email using the link delivered to that address. The confirmation link returns to Stagerang profile setup.
4. Complete and save the profile. The selected account type and account owner must be saved to the signed-in user’s record.
5. Continue to Home. The header should show the same account name and correct type.
6. Use **Log out**, then log back in with the same email and password. The correct profile, account type, posts, applications, saved items, messages, and activity must return. A member must never see another test account’s identity or private data.
7. If the password is forgotten, use **Forgot password**, open the reset email, set a new password, and sign in. The reset must return to Stagerang and preserve the account.

## Creator / Influencer journey

1. **Profile:** choose Creator / Influencer at signup. Fill the Creator profile, location, content categories, languages, bio, and available portfolio/social details. Save. **My profile** shows this Creator; **Edit profile** edits only this account and must not offer a switch to Brand or Agency.
2. **Browse:** on **Home**, open **Brand projects** or **Agency projects**. On **Projects**, those are separate tabs. Search and filters narrow the selected type; the displayed count matches visible live posts.
3. **Review a post:** open a Brand or Agency opportunity and inspect the project owner, brief, category, platform, deadline, delivery date, budget/compensation, and usage terms before applying.
4. **Show interest:** click **Interested**, add a short note, and submit. The application appears once under **My applications** with the correct post, owner, status, and note. The post owner can see the same application.
5. **Communicate:** use the project-linked chat when available. The other party’s reply appears in that same conversation after refresh and later login. Unread counts and activity relate to this conversation and post.
6. **Post an idea:** use **Post a project or idea**, choose **Creator collaboration idea**, enter the idea/brief and timing, then save. It appears under **My projects** and **Creator ideas**, not Brand projects or Agency projects. Brand/Agency members can discover the idea and express interest.
7. **Dashboard:** check Creator ideas owned by this account separately from Brand projects, Agency projects, and applications sent to other members’ posts. Date range changes the rows and totals together.

## Brand journey

1. **Profile:** choose Brand at signup. Enter the brand/company name, location, category, bio, and requested brand details. Save. **My profile** and **Edit profile** stay on this Brand account.
2. **Post:** click **Post a project or idea** and create a **Brand campaign**. Add project name, category, location/market, brief, application close date, delivery date, deliverables and optional budget, Creator tiers, platforms, usage/advertising terms, and status. Save as **Open** to publish.
3. **Verify placement:** the post appears under **Brand projects** on Home and Projects and under this Brand’s **My projects**. A Draft should stay private to its owner; a paused/closed post should no longer be an open discovery opportunity.
4. **Review:** open the Brand project’s responses or the Brand projects area in **Dashboard**. Each interested Creator, note, status, and application count must match the real application rows.
5. **Collaborate:** open a private conversation tied to the specific campaign and Creator. Send a reply, revisit the conversation, and confirm the message remains there. Bulk campaign updates should be delivered as separate one-to-one messages to selected interested Creators, not as a public/group leak.
6. **Dashboard:** Brand project performance is separate from Creator ideas, Agency projects, and applications this Brand sent to other people’s posts. The date range recalculates each table and summary.

## Agency journey

1. **Profile:** choose Agency at signup. Enter agency/company name, agency type, location, bio, and requested details. Save. **My profile** and **Edit profile** stay on this Agency account.
2. **Post:** click **Post a project or idea** and create an **Agency campaign**. Add project name, category, location, brief, deadlines, deliverables/budget, Creator tiers, platforms, and usage terms. Save as **Open** to publish.
3. **Verify placement:** the post appears under **Agency projects** on Home and Projects and under this Agency’s **My projects**. It must not be mixed into Brand projects or Creator ideas.
4. **Review:** the Agency projects area in **Dashboard** shows this Agency’s campaigns, interested Creators, notes, statuses, and matching totals.
5. **Collaborate:** open a conversation for the selected campaign and Creator. Replies persist in that conversation. Send campaign updates individually to interested members; confirm the activity is connected to the correct Agency project.
6. **Dashboard:** Agency projects are their own table, separate from Brand projects, Creator ideas, and applications sent. Date filters update rows and counts consistently.

## Shared navigation and expected behavior

- **Home:** the signed-in member’s own identity/profile card, current live posts grouped by the owner’s saved account type, and relevant recent activity. Brand projects show only Brand-owned posts, Creator ideas only Creator-owned posts, and Agency projects only Agency-owned posts.
- **Projects:** the same strict separation applies to all three tabs. Selecting one tab must hide cards belonging to the other two types; counts must match the live Open posts in that selected category. Search/filter affects the current tab; **My applications**, **Saved projects**, and **My projects** show only the signed-in account’s records.
- **Dashboard:** separate tables for Brand projects, Creator ideas, Agency projects, and applications sent. Each displayed count is derived from actual records, not sample totals.
- **Messages:** each conversation names the other member and linked project/idea. Sending and receiving messages persists. New unread messages update the message badge and project activity count.
- **Profile privacy:** public profile details are visible as intended, while email, phone, and private contact data remain private unless the member chooses to share them.

## Acceptance run before calling a role complete

Use one test account for each role and keep a small expected-results list. For every role: create/sign in; save its profile; post one item; confirm it appears in its matching tab; select each of the other two tabs and confirm the card disappears; confirm the three tab counts match their Open posts; use another role to show interest with a note; confirm both accounts see the matching application; open the correct private conversation; exchange a message; verify unread state and dashboard/activity counts; sign out and back in; confirm all records persist and stay associated with the right accounts. Repeat once for a Creator idea and once for an Agency campaign.

If a button only shows a sample card, preview toast, or browser-only change, record it as not connected and do not count it as complete. Share the exact page, click, expected result, and actual result when reporting a failure.

## Known scope limits

Social network OAuth and automatic follower syncing, push notifications, and automatic Google Calendar invitation/sync are not part of this package. Message/activity refresh is periodic, not instantaneous. The owner admin console does not reveal private conversation bodies. Existing Supabase data must be preserved; do not rerun the initial schema, and this package does not automatically execute SQL migrations.
