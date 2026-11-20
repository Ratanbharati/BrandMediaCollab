# Stagerang Auth setup and live test checklist

The browser uses Supabase Auth through the publishable key returned by `/api/supabase-config`. Passwords are submitted directly to Supabase Auth; Stagerang never stores a plaintext password. User profile and private-contact rows are initialized by the Auth database trigger in the same transaction as Auth user creation.

## Supabase project settings

In Supabase Dashboard → Authentication → URL Configuration:

- Set the Site URL to the canonical production origin, currently `https://www.stagerang.com`.
- Add the exact production redirect URLs `https://www.stagerang.com/site/profile-setup.html` and `https://www.stagerang.com/site/update-password.html`.
- Add the matching preview-deployment URLs used for manual testing, and local development URLs such as `http://localhost:3000/site/profile-setup.html` and `http://localhost:3000/site/update-password.html` only where needed.
- Keep email/password sign-in enabled. For a public production signup flow, keep email confirmation enabled and configure a verified sending domain/provider with appropriate deliverability and rate limits.
- Enable Supabase Auth leaked-password protection and review the configured minimum password length/strength so it is consistent with the client checks (8+ characters, at least one letter and one number).

The confirmation email and password-reset links must use the URLs above. If a redirect is not allow-listed, Supabase can reject or redirect the flow to a different site URL.

## Safe live verification

Use disposable email inboxes controlled by the tester. Do not use an existing member’s account or a real customer’s address for test signups. Create one disposable address for each of Brand, Creator, Agency, Celebrity, Event, and Media; verify each email; complete profile setup; then confirm the saved `profiles.account_type` and `onboarding_completed` values in Supabase. The migration initializes new profiles as incomplete and undiscoverable; the owner must explicitly enable discoverability during setup.

Also check duplicate and malformed email, weak password, password mismatch, missing name/consent/type, incorrect password, unconfirmed email, sign out, refresh after sign-in, protected-page deep links, reset-email delivery, valid reset, and expired reset links. The app’s generic signup/reset responses intentionally avoid revealing whether an email is registered.

## Test boundary

Static validation and production build do not prove that SMTP delivery or a human-controlled inbox works. A live test is complete only after the tester receives and follows the confirmation/reset email and verifies the resulting authenticated session and profile rows. No test accounts have been created as part of this code change.
