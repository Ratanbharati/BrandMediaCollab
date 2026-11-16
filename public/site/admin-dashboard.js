(async function () {
  const $ = (selector) => document.querySelector(selector);
  const login = $("#login-panel"), panel = $("#admin-panel"), errorBox = $("#login-error"), notice = $("#setup-notice"), toastNode = $("#toast");
  let supabase, token = "", usersPage = 1, usersHasMore = false, activeView = "overview", cache = {}, refreshTimer = 0, refreshBusy = false;
  const esc = (value) => String(value ?? "");
  function toast(message) { toastNode.textContent = message; toastNode.classList.add("show"); setTimeout(() => toastNode.classList.remove("show"), 2600); }
  function date(value) { return value ? new Date(value).toLocaleString() : "—"; }
  function setVisible(element, visible) { element.classList.toggle("hidden", !visible); }
  function td(row, value) { const cell = document.createElement("td"); cell.textContent = esc(value); row.append(cell); return cell; }
  function rowFor(body, values) { const row = document.createElement("tr"); values.forEach((value) => td(row, value)); body.append(row); return row; }

  async function api(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in again to continue.");
    const response = await fetch(path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Admin request failed.");
    return data;
  }

  function showError(error) {
    notice.textContent = error.message || "Admin data could not be loaded.";
    notice.classList.remove("hidden");
  }

  async function showConsole() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setVisible(login, true); setVisible(panel, false); setVisible($("#sign-out"), false); return; }
    token = session.access_token; $("#admin-email").textContent = session.user.email || "Signed in";
    setVisible(panel, false); setVisible(login, true); setVisible($("#sign-out"), false);
    errorBox.textContent = ""; notice.classList.add("hidden");
    try {
      await loadOverview();
      setVisible(login, false); setVisible(panel, true); setVisible($("#sign-out"), true);
      await loadView(activeView);
      $("#last-updated").textContent = `Last updated ${new Date().toLocaleTimeString()}. Refreshes every 20 seconds while this page is open.`;
    } catch (error) {
      token = "";
      setVisible(panel, false); setVisible(login, true); setVisible($("#sign-out"), false);
      errorBox.textContent = error.message || "This account is not authorized for platform administration.";
    }
  }

  async function loadOverview() {
    const data = await api("/api/admin/data?resource=overview");
    const labels = [["Profiles", data.counts.users], ["Projects", data.counts.projects], ["Applications", data.counts.applications], ["Conversations", data.counts.conversations], ["Support requests", data.counts.support], ["Admin actions", data.counts.audit]];
    const host = $("#overview-metrics"); host.replaceChildren();
    labels.forEach(([label, value]) => { const card = document.createElement("article"); card.className = "metric"; const name = document.createElement("span"); name.textContent = label; const number = document.createElement("b"); number.textContent = String(value ?? 0); card.append(name, number); host.append(card); });
  }

  function userMatches(user, query) { const profile = user.profile || {}; return `${user.email || ""} ${profile.display_name || ""} ${profile.company_name || ""} ${profile.account_type || ""}`.toLowerCase().includes(query); }
  function renderUsers(list) {
    const body = $("#users-body"); body.replaceChildren(); const query = $("#user-search").value.trim().toLowerCase();
    list.filter((user) => userMatches(user, query)).forEach((user) => {
      const profile = user.profile || {}; const display = profile.display_name || profile.company_name || user.user_metadata?.display_name || user.email || "Member";
      const row = document.createElement("tr"); td(row, display); td(row, user.email || "—"); td(row, profile.account_type || user.user_metadata?.account_type || "—");
      td(row, date(user.created_at)); td(row, user.project_count || 0); td(row, profile.is_discoverable === false ? "Hidden" : "Visible");
      const actions = document.createElement("td"); actions.className = "actions";
      if (profile.id) {
        const visibility = document.createElement("button"); visibility.className = "button secondary"; visibility.textContent = profile.is_discoverable === false ? "Show profile" : "Hide profile";
        visibility.onclick = async () => { visibility.disabled = true; try { await api("/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: profile.id, isDiscoverable: profile.is_discoverable === false }) }); toast("Profile visibility updated."); await loadUsers(); await loadOverview(); } catch (error) { toast(error.message); visibility.disabled = false; } };
        actions.append(visibility);
      }
      const remove = document.createElement("button"); remove.className = "button danger"; remove.textContent = "Delete test account";
      remove.onclick = async () => {
        if (!user.email) return toast("This account has no email to confirm.");
        const phrase = `DELETE ${user.email}`;
        if (prompt(`Permanent deletion removes this Auth account and its linked app data. To continue, type exactly:\n${phrase}`) !== phrase) return;
        if (!confirm(`Permanently delete ${user.email} and linked projects, applications, and messages?`)) return;
        remove.disabled = true;
        try { await api("/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: user.id, confirmationEmail: user.email, displayName: display }) }); toast("Test account and linked data deleted."); await loadUsers(); await loadOverview(); }
        catch (error) { toast(error.message); remove.disabled = false; }
      };
      actions.append(remove); row.append(actions); body.append(row);
    });
    if (!body.children.length) { const row = document.createElement("tr"); const cell = td(row, query ? "No accounts match that search." : "No accounts found."); cell.colSpan = 7; body.append(row); }
    $("#users-page-label").textContent = `Page ${usersPage}`; $("#users-prev").disabled = usersPage <= 1; $("#users-next").disabled = !usersHasMore;
  }
  async function loadUsers() {
    const data = await api(`/api/admin/data?resource=users&page=${usersPage}`); cache.users = data.users || []; usersHasMore = Boolean(data.hasMore); renderUsers(cache.users);
  }

  function renderProjects(list) {
    const body = $("#projects-body"); body.replaceChildren(); const query = $("[data-search='projects']").value.trim().toLowerCase();
    list.filter((item) => `${item.project_name} ${item.owner_name} ${item.owner_type}`.toLowerCase().includes(query)).forEach((item) => rowFor(body, [item.project_name, item.owner_name, item.owner_type, item.category, item.status, date(item.created_at)]));
    if (!body.children.length) { const row = document.createElement("tr"); const cell = td(row, "No projects match this search."); cell.colSpan = 6; body.append(row); }
  }
  async function loadProjects() { const data = await api("/api/admin/data?resource=projects"); cache.projects = data.projects || []; renderProjects(cache.projects); }

  function renderApplications(list) {
    const body = $("#applications-body"); body.replaceChildren(); const query = $("[data-search='applications']").value.trim().toLowerCase();
    list.filter((item) => `${item.project_name} ${item.applicant_name} ${item.status}`.toLowerCase().includes(query)).forEach((item) => rowFor(body, [item.project_name, `${item.applicant_name} · ${item.applicant_type}`, item.status, item.message || "—", date(item.created_at)]));
    if (!body.children.length) { const row = document.createElement("tr"); const cell = td(row, "No applications match this search."); cell.colSpan = 5; body.append(row); }
  }
  async function loadApplications() { const data = await api("/api/admin/data?resource=applications"); cache.applications = data.applications || []; renderApplications(cache.applications); }

  async function loadSupport() {
    const data = await api("/api/admin/data?resource=support"), body = $("#support-body"); body.replaceChildren();
    (data.requests || []).forEach((item) => rowFor(body, [item.subject, item.profile?.display_name || item.profile?.company_name || "Member", item.status, item.description, date(item.created_at)]));
    if (!body.children.length) { const row = document.createElement("tr"); const cell = td(row, "No support requests found."); cell.colSpan = 5; body.append(row); }
  }
  async function loadAudit() {
    const data = await api("/api/admin/data?resource=audit"), body = $("#audit-body"); body.replaceChildren();
    (data.logs || []).forEach((item) => rowFor(body, [date(item.created_at), item.action, `${item.entity_type || "record"} · ${item.entity_id || "—"}`, JSON.stringify(item.details || {})]));
    if (!body.children.length) { const row = document.createElement("tr"); const cell = td(row, "No admin actions recorded yet."); cell.colSpan = 4; body.append(row); }
  }

  async function loadView(view) {
    activeView = view; document.querySelectorAll(".tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    document.querySelectorAll("[id^='view-']").forEach((section) => section.classList.toggle("hidden", section.id !== `view-${view}`));
    if (view === "users") await loadUsers(); else if (view === "projects") await loadProjects(); else if (view === "applications") await loadApplications(); else if (view === "support") await loadSupport(); else if (view === "audit") await loadAudit();
  }

  async function refreshCurrent(showToast = false) {
    if (refreshBusy || document.visibilityState !== "visible" || panel.classList.contains("hidden")) return;
    refreshBusy = true;
    try {
      await loadOverview();
      await loadView(activeView);
      $("#last-updated").textContent = `Last updated ${new Date().toLocaleTimeString()}. Refreshes every 20 seconds while this page is open.`;
      notice.classList.add("hidden");
      if (showToast) toast("Admin data refreshed.");
    } catch (error) {
      showError(error);
    } finally {
      refreshBusy = false;
    }
  }

  try {
    supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Supabase could not start.");
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault(); errorBox.textContent = "";
      const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
      try { const { error } = await supabase.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value }); if (error) throw error; await showConsole(); }
      catch (error) { errorBox.textContent = error.message || "Sign in failed."; }
      finally { button.disabled = false; }
    });
    document.querySelectorAll(".tabs button").forEach((button) => button.addEventListener("click", () => loadView(button.dataset.view).catch(showError)));
    $("#user-search").addEventListener("input", () => renderUsers(cache.users || []));
    $("[data-search='projects']").addEventListener("input", () => renderProjects(cache.projects || []));
    $("[data-search='applications']").addEventListener("input", () => renderApplications(cache.applications || []));
    $("#users-prev").onclick = () => { if (usersPage > 1) { usersPage--; loadUsers().catch(showError); } };
    $("#users-next").onclick = () => { if (usersHasMore) { usersPage++; loadUsers().catch(showError); } };
    $("#refresh").onclick = () => refreshCurrent(true);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshCurrent(false); });
    $("#sign-out").onclick = async () => { if (refreshTimer) window.clearInterval(refreshTimer); refreshTimer = 0; await supabase.auth.signOut(); cache = {}; setVisible(panel, false); setVisible(login, true); setVisible($("#sign-out"), false); $("#admin-email").textContent = ""; };
    await showConsole();
    refreshTimer = window.setInterval(() => refreshCurrent(false), 20_000);
  } catch (error) { showError(error); setVisible(login, true); }
})();
