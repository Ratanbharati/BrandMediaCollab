# Brand Media Collab — updated prototype

This project contains the Brand Media Collab landing page and the account onboarding, profiles, discovery, dashboard, messaging, and admin screens. It now includes Brand, Influencer/Creator, and Agency account paths, an agency type field, and a My projects page with create/edit/delete project flows.

## Important before inviting users

This ZIP is a front-end prototype. Signup currently leads to profile setup, and profile/project records are stored in the current browser using `localStorage`. The login form does not authenticate a real user; social-account buttons do not sync real metrics; messages and meetings are not persisted to Supabase. Do not collect real passwords, private contact details, or business data with this prototype. A live business service still needs Supabase Auth, secure database reads/writes with Row Level Security, and real integrations.

## Run locally

1. Install Node.js LTS if it is not already installed.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local address shown by Next.js, normally `http://localhost:3000`.

The Next.js homepage displays the static site stored in `public/site`.

## Put the prototype online with Netlify

1. Unzip the downloaded ZIP on your computer.
2. In Netlify, choose **Add new site → Deploy manually**.
3. Drag the `public/site` folder from the unzipped project into the Netlify deploy area.
4. Open the generated Netlify URL and click through the onboarding and project pages.

This publishes a static prototype. Browser-local records stay in that browser and are not shared with other users.

## Deploy the Next.js project with Vercel

1. Unzip the downloaded ZIP.
2. Put the contents of `brand-media-collab-v0-project` in a GitHub repository.
3. In Vercel, choose **Add New → Project**, import that repository, and keep the detected Next.js settings.
4. Deploy. The root page loads the landing page from `public/site/index.html`.

This also publishes the front-end prototype only. Supabase project ID is not a value you change in code; a real integration uses that project's URL and public/publishable key, while server-side secrets must never be exposed in browser code.

## Main page flow

`index.html` → account type → `profile-setup.html` → `dashboard.html` → `projects.html` / `messages.html`.

Create a project from **Dashboard** or **Projects**. Manage and edit it from **My projects**.
