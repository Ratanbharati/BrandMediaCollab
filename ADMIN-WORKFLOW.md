# Stagerang owner/admin workflow

## Sign in

Open `/site/admin-dashboard.html` and sign in using the verified owner Stagerang Auth account after configuring the Supabase project and owner membership. The page verifies admin membership through a protected API before rendering platform data. This package contains no admin credentials or owner-specific membership record.

## Overview

The overview shows current database totals for registered users, nine profile types, 30-day active users, projects, published projects, applications, accepted collaborations, accepted connections, reports, pending reports, verification requests, suspended users, open support requests, and admin actions. It refreshes every 30 seconds while visible and supports manual refresh.

## Accounts

Use the People filters to search by name/email or filter by profile type/status. Results are fetched server-side in pages of 50. View the public profile fields, email-verification state, creation/last active dates, calculated profile completion, account state, and project count. Admin views avoid private contact details, Auth metadata, credentials, tokens, and messages.

Profile visibility can be hidden/restored. Suspend and restore require confirmation; suspension also records a reason. The server prevents suspending any admin account or the current owner account, places a Supabase Auth ban, and uses a restrictive RLS gate to block existing access tokens. Every successful action is audited. Permanent account deletion is not available in the console.

## Moderation

- **Projects:** review project ownership and categories; set normal, review, hidden, or removed status. Hidden/removed projects remain visible to their owner and an admin, while member discovery excludes them.
- **Reports:** members can report a profile from Explore/profile pages or report a project from Projects. Review each report and save its status and internal review note.
- **Verification:** profile owners can submit a verification statement. Approving/rejecting a request updates the profile badge and records the decision.
- **Support:** review support requests and update status.
- **Applications:** only project/applicant names, application status, and timestamp are shown. Private application message text is not exposed.
- **Audit log:** see changes made by the platform admin.

## Validation after deployment

1. Sign in as the owner and confirm non-owner accounts cannot open admin API data.
2. Check the account type counts and compare with database records.
3. Search/filter a known member and use the detail panel.
4. On a disposable test account, hide/show the profile, suspend, and restore; verify direct database access is blocked while suspended and restored after reactivation.
5. Submit a profile/project report and a verification request from a test account, review them, then confirm audit entries and updated status.
6. Confirm hidden/removed projects are no longer discoverable to members.

An owner password was not provided, so the owner sign-in itself was not attempted during this code/database audit. Do not claim the login passed until it is tested with the real owner account.
