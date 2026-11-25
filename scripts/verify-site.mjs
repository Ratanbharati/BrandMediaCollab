import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(root, "public", "site");
const errors = [];
const htmlFiles = fs.readdirSync(siteRoot).filter((name) => name.endsWith(".html"));
const jsFiles = fs.readdirSync(siteRoot).filter((name) => name.endsWith(".js"));

function targetFor(source, fromFile) {
  const clean = source.split(/[?#]/, 1)[0];
  if (!clean || /^(?:[a-z]+:|\/\/)/i.test(clean) || clean.startsWith("#")) return null;
  if (clean.startsWith("/site/")) return path.join(siteRoot, clean.slice("/site/".length));
  if (clean.startsWith("/")) return null;
  return path.resolve(path.dirname(fromFile), clean);
}

for (const name of jsFiles) {
  const file = path.join(siteRoot, name);
  try { new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }); }
  catch (error) { errors.push(`${name}: ${error.message}`); }
}

for (const name of htmlFiles) {
  const file = path.join(siteRoot, name);
  const html = fs.readFileSync(file, "utf8");
  if (!html.includes('/site/design-system.css') || !html.includes('/site/design-system.js')) errors.push(`${name}: shared responsive design system is not loaded`);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1];
    const src = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src) {
      const target = targetFor(src, file);
      if (target && !fs.existsSync(target)) errors.push(`${name}: missing script ${src}`);
      continue;
    }
    if (/\btype\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i.test(attributes)) continue;
    const code = match[2].trim();
    if (!code) continue;
    try { new vm.Script(code, { filename: `${file} inline script` }); }
    catch (error) { errors.push(`${name} inline script: ${error.message}`); }
  }
  for (const match of html.matchAll(/\b(?:href|action)\s*=\s*["']([^"']+)["']/gi)) {
    const target = targetFor(match[1], file);
    if (target && !fs.existsSync(target)) errors.push(`${name}: missing local target ${match[1]}`);
  }
}

const app = fs.readFileSync(path.join(siteRoot, "bmc-app.js"), "utf8");
const projectForm = fs.readFileSync(path.join(siteRoot, "project-form.html"), "utf8");
const explore = fs.readFileSync(path.join(siteRoot, "explore.html"), "utf8");
const exploreLive = fs.readFileSync(path.join(siteRoot, "explore-live.js"), "utf8");
const projectLive = fs.readFileSync(path.join(siteRoot, "projects-live.js"), "utf8");
const landing = fs.readFileSync(path.join(siteRoot, "index.html"), "utf8");
const landingPreview = fs.readFileSync(path.join(siteRoot, "landing-preview.html"), "utf8");
const profileSetup = fs.readFileSync(path.join(siteRoot, "profile-setup.html"), "utf8");
const messages = fs.readFileSync(path.join(siteRoot, "messages.html"), "utf8");
const notifications = fs.readFileSync(path.join(siteRoot, "notifications.html"), "utf8");
const notificationsLive = fs.readFileSync(path.join(siteRoot, "notifications-live.js"), "utf8");
const dashboard = fs.readFileSync(path.join(siteRoot, "dashboard.html"), "utf8");
const dashboardLive = fs.readFileSync(path.join(siteRoot, "dashboard-live.js"), "utf8");
const designSystemCss = fs.readFileSync(path.join(siteRoot, "design-system.css"), "utf8");
const designSystemJs = fs.readFileSync(path.join(siteRoot, "design-system.js"), "utf8");
const categorySelect = fs.readFileSync(path.join(siteRoot, "category-select.js"), "utf8");
const myProjects = fs.readFileSync(path.join(siteRoot, "my-projects.html"), "utf8");
const applicationsPage = fs.readFileSync(path.join(siteRoot, "applications-live.js"), "utf8");
const messagesLive = fs.readFileSync(path.join(siteRoot, "messages-live.js"), "utf8");
for (const token of ["--sr-heading-page", "--sr-heading-section", "--sr-heading-card", "--text-title", "--text-section", "--text-card-title", "--text-body", "--text-label", "--text-caption", "--sr-space-4", "--sr-focus", ".sr-button", ".sr-field", ".sr-card", ".sr-empty", ".sr-error", ".sr-tab", ".sr-toast", "@media (max-width: 720px)", "prefers-reduced-motion"]) {
  if (!designSystemCss.includes(token)) errors.push(`Design system CSS: missing ${token}`);
}
if (/\["index\.html",\s*"landing-preview\.html",\s*"explore\.html"\]/.test(designSystemJs)) errors.push("Design system: Explore must use the internal page title scale, not the landing hero scale");
if (!/--text-title:\s*20px/.test(designSystemCss) || !/--text-caption:\s*12px/.test(designSystemCss) || !/font-size:\s*20px\s*!important;\s*line-height:\s*28px\s*!important/.test(designSystemCss)) errors.push("Design system: internal title, caption minimum, or mobile title tokens are missing");
for (const requirement of [".bmc-global-search", ".bmc-mobile-tabs", ".bmc-mobile-more-menu", "height: 56px", "max-width: 1128px"]) {
  if (!designSystemCss.includes(requirement)) errors.push(`App shell: missing compact responsive shell rule ${requirement}`);
}
if (!designSystemJs.includes("data-notifications-link") || !designSystemJs.includes("Search people, projects") || !projectLive.includes('new URLSearchParams(location.search).get("q")') || !exploreLive.includes('new URLSearchParams(location.search).get("q")')) errors.push("App shell: notification navigation or global search handoff is missing");
if (!app.includes('data-feed-kind="all"') || !app.includes('bmc-feed-more') || !app.includes('composer.querySelector(".composer-actions")?.remove()')) errors.push("Home feed: All/More category row or single project composer action is missing");
for (const requirement of ["aria-haspopup", "role", "ArrowDown", "ArrowUp", "Escape", "typeBuffer", "pushState", "popstate", "bmc:message-type", "projectForm"]) {
  if (!categorySelect.includes(requirement)) errors.push(`Category selector: missing accessible/shared behavior ${requirement}`);
}
if (!designSystemCss.includes(".bmc-category-menu") || !designSystemCss.includes("max-width: 767px") || !designSystemCss.includes("scrollbar-gutter: stable")) errors.push("Category selector: menu sizing, mobile sheet, or scroll behavior is missing");
if (!landing.includes('data-open="signup">Join now</button>') || landing.includes('Find your next partnership')) errors.push("Landing hero: Join now and the secondary how-it-works link are not the only hero CTAs");
if (landing.includes('class="float-card') && (!landing.includes("Example partnership brief") || !landing.includes('aria-label="How a creative match works"'))) errors.push("Landing hero: illustrative partnership cards must be clearly labeled as examples");
for (const icon of ["home", "projects", "explore", "dashboard", "messages", "notifications", "settings", "logout"]) {
  if (!designSystemJs.includes(`"${icon}"`)) errors.push(`Design system icons: missing ${icon}`);
}
const resetFlow = fs.readFileSync(path.join(siteRoot, "password-reset.js"), "utf8");
const authMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261121130000_expand_to_nine_account_types.sql"), "utf8");
const roles = ["creator", "brand", "agency", "celebrity", "event", "media", "community", "distributor", "freelancer"];
for (const role of roles) {
  if (!designSystemJs.includes(`id: "${role}"`)) errors.push(`Category selector config: missing canonical role ${role}`);
  if (!app.includes(`"${role}"`)) errors.push(`bmc-app.js: missing account type ${role}`);
  if (!projectForm.includes(`value="${role}"`)) errors.push(`project-form.html: missing project type ${role}`);
  if (!explore.includes(`data-type="${role}"`)) errors.push(`explore.html: missing profile filter ${role}`);
  if (!projectLive.includes(`"${role}"`)) errors.push(`projects-live.js: missing category handling for ${role}`);
  if (!messages.includes(`data-filter="${role}"`)) errors.push(`messages.html: missing conversation filter ${role}`);
}
for (const role of roles) {
  if (!landing.includes(`data-role="${role}"`)) errors.push(`index.html: missing signup type ${role}`);
  if (!authMigration.includes(`'${role}'`)) errors.push(`Auth profile trigger migration: missing account type ${role}`);
}
if (!app.includes("`${accountLabel} account`")) errors.push("bmc-app.js: the home profile card does not display the actual account type");
if (!/name=["']robots["'][^>]*content=["']noindex,\s*nofollow["']/i.test(landingPreview)) errors.push("Landing preview: duplicate prototype page must stay out of search indexes");
if (!explore.includes("explore-live.js") || !exploreLive.includes('rpc("discover_profiles"')) errors.push("Explore page: live profile discovery RPC is missing");
if (!projectLive.includes("postgres_changes")) errors.push("projects-live.js: project live updates are not subscribed");
if (!app.includes('"notifications.html"') || !app.includes('data-notifications-link')) errors.push("Notifications: protected route or main-navigation entry is missing");
if (!notifications.includes("notifications-live.js") || !notificationsLive.includes('table:"notifications"') || !notificationsLive.includes('filter:`user_id=eq.${user.id}`')) errors.push("Notifications: dedicated live page or user-scoped Realtime query is missing");
for (const feature of ['data-filter="all"', 'data-filter="unread"', 'data-filter="read"', 'id="mark-all"', 'id="load-more"']) {
  if (!notifications.includes(feature)) errors.push(`Notifications: missing ${feature}`);
}
if (!notificationsLive.includes('.update({read_at:') || !notificationsLive.includes('.range(offset,offset+pageSize-1)')) errors.push("Notifications: read state or paginated retrieval is missing");
if (/table:\s*["']notifications["']|renderNotifications|notification-list|activity-notifications/i.test(dashboard + dashboardLive)) errors.push("Dashboard: notification data or panel must stay on its dedicated page");
if (!dashboardLive.includes('table: "projects"') || !dashboardLive.includes('table: "applications"') || !dashboardLive.includes('table: "messages"')) errors.push("Dashboard: project/application/message Realtime refresh is incomplete");
if (/localStorage|data-row|A little joy, in every bite|Send project update/.test(dashboard)) errors.push("Dashboard: hardcoded demo activity or fake action UI remains");
if (/localStorage|bmc_projects/.test(myProjects) || !app.includes('if (path.endsWith("/my-projects.html")) loadMyProjects()')) errors.push("My projects: browser-only demo persistence or missing Supabase renderer remains");
if (!applicationsPage.includes('["interested", "working_together"].includes(app.status)') || !applicationsPage.includes('supabase.rpc("submit_project_interest"')) errors.push("Applications: active project interests do not open their persisted conversation");
if (!app.includes('messagesUrl.searchParams.set("conversation", conversationId)') || !app.includes('messagesUrl.searchParams.set("interest", "sent")')) errors.push("Project interest: successful send does not close the dialog and route to its conversation");
const interestChatMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261123150000_interest_opens_project_chat.sql"), "utf8");
if (!interestChatMigration.includes("submit_project_interest") || !interestChatMigration.includes("a.status in ('interested', 'working_together')")) errors.push("Project chat: Supabase migration does not authorize active-interest conversations");
if (!dashboardLive.includes('app.status !== "working_together"') && !dashboardLive.includes('["interested", "working_together"].includes(app.status)')) errors.push("Dashboard: project chat actions are missing active-interest state handling");
if (!messagesLive.includes('.in("status", ["interested", "working_together"])') || !messagesLive.includes('Project conversations')) errors.push("Messages: active interests are not available as project conversations");
if (!messagesLive.includes("notificationReadError")) errors.push("Messages: notification read-update failures are silently ignored");
const integrityMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261120120000_phase5_application_integrity.sql"), "utf8");
const profileRealtimeMigrationPath = path.join(root, "supabase", "migrations", "20261119001000_enable_profile_discovery_realtime.sql");
if (!fs.existsSync(profileRealtimeMigrationPath)) errors.push("Supabase migrations: canonical profile discovery Realtime migration is missing");
else {
  const profileRealtimeMigration = fs.readFileSync(profileRealtimeMigrationPath, "utf8").toLowerCase();
  if (!profileRealtimeMigration.includes("supabase_realtime") || !profileRealtimeMigration.includes("public.profiles")) errors.push("Supabase migrations: profile discovery Realtime migration does not include public.profiles");
}
const adminHelperMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261118052016_platform_admin_private_helper.sql"), "utf8");
if (!adminHelperMigration.includes("create or replace function app_private.is_platform_admin()") || !integrityMigration.includes("create or replace function app_private.is_platform_admin()")) errors.push("Admin authorization helper: migration-chain or existing-install repair is missing");
for (const requirement of ["applications_guard_write", "guard_application_write", "target_profile_types", "application_deadline", "revoke update on public.applications", "with check ("]) {
  if (!integrityMigration.toLowerCase().includes(requirement.toLowerCase())) errors.push(`Application integrity migration: missing ${requirement}`);
}
if (!projectLive.includes('from("saved_projects")') || !projectLive.includes('from("applications")') || !projectLive.includes('from("projects")')) errors.push("Projects: live projects, application, or saved-project data access is missing");
for (const method of ["supabase.auth.signUp", "supabase.auth.signInWithPassword", "supabase.auth.getUser", "supabase.auth.signOut"]) {
  if (!app.includes(method)) errors.push(`Auth workflow: missing ${method}`);
}
for (const field of ['id="full-name"', 'id="email"', 'id="password"', 'id="confirm-password"', 'id="account-consent"']) {
  if (!landing.includes(field)) errors.push(`Signup form: missing ${field}`);
}
if (!landing.includes("data-toggle-password") || !landing.includes("reset-password.html?email=")) errors.push("Auth form: show/hide password or password recovery entry is missing");
if (!resetFlow.includes("resetPasswordForEmail") || !resetFlow.includes("updateUser({ password })")) errors.push("Password recovery: request or secure password update flow is missing");
if (!app.includes("protectedPages.has(file)") || !app.includes("authNextPage()") || !app.includes("candidate.origin !== location.origin")) errors.push("Auth routes: protected page guard or same-origin return URL validation is missing");
if (landing.includes("document.querySelector('#auth-form').addEventListener('submit'")) errors.push("Landing auth: an inline fake login/signup redirect is still intercepting Supabase Auth");
if (!authMigration.includes("on conflict (id) do nothing") || !authMigration.includes("false, false")) errors.push("Auth profile initialization: missing idempotent private/incomplete defaults");
for (const field of ['id="full-name"', 'id="creator-category"', 'id="display-name"', 'id="location"', 'id="bio"']) {
  if (!profileSetup.includes(field)) errors.push(`Creator profile setup: missing required field ${field}`);
}
const creatorMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261120094418_creator_profile_requirements.sql"), "utf8");
for (const requirement of ["full_name text", "avatar_url", "primary category", "validate_private_contact_creator_name"]) {
  if (!creatorMigration.toLowerCase().includes(requirement.toLowerCase())) errors.push(`Creator profile migration: missing ${requirement}`);
}
for (const requirement of ["creatorFullName", "creatorCategory", "bmcUpdateProfileCompletion", "profile photo is required", "ensureNineTypeProfileFields", "community_type", "distribution_regions", "work_preference"]) {
  if (!app.includes(requirement)) errors.push(`Creator profile workflow: missing ${requirement}`);
}
if (profileSetup.includes("Could not connect to Stagerang. Reload and try again.")) errors.push("Creator profile setup: placeholder save failure handler remains");

if (errors.length) {
  console.error(`Site verification failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Site verification passed: ${htmlFiles.length} pages, ${jsFiles.length} scripts, shared design-system wiring, nine profile and project types, auth/profile checks, local links/scripts, application integrity, mock-data removal, and realtime hooks.`);
}
