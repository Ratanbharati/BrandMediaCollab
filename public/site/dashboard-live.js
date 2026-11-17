// Account dashboard: posts owned by this account and applications sent by it
// are shown in separate reports. Applicant and message records stay in their
// own tables and are joined by project/user ids.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 3200); } };
  let supabase, user, accountType = "creator", projectById = {}, profileById = {}, dashboardApplications = [], dashboardConversations = [];
  let notificationFilter = "all", dashboardRealtimeChannel = null, dashboardRealtimeConnected = false, dashboardRefreshTimer = null;

  function setupReports() {
    const layout = $(".layout"); if (!layout) return;
    const notice = document.createElement("section"); notice.id = "activity-notifications";
    notice.className = "panel table-panel"; notice.style.cssText = "margin:0 0 14px;padding:14px 16px";
    notice.innerHTML = '<div class="table-head" style="padding:0 0 9px"><h2>Recent notifications <span data-dashboard-notification-count hidden style="display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:10px;background:#e8f2e2;color:#376444;font-size:11px"></span></h2><span id="notification-caption">Live project interest, application decisions, and messages</span></div><div id="dashboard-notification-toolbar" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 0 10px"><div role="group" aria-label="Filter notifications" style="display:flex;gap:5px"><button type="button" data-notification-filter="all" aria-pressed="true">All</button><button type="button" data-notification-filter="unread" aria-pressed="false">Unread</button><button type="button" data-notification-filter="read" aria-pressed="false">Read</button></div><button type="button" id="dashboard-mark-all-read">Mark all read</button></div><div id="notification-list" style="display:grid;gap:8px"></div>';
    layout.prepend(notice);
    notice.querySelectorAll("[data-notification-filter]").forEach((button) => button.addEventListener("click", () => {
      notificationFilter = button.dataset.notificationFilter;
      notice.querySelectorAll("[data-notification-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      renderNotifications().catch((error) => toast(error.message || "Could not update notifications."));
    }));
    $("#dashboard-mark-all-read").addEventListener("click", async () => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      if (error) return toast(error.message || "Could not mark notifications as read.");
      await renderNotifications(); window.bmcRefreshMessageBadge?.(); toast("All notifications marked as read.");
    });
    ["#range-summary", "#creator-range-summary"].forEach((selector) => { const node = $(selector); if (node) node.textContent = "Loading your live activity…"; });
    $("#table-title").textContent = "Brand projects";
    $("#table-head")?.replaceChildren();
    const postsPanel = $("#table-body")?.closest(".table-panel");
    const sentPanel = $("#creator-table-body")?.closest(".table-panel");
    postsPanel?.querySelector("#table-body")?.replaceChildren(); sentPanel?.querySelector("#creator-table-body")?.replaceChildren();
    const firstHead = postsPanel?.querySelector(".table-head h2"); if (firstHead) firstHead.textContent = "Brand projects";
    const firstSpan = postsPanel?.querySelector(".table-head span"); if (firstSpan) firstSpan.textContent = "Incoming interest, decisions, and private chats";
    const secondHead = sentPanel?.querySelector(".table-head h2"); if (secondHead) secondHead.textContent = "Applications sent to other accounts";
    const secondSpan = sentPanel?.querySelector(".table-head span"); if (secondSpan) secondSpan.textContent = "Your activity on other members’ projects";
    const heads = postsPanel?.querySelector("thead tr");
    if (heads) heads.innerHTML = "<th>Project</th><th>Status</th><th>Responses</th><th>Interested</th><th>Working together</th><th>Passed</th><th>Chats</th><th>Actions</th>";
    const secondHeads = sentPanel?.querySelector("thead tr");
    if (secondHeads) secondHeads.innerHTML = "<th>Project</th><th>Owner</th><th>Application status</th><th>Your note</th><th>Applied</th><th colspan=2>Conversation</th><th>Actions</th>";
    const makePanel = (id, title, summaryId, bodyId, emptyId, interestLabel) => {
      const section = document.createElement("section"); section.id = id; section.className = "panel table-panel";
      section.innerHTML = `<div class="table-head"><div><h2>${title}</h2><span id="${summaryId}">Loading live project activity…</span></div><span>Counts use this account’s saved project activity</span></div><div class="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Responses</th><th>${interestLabel}</th><th>Working together</th><th>Rejected</th><th>Project chats</th><th>Actions</th></tr></thead><tbody id="${bodyId}"></tbody></table><div class="empty" id="${emptyId}">No projects in this date range.</div></div><div class="table-footer">Project activity is grouped by the account type that created the post.</div>`;
      return section;
    };
    const creatorPanel = makePanel("creator-ideas-panel", "Creator ideas", "creator-ideas-summary", "creator-ideas-body", "creator-ideas-empty", "Interested brands");
    const agencyPanel = makePanel("agency-projects-panel", "Agency projects", "agency-projects-summary", "agency-projects-body", "agency-projects-empty", "Interested creators");
    if (postsPanel && sentPanel) { postsPanel.after(creatorPanel); creatorPanel.after(agencyPanel); }
    const rolePicker = $("#role"); if (rolePicker) rolePicker.hidden = true;
    const insight = $(".insight"); if (insight) insight.innerHTML = '<b>How it works:</b> Brand projects, Creator ideas, and Agency projects are separated by the account that posted them. “Applications sent” is your interest in other people’s posts. Each conversation is private and one-to-one. A bulk update sends the same message separately to each interested person.';
  }

  async function ensureChat(projectId, otherId, message) {
    const { data: memberships, error: memError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (memError) throw memError;
    const ids = (memberships || []).map((m) => m.conversation_id);
    if (ids.length) {
      const { data: chats, error } = await supabase.from("conversations").select("id,project_id").eq("project_id", projectId).in("id", ids);
      if (error) throw error;
      for (const chat of chats || []) {
        const { data: members, error: membersError } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", chat.id);
        if (membersError) throw membersError;
        if ((members || []).some((m) => m.user_id === user.id) && (members || []).some((m) => m.user_id === otherId)) return chat.id;
      }
    }
    const { data: chat, error } = await supabase.from("conversations").insert({ project_id: projectId, created_by: user.id, is_group: false }).select("id").single();
    if (error) throw error;
    const { error: memberError } = await supabase.from("conversation_members").insert([{ conversation_id: chat.id, user_id: user.id }, { conversation_id: chat.id, user_id: otherId }]);
    if (memberError) throw memberError;
    if (message) {
      const { error: messageError } = await supabase.from("messages").insert({ conversation_id: chat.id, sender_id: user.id, body: message });
      if (messageError) throw messageError;
    }
    return chat.id;
  }

  function openApplicants(projectId) {
    const project = projectById[projectId]; if (!project) return;
    let modal = $("#applicant-modal");
    if (!modal) {
      modal = document.createElement("div"); modal.id = "applicant-modal";
      modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:#14221caa;display:flex;align-items:center;justify-content:center;padding:18px";
      modal.innerHTML = '<section style="background:#fffefa;border-radius:16px;width:min(820px,100%);max-height:90vh;overflow:auto;padding:22px"><div style="display:flex;justify-content:space-between;align-items:center"><div><h2 id="applicant-title" style="margin:0"></h2><p>People who sent interest. Open their one-to-one project conversation or update their status.</p></div><button data-close>Close</button></div><div id="applicant-list"></div></section>';
      modal.addEventListener("click", (event) => { if (event.target === modal || event.target.closest("[data-close]")) modal.remove(); }); document.body.append(modal);
    }
    $("#applicant-title").textContent = project.project_name;
    const items = project.applications || [];
    $("#applicant-list").innerHTML = items.length ? items.map((app) => {
      const profile = profileById[app.applicant_id] || {}; const name = profile.display_name || profile.company_name || "Member";
      return `<article style="border-top:1px solid #e5e8df;padding:14px 0;display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,2fr) auto;gap:12px;align-items:center"><div><b>${esc(name)}</b><div>${esc(profile.account_type || "Member")} · ${new Date(app.created_at).toLocaleDateString()}</div></div><div>${esc(app.message || "No note included")}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><select data-status="${esc(app.id)}"><option value="interested">Interested</option><option value="working_together">Work together</option><option value="rejected">Pass</option></select><button data-chat="${esc(app.id)}">Open chat</button></div></article>`;
    }).join("") : '<p>No one has expressed interest in this post yet.</p>';
    items.forEach((app) => { const select = $(`[data-status="${CSS.escape(app.id)}"]`); if (select) { select.value = app.status; select.onchange = async () => { const { error } = await supabase.from("applications").update({ status: select.value, updated_at: new Date().toISOString() }).eq("id", app.id); if (error) toast(error.message); else { app.status = select.value; toast("Application status updated."); await refreshDashboardData(); await renderNotifications(); } }; } const button = $(`[data-chat="${CSS.escape(app.id)}"]`); if (button) button.onclick = async () => { try { const id = await ensureChat(projectId, app.applicant_id); location.href = `messages.html?conversation=${encodeURIComponent(id)}`; } catch (error) { toast(error.message); } }; });
  }

  async function bulkMessage(projectId) {
    const project = projectById[projectId]; const recipients = (project?.applications || []).filter((app) => ["interested", "working_together"].includes(app.status));
    if (!recipients.length) return toast("There are no interested people to message yet.");
    const text = prompt(`Send a private message about “${project.project_name}” to ${recipients.length} interested person(s). Each person gets a separate private message:`);
    if (!text?.trim()) return;
    try {
      let sent = 0; const failed = [];
      for (const app of recipients) {
        try {
          const id = await ensureChat(projectId, app.applicant_id);
          const { error } = await supabase.from("messages").insert({ conversation_id: id, sender_id: user.id, body: text.trim() });
          if (error) throw error;
          sent++;
        } catch (_) { failed.push(app.applicant_id); }
      }
      toast(failed.length ? `Sent to ${sent} of ${recipients.length}; ${failed.length} message(s) failed.` : `Sent privately to ${sent} interested person(s).`);
    } catch (error) { toast(error.message || "Could not send the project update."); }
  }

  function renderOwned(owned, applications, conversations) {
    const ownBody = $("#table-body"); const creatorIdeaBody = $("#creator-ideas-body"); const agencyBody = $("#agency-projects-body"); const sentBody = $("#creator-table-body");
    const ownedIds = new Set(owned.map((p) => p.id));
    const forProject = Object.fromEntries(owned.map((project) => [project.id, applications.filter((app) => app.project_id === project.id)]));
    for (const project of owned) project.applications = forProject[project.id] || [];
    const chatCounts = conversations.reduce((out, chat) => { if (chat.project_id) out[chat.project_id] = (out[chat.project_id] || 0) + 1; return out; }, {});
    const kindOf = () => accountType;
    const brandPosts = owned.filter((p) => kindOf(p) === "brand");
    const creatorPosts = owned.filter((p) => kindOf(p) === "creator");
    const agencyPosts = owned.filter((p) => kindOf(p) === "agency");
    const renderProjectRows = (posts) => posts.map((p) => {
      const rows = forProject[p.id] || []; const interested = rows.filter((x) => x.status === "interested").length;
      const together = rows.filter((x) => x.status === "working_together").length; const rejected = rows.filter((x) => x.status === "rejected").length;
      const label = kindOf(p) === "agency" ? "Agency project" : kindOf(p) === "creator" ? "Creator idea" : "Brand project";
      return `<tr class="data-row" data-role="${esc(kindOf(p))}" data-project-id="${esc(p.id)}" data-date="${esc((p.created_at || "").slice(0,10))}" data-project="${esc(p.project_name)}" data-recipients="${interested}"><td class="project-cell"><b>${esc(p.project_name)}</b><span>${label} · ${esc(p.category)}</span></td><td>${esc(p.status)}</td><td><span class="metric">${rows.length}</span></td><td><span class="metric">${interested}</span></td><td><span class="metric">${together}</span></td><td><span class="metric">${rejected}</span></td><td><span class="metric">${chatCounts[p.id] || 0}</span></td><td><div class="row-actions"><button class="action" data-applicants="${esc(p.id)}">View responses (${rows.length})</button><button class="action primary-action" data-bulk="${esc(p.id)}">Message interested</button></div></td></tr>`;
    }).join("");
    if (ownBody) ownBody.innerHTML = renderProjectRows(brandPosts);
    if (creatorIdeaBody) creatorIdeaBody.innerHTML = renderProjectRows(creatorPosts);
    if (agencyBody) agencyBody.innerHTML = renderProjectRows(agencyPosts);
    const externalApps = applications.filter((app) => !ownedIds.has(app.project_id));
    if (sentBody) sentBody.innerHTML = externalApps.map((app) => {
      const project = projectById[app.project_id] || {}; const owner = profileById[project.owner_id] || {};
      const name = owner.display_name || owner.company_name || "Project owner";
      const chat = conversations.find((c) => c.project_id === app.project_id && c.memberIds?.includes(project.owner_id));
      return `<tr class="data-row" data-role="applications" data-date="${esc((app.created_at || "").slice(0,10))}" data-project="${esc(project.project_name || "Project")}"><td class="project-cell"><b>${esc(project.project_name || "Project")}</b><span>${esc(project.category || "")}</span></td><td>${esc(name)}</td><td>${esc(app.status)}</td><td>${esc(app.message || "—")}</td><td>${new Date(app.created_at).toLocaleDateString()}</td><td colspan="2">${chat ? "Private chat ready" : "No chat yet"}</td><td><button class="action primary-action" data-open-chat="${esc(app.project_id)}" data-other="${esc(project.owner_id || "")}">Open chat</button></td></tr>`;
    }).join("");
    [ownBody, creatorIdeaBody, agencyBody].filter(Boolean).forEach((body) => {
      body.querySelectorAll("[data-applicants]").forEach((button) => button.onclick = () => openApplicants(button.dataset.applicants));
      body.querySelectorAll("[data-bulk]").forEach((button) => button.onclick = () => bulkMessage(button.dataset.bulk));
    });
    if (sentBody) sentBody.querySelectorAll("[data-open-chat]").forEach((button) => button.onclick = async () => { try { const id = await ensureChat(button.closest("tr").querySelector("[data-open-chat]").dataset.openChat, button.dataset.other); location.href = `messages.html?conversation=${encodeURIComponent(id)}`; } catch (error) { toast(error.message); } });
    const setEmpty = (id, list, text) => { const el = $(id); if (el) { el.textContent = text; el.style.display = list.length ? "none" : "block"; } };
    setEmpty("#empty", brandPosts, "No brand projects have been posted yet.");
    setEmpty("#creator-ideas-empty", creatorPosts, "No creator ideas have been posted yet.");
    setEmpty("#agency-projects-empty", agencyPosts, "No agency projects have been posted yet.");
    const sentEmpty = $("#creator-empty"); if (sentEmpty) sentEmpty.style.display = externalApps.length ? "none" : "block";
    const summary = (rows) => `${rows.length} post${rows.length === 1 ? "" : "s"} · ${rows.reduce((n,p) => n + (forProject[p.id] || []).length, 0)} responses received`;
    const brandSummary = $("#range-summary"); if (brandSummary) brandSummary.textContent = summary(brandPosts);
    const creatorSummary = $("#creator-ideas-summary"); if (creatorSummary) creatorSummary.textContent = summary(creatorPosts);
    const agencySummary = $("#agency-projects-summary"); if (agencySummary) agencySummary.textContent = summary(agencyPosts);
    const sentSummary = $("#creator-range-summary"); if (sentSummary) sentSummary.textContent = `${externalApps.length} application${externalApps.length === 1 ? "" : "s"} sent to other members’ posts`;
    syncDashboardDates();
  }

  function syncDashboardDates() {
    const from = $("#date-from")?.value || "0000-01-01", to = $("#date-to")?.value || "9999-12-31";
    const within = (value) => { const day = String(value || "").slice(0, 10); return day >= from && day <= to; };
    const groups = [
      ["#table-body", "#empty", "#range-summary", "projects"],
      ["#creator-ideas-body", "#creator-ideas-empty", "#creator-ideas-summary", "ideas"],
      ["#agency-projects-body", "#agency-projects-empty", "#agency-projects-summary", "projects"],
      ["#creator-table-body", "#creator-empty", "#creator-range-summary", "applications"]
    ];
    for (const [bodySelector, emptySelector, summarySelector, label] of groups) {
      const body = $(bodySelector); if (!body) continue;
      const all = [...body.querySelectorAll("tr[data-date]")];
      all.forEach((row) => { row.style.display = row.dataset.date >= from && row.dataset.date <= to ? "" : "none"; });
      const visible = all.filter((row) => row.style.display !== "none");
      if (label !== "applications") visible.forEach((row) => {
        const projectId = row.dataset.projectId;
        const apps = dashboardApplications.filter((app) => app.project_id === projectId && within(app.created_at));
        const chats = dashboardConversations.filter((chat) => chat.project_id === projectId && within(chat.created_at));
        const values = [apps.length, apps.filter((app) => app.status === "interested").length, apps.filter((app) => app.status === "working_together").length, apps.filter((app) => app.status === "rejected").length, chats.length];
        values.forEach((value, index) => { const metric = row.cells[index + 2]?.querySelector(".metric"); if (metric) metric.textContent = String(value); });
        const responseButton = row.querySelector("[data-applicants]"); if (responseButton) responseButton.textContent = `View responses (${apps.length})`;
      });
      const empty = $(emptySelector); if (empty) empty.style.display = visible.length ? "none" : "block";
      const summary = $(summarySelector);
      if (summary && label === "applications") summary.textContent = `${visible.length} application${visible.length === 1 ? "" : "s"} sent in this date range`;
      else if (summary) {
        const totals = [2,3,4,5,6].map((index) => visible.reduce((sum, row) => sum + Number(row.cells[index]?.querySelector(".metric")?.textContent || 0), 0));
      summary.textContent = `${visible.length} ${label} · ${totals[0]} responses · ${totals[1]} interested · ${totals[2]} working together · ${totals[3]} passed · ${totals[4]} chats in this date range`;
      }
    }
  }

  async function renderNotifications() {
    const host = $("#notification-list"); if (!host) return;
    const { data, error } = await supabase.from("notifications").select("id,type,title,body,project_id,application_id,conversation_id,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15);
    if (error) { host.innerHTML = '<span>Notifications could not be loaded. Please try again.</span>'; return; }
    const { count, error: countError } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
    const unread = countError ? (data || []).filter((item) => !item.read_at).length : count || 0;
    const badge = document.querySelector("[data-dashboard-notification-count]");
    if (badge) { badge.textContent = unread > 99 ? "99+" : String(unread); badge.hidden = unread === 0; badge.setAttribute("aria-label", `${unread} unread notifications`); }
    const visible = (data || []).filter((item) => notificationFilter === "all" || (notificationFilter === "unread" ? !item.read_at : Boolean(item.read_at)));
    host.innerHTML = visible.length ? visible.map((n) => `<button data-notification="${esc(n.id)}" data-read="${Boolean(n.read_at)}" data-conversation="${esc(n.conversation_id || "")}" data-project="${esc(n.project_id || "")}" style="position:relative;text-align:left;border:1px solid ${n.read_at ? "#e5e8df" : "#e3eddc"};border-radius:9px;background:${n.read_at ? "white" : "#f0f6e9"};padding:10px 12px 10px 27px"><i aria-hidden="true" style="position:absolute;left:11px;top:15px;width:7px;height:7px;border-radius:50%;background:${n.read_at ? "transparent" : "#4d9bd5"}"></i><b>${esc(n.title)}</b><div>${esc(n.body)}</div><small>${new Date(n.created_at).toLocaleString()}</small></button>`).join("") : `<span>${notificationFilter === "unread" ? "You’re all caught up." : notificationFilter === "read" ? "No read notifications yet." : "No new activity yet."}</span>`;
    host.querySelectorAll("[data-notification]").forEach((button) => button.onclick = async () => {
      const id = button.dataset.notification;
      if (button.dataset.read !== "true") {
        const { error: markError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
        if (markError) return toast(markError.message || "Could not mark the notification as read.");
      }
      await renderNotifications(); window.bmcRefreshMessageBadge?.();
      if (button.dataset.conversation) location.href = `messages.html?conversation=${encodeURIComponent(button.dataset.conversation)}`;
      else if (button.dataset.project) { const project = projectById[button.dataset.project]; if (project) openApplicants(project.id); }
    });
  }

  function connectDashboardRealtime() {
    if (dashboardRealtimeChannel || !supabase || !user) return;
    const scheduleRefresh = () => {
      clearTimeout(dashboardRefreshTimer);
      dashboardRefreshTimer = setTimeout(async () => {
        try { await refreshDashboardData(); await renderNotifications(); window.bmcRefreshMessageBadge?.(); }
        catch (error) { console.error("Live dashboard refresh failed:", error); }
      }, 250);
    };
    dashboardRealtimeChannel = supabase.channel(`dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, scheduleRefresh)
      .subscribe((status) => { dashboardRealtimeConnected = status === "SUBSCRIBED"; });
    window.addEventListener("pagehide", () => {
      if (dashboardRealtimeChannel) supabase.removeChannel(dashboardRealtimeChannel);
      dashboardRealtimeChannel = null;
    }, { once: true });
  }

  async function refreshDashboardData() {
    const { data: own, error: ownError } = await supabase.from("projects").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (ownError) throw ownError;
    const { data: outgoing, error: appsError } = await supabase.from("applications").select("id,project_id,applicant_id,status,message,created_at,updated_at").eq("applicant_id", user.id).order("created_at", { ascending: false });
    if (appsError) throw appsError;
    const ownIds = (own || []).map((p) => p.id);
    const incomingResult = ownIds.length ? await supabase.from("applications").select("id,project_id,applicant_id,status,message,created_at,updated_at").in("project_id", ownIds).neq("status", "withdrawn") : { data: [], error: null };
    if (incomingResult.error) throw incomingResult.error;
    const allProjectIds = [...new Set([...ownIds, ...(outgoing || []).map((a) => a.project_id)])];
    const externalIds = allProjectIds.filter((id) => !ownIds.includes(id));
    const externalResult = externalIds.length ? await supabase.from("projects").select("*").in("id", externalIds) : { data: [], error: null };
    if (externalResult.error) throw externalResult.error;
    projectById = Object.fromEntries([...(own || []), ...(externalResult.data || [])].map((p) => [p.id, p]));
    const idsForProfiles = [...new Set([...(incomingResult.data || []).map((a) => a.applicant_id), ...(externalResult.data || []).map((p) => p.owner_id)])];
    const profileResult = idsForProfiles.length ? await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", idsForProfiles) : { data: [], error: null };
    if (profileResult.error) throw profileResult.error;
    profileById = Object.fromEntries((profileResult.data || []).map((p) => [p.id, p]));
    const { data: memberRows, error: memberError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (memberError) throw memberError;
    const chatIds = (memberRows || []).map((x) => x.conversation_id);
    const chatResult = chatIds.length ? await supabase.from("conversations").select("id,project_id,created_at").in("id", chatIds).in("project_id", allProjectIds) : { data: [], error: null };
    if (chatResult.error) throw chatResult.error;
    const memberIds = chatIds.length ? await supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", chatIds) : { data: [], error: null };
    if (memberIds.error) throw memberIds.error;
    const memberMap = (memberIds.data || []).reduce((map, row) => { (map[row.conversation_id] ||= []).push(row.user_id); return map; }, {});
    const chats = (chatResult.data || []).map((c) => ({ ...c, memberIds: memberMap[c.id] || [] }));
    dashboardApplications = [...new Map([...(incomingResult.data || []), ...(outgoing || [])].map((app) => [app.id, app])).values()];
    dashboardConversations = chats;
    renderOwned(own || [], dashboardApplications, chats);
  }

  try {
    setupReports();
    supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    const { data: { user: current }, error: authError } = await supabase.auth.getUser();
    if (authError || !current) { location.href = "index.html"; return; }
    user = current;
    const { data: profile, error: profileError } = await supabase.from("profiles").select("display_name,company_name,account_type").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    const name = profile?.display_name || profile?.company_name || "Member";
    const type = profile?.account_type || "creator"; accountType = type;
    const header = $(".collabry-account > span"); if (header) header.textContent = `${name} · ${type === "creator" ? "Creator" : type[0].toUpperCase() + type.slice(1)}`;
    const picker = $("#role"); if (picker) { picker.value = type; picker.disabled = true; }
    const title = $("#page-title"); if (title) title.textContent = type === "creator" ? "Creator project dashboard" : type === "agency" ? "Agency project dashboard" : "Brand project dashboard";
    const create = $("#create-project"); if (create) create.onclick = () => { location.href = `project-form.html?kind=${type === "creator" ? "creator" : "brand"}`; };
    $("#apply-date")?.addEventListener("click", () => setTimeout(syncDashboardDates, 0));
    $("#date-from")?.addEventListener("change", () => document.querySelector('[data-preset="custom"]')?.classList.add("active"));
    $("#date-to")?.addEventListener("change", () => document.querySelector('[data-preset="custom"]')?.classList.add("active"));
    await refreshDashboardData();
    await renderNotifications();
    connectDashboardRealtime();
    window.bmcRefreshMessageBadge?.();
    setInterval(() => { if (!dashboardRealtimeConnected && !document.hidden) { refreshDashboardData().catch(() => {}); renderNotifications().catch(() => {}); window.bmcRefreshMessageBadge?.(); } }, 30000);
    document.body.classList.add("bmc-dashboard-ready");
  } catch (error) {
    console.error("Live dashboard could not load:", error);
    ["#range-summary", "#creator-range-summary", "#agency-projects-summary"].forEach((selector) => { const node = $(selector); if (node) node.textContent = "Live data could not be loaded. Refresh or check your connection."; });
    toast(error.message || "Live dashboard data could not be loaded.");
    document.body.classList.add("bmc-dashboard-ready");
  }
})();

