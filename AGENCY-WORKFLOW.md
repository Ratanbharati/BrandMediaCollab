# Agency workflow in Stagerang

Agency features use the account type saved on the member's Supabase profile. They share the existing project, application, and conversation tables; no additional SQL migration is needed.

## Agency journey

1. **Create an Agency account:** Choose Agency during signup/profile setup. The agency profile includes agency type and company details.
2. **Post an agency campaign:** Use **Post a project or idea**. The project is saved with the agency's `owner_id` and `owner_type = agency`. On the form, the campaign option is labeled **Agency campaign**.
3. **Manage agency posts:** **My projects** labels those posts **Agency project** and supports edit/delete.
4. **Discover agency posts:** They appear under **Agency projects** on Home and Projects. A member can save the post or submit interest with a note.
5. **Review interest:** Agency-owned posts appear in the Dashboard's **Agency projects** table. **View responses** lists interested members and allows status updates.
6. **Communicate:** **Open chat** creates or opens the private project conversation. **Message interested** sends the text separately to each interested member. The Messages page stores and displays the conversation.

## Files that implement it

- `public/site/profile-setup.html` and `public/site/bmc-app.js`: Agency profile setup and account type persistence.
- `public/site/project-form.html` and `public/site/bmc-app.js`: agency campaign copy and project save with the agency owner type.
- `public/site/feed.html`, `public/site/bmc-app.js`, `public/site/projects.html`, and `public/site/projects-live.js`: Agency feed tab, project tab, filtering, and application actions.
- `public/site/my-projects.html` and `public/site/bmc-app.js`: agency-specific post labels and management.
- `public/site/dashboard.html` and `public/site/dashboard-live.js`: agency performance table and applicant/chat actions.
- `public/site/messages.html` and `public/site/messages-live.js`: project-linked private messages and activity counts.

For deployment, upload the ZIP contents to the GitHub repository root so these exact `public/site/` paths are updated, then wait for Vercel's Production deployment to finish.
