// Account dashboard: posts owned by this account and applications sent by it
// are shown in separate reports. Applicant and message records stay in their
// own tables and are joined by project/user ids.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 3200); } };
  let supabase, user, accountType = "creator", projectById = {}, profileById = {}, dashboardApplications = [], dashboardConversations = [];
  let dashboardRealtimeChannel = null, dashboardRealtimeConnected = false, dashboardRefreshTimer = null;

  function setupReports() {
    const layout = $(".layout"); if (!layout) return;
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
    const celebrityPanel = makePanel("celebrity-projects-panel", "Celebrity projects", "celebrity-projects-summary", "celebrity-projects-body", "celebrity-projects-empty", "Interested partners");
    const eventPanel = makePanel("event-projects-panel", "Event projects", "event-projects-summary", "event-projects-body", "event-projects-empty", "Interested partners");
    const mediaPanel = makePanel("media-projects-panel", "Media projects", "media-projects-summary", "media-projects-body", "media-projects-empty", "Interested partners");
    const communityPanel = makePanel("community-projects-panel", "Community projects", "community-projects-summary", "community-projects-body", "community-projects-empty", "Interested partners");
    const distributorPanel = makePanel("distributor-projects-panel", "Distribution partnerships", "distributor-projects-summary", "distributor-projects-body", "distributor-projects-empty", "Interested partners");
    const freelancerPanel = makePanel("freelancer-projects-panel", "Freelance assignments", "freelancer-projects-summary", "freelancer-projects-body", "freelancer-projects-empty", "Interested clients");
    if (postsPanel && sentPanel) { postsPanel.after(creatorPanel); creatorPanel.after(agencyPanel); agencyPanel.after(celebrityPanel); celebrityPanel.after(eventPanel); eventPanel.after(mediaPanel); mediaPanel.after(communityPanel); communityPanel.after(distributorPanel); distributorPanel.after(freelancerPanel); }
    const rolePicker = $("#role"); if (rolePicker) rolePicker.hidden = true;
    const insight = $(".insight"); if (insight) insight.innerHTML = '<b>How it works:</b> Projects and ideas for all nine account types stay in the same collaboration network and are grouped by the account that posted them. “Applications sent” is your interest in other people’s posts. Each conversation is private and one-to-one. A bulk update sends the same message separately to accepted collaborators.';
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

  function openApplicants(projectId, focusApplicationId = "") {
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
      return `<article data-application-id="${esc(app.id)}" style="border-top:1px solid #e5e8df;padding:14px 0;display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,2fr) auto;gap:12px;align-items:center"><div><b>${esc(name)}</b><div>${esc(profile.account_type || "Member")} · ${new Date(app.created_at).toLocaleDateString()}</div></div><div>${esc(app.message || "No note included")}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><select data-status="${esc(app.id)}"><option value="interested">Interested</option><option value="working_together">Work together</option><option value="rejected">Pass</option></select><button data-chat="${esc(app.id)}">Open chat</button></div></article>`;
    }).join("") : '<p>No one has expressed interest in this post yet.</p>';
    items.forEach((app) => {
      const select = $(`[data-status="${CSS.escape(app.id)}"]`), button = $(`[data-chat="${CSS.escape(app.id)}"]`);
      if (select) { select.value = app.status; select.onchange = async () => {
        const previous = app.status; select.disabled = true;
        const { error } = await supabase.from("applications").update({ status: select.value, updated_at: new Date().toISOString() }).eq("id", app.id);
        select.disabled = false;
        if (error) { select.value = previous; toast(error.message || "Could not update this application."); return; }
        app.status = select.value; if (button) { button.disabled = app.status !== "working_together"; button.textContent = button.disabled ? "Accept to chat" : "Open chat"; }
        toast("Application status updated."); await refreshDashboardData();
      }; }
      if (button) { button.disabled = app.status !== "working_together"; button.textContent = button.disabled ? "Accept to chat" : "Open chat"; button.onclick = async () => {
        if (app.status !== "working_together") return toast("Accept the collaboration before starting a project chat.");
        button.disabled = true; try { const id = await ensureChat(projectId, app.applicant_id); location.href = `messages.html?conversation=${encodeURIComponent(id)}`; } catch (error) { toast(error.message || "Could not open this project chat."); button.disabled = false; }
      }; }
    });
    const focusedApplication = focusApplicationId && modal.querySelector(`[data-application-id="${CSS.escape(focusApplicationId)}"]`);
    if (focusedApplication) {
      focusedApplication.style.outline = "2px solid #91ba68";
      focusedApplication.style.outlineOffset = "3px";
      focusedApplication.scrollIntoView({ block: "center", behavior: "smooth" });
      focusedApplication.querySelector("select")?.focus({ preventScroll: true });
    }
  }

  async function bulkMessage(projectId) {
    const project = projectById[projectId]; const recipients = (project?.applications || []).filter((app) => app.status === "working_together");
    if (!recipients.length) return toast("Accept an application first. Project chats are available to accepted collaborators.");
    const text = prompt(`Send a private message about “${project.project_name}” to ${recipients.length} accepted collaborator(s). Each person gets a separate private message:`);
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
      toast(failed.length ? `Sent to ${sent} of ${recipients.length}; ${failed.length} message(s) failed.` : `Sent privately to ${sent} accepted collaborator(s).`);
    } catch (error) { toast(error.message || "Could not send the project update."); }
  }

  function renderOwned(owned, applications, conversations) {
    const ownBody = $("#table-body"); const creatorIdeaBody = $("#creator-ideas-body"); const agencyBody = $("#agency-projects-body"); const celebrityBody = $("#celebrity-projects-body"); const eventBody = $("#event-projects-body"); const mediaBody = $("#media-projects-body"); const communityBody = $("#community-projects-body"); const distributorBody = $("#distributor-projects-body"); const freelancerBody = $("#freelancer-projects-body"); const sentBody = $("#creator-table-body");
    const ownedIds = new Set(owned.map((p) => p.id));
    const forProject = Object.fromEntries(owned.map((project) => [project.id, applications.filter((app) => app.project_id === project.id)]));
    for (const project of owned) project.applications = forProject[project.id] || [];
    const chatCounts = conversations.reduce((out, chat) => { if (chat.project_id) out[chat.project_id] = (out[chat.project_id] || 0) + 1; return out; }, {});
    const kindOf = () => accountType;
    const brandPosts = owned.filter((p) => kindOf(p) === "brand");
    const creatorPosts = owned.filter((p) => kindOf(p) === "creator");
    const agencyPosts = owned.filter((p) => kindOf(p) === "agency");
    const celebrityPosts = owned.filter((p) => kindOf(p) === "celebrity");
    const eventPosts = owned.filter((p) => kindOf(p) === "event");
    const mediaPosts = owned.filter((p) => kindOf(p) === "media");
    const communityPosts = owned.filter((p) => kindOf(p) === "community");
    const distributorPosts = owned.filter((p) => kindOf(p) === "distributor");
    const freelancerPosts = owned.filter((p) => kindOf(p) === "freelancer");
    const renderProjectRows = (posts) => posts.map((p) => {
      const rows = forProject[p.id] || []; const interested = rows.filter((x) => x.status === "interested").length;
      const together = rows.filter((x) => x.status === "working_together").length; const rejected = rows.filter((x) => x.status === "rejected").length;
      const label = ({ agency: "Agency project", creator: "Creator idea", celebrity: "Celebrity project", event: "Event project", media: "Media project", brand: "Brand project", community: "Community partnership", distributor: "Distribution partnership", freelancer: "Freelance assignment" })[kindOf(p)];
      return `<tr class="data-row" data-role="${esc(kindOf(p))}" data-project-id="${esc(p.id)}" data-date="${esc((p.created_at || "").slice(0,10))}" data-project="${esc(p.project_name)}" data-recipients="${interested}"><td class="project-cell"><b>${esc(p.project_name)}</b><span>${label} · ${esc(p.category)}</span></td><td>${esc(p.status)}</td><td><span class="metric">${rows.length}</span></td><td><span class="metric">${interested}</span></td><td><span class="metric">${together}</span></td><td><span class="metric">${rejected}</span></td><td><span class="metric">${chatCounts[p.id] || 0}</span></td><td><div class="row-actions"><button class="action" data-applicants="${esc(p.id)}">View responses (${rows.length})</button><button class="action primary-action" data-bulk="${esc(p.id)}">Message interested</button></div></td></tr>`;
    }).join("");
    if (ownBody) ownBody.innerHTML = renderProjectRows(brandPosts);
    if (creatorIdeaBody) creatorIdeaBody.innerHTML = renderProjectRows(creatorPosts);
    if (agencyBody) agencyBody.innerHTML = renderProjectRows(agencyPosts);
    if (celebrityBody) celebrityBody.innerHTML = renderProjectRows(celebrityPosts);
    if (eventBody) eventBody.innerHTML = renderProjectRows(eventPosts);
    if (mediaBody) mediaBody.innerHTML = renderProjectRows(mediaPosts);
    if (communityBody) communityBody.innerHTML = renderProjectRows(communityPosts);
    if (distributorBody) distributorBody.innerHTML = renderProjectRows(distributorPosts);
    if (freelancerBody) freelancerBody.innerHTML = renderProjectRows(freelancerPosts);
    const externalApps = applications.filter((app) => !ownedIds.has(app.project_id));
    if (sentBody) sentBody.innerHTML = externalApps.map((app) => {
      const project = projectById[app.project_id] || {}; const owner = profileById[project.owner_id] || {};
      const name = owner.display_name || owner.company_name || "Project owner";
      const chat = conversations.find((c) => c.project_id === app.project_id && c.memberIds?.includes(project.owner_id));
      return `<tr class="data-row" data-role="applications" data-date="${esc((app.created_at || "").slice(0,10))}" data-project="${esc(project.project_name || "Project")}"><td class="project-cell"><b>${esc(project.project_name || "Project")}</b><span>${esc(project.category || "")}</span></td><td>${esc(name)}</td><td>${esc(app.status)}</td><td>${esc(app.message || "—")}</td><td>${new Date(app.created_at).toLocaleDateString()}</td><td colspan="2">${chat ? "Private chat ready" : "No chat yet"}</td><td><button class="action primary-action" data-open-chat="${esc(app.project_id)}" data-other="${esc(project.owner_id || "")}" ${app.status !== "working_together" ? "disabled title=\"Chat opens after the project owner accepts your application.\"" : ""}>${app.status === "working_together" ? "Open chat" : "Accept to chat"}</button></td></tr>`;
    }).join("");
    [ownBody, creatorIdeaBody, agencyBody, celebrityBody, eventBody, mediaBody, communityBody, distributorBody, freelancerBody].filter(Boolean).forEach((body) => {
      body.querySelectorAll("[data-applicants]").forEach((button) => button.onclick = () => openApplicants(button.dataset.applicants));
      body.querySelectorAll("[data-bulk]").forEach((button) => button.onclick = () => bulkMessage(button.dataset.bulk));
    });
    if (sentBody) sentBody.querySelectorAll("[data-open-chat]").forEach((button) => button.onclick = async () => { if (button.disabled) return; button.disabled = true; try { const id = await ensureChat(button.closest("tr").querySelector("[data-open-chat]").dataset.openChat, button.dataset.other); location.href = `messages.html?conversation=${encodeURIComponent(id)}`; } catch (error) { toast(error.message || "Chat opens after the project owner accepts your application."); button.disabled = false; } });
    const setEmpty = (id, list, text) => { const el = $(id); if (el) { el.textContent = text; el.style.display = list.length ? "none" : "block"; } };
    setEmpty("#empty", brandPosts, "No brand projects have been posted yet.");
    setEmpty("#creator-ideas-empty", creatorPosts, "No creator ideas have been posted yet.");
    setEmpty("#agency-projects-empty", agencyPosts, "No agency projects have been posted yet.");
    setEmpty("#celebrity-projects-empty", celebrityPosts, "No celebrity projects have been posted yet.");
    setEmpty("#event-projects-empty", eventPosts, "No event projects have been posted yet.");
    setEmpty("#media-projects-empty", mediaPosts, "No media projects have been posted yet.");
    setEmpty("#community-projects-empty", communityPosts, "No community partnerships have been posted yet.");
    setEmpty("#distributor-projects-empty", distributorPosts, "No distribution partnerships have been posted yet.");
    setEmpty("#freelancer-projects-empty", freelancerPosts, "No freelance assignments have been posted yet.");
    const sentEmpty = $("#creator-empty"); if (sentEmpty) sentEmpty.style.display = externalApps.length ? "none" : "block";
    const summary = (rows) => `${rows.length} post${rows.length === 1 ? "" : "s"} · ${rows.reduce((n,p) => n + (forProject[p.id] || []).length, 0)} responses received`;
    const brandSummary = $("#range-summary"); if (brandSummary) brandSummary.textContent = summary(brandPosts);
    const creatorSummary = $("#creator-ideas-summary"); if (creatorSummary) creatorSummary.textContent = summary(creatorPosts);
    const agencySummary = $("#agency-projects-summary"); if (agencySummary) agencySummary.textContent = summary(agencyPosts);
    for (const [id, rows] of [["#celebrity-projects-summary", celebrityPosts], ["#event-projects-summary", eventPosts], ["#media-projects-summary", mediaPosts], ["#community-projects-summary", communityPosts], ["#distributor-projects-summary", distributorPosts], ["#freelancer-projects-summary", freelancerPosts]]) { const node = $(id); if (node) node.textContent = summary(rows); }
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
      ["#celebrity-projects-body", "#celebrity-projects-empty", "#celebrity-projects-summary", "projects"],
      ["#event-projects-body", "#event-projects-empty", "#event-projects-summary", "projects"],
      ["#media-projects-body", "#media-projects-empty", "#media-projects-summary", "projects"],
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

  function connectDashboardRealtime() {
    if (dashboardRealtimeChannel || !supabase || !user) return;
    const scheduleRefresh = () => {
      clearTimeout(dashboardRefreshTimer);
      dashboardRefreshTimer = setTimeout(async () => {
        try { await refreshDashboardData();  }
        catch (error) { console.error("Live dashboard refresh failed:", error); }
      }, 250);
    };
    dashboardRealtimeChannel = supabase.channel(`dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleRefresh)
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
    const roleLabel = ({ creator: "Creator", brand: "Brand", agency: "Agency", celebrity: "Celebrity", event: "Event", media: "Media", community: "Community", distributor: "Distributor", freelancer: "Freelancer" })[type] || "Member";
    const header = $(".collabry-account > span"); if (header) header.textContent = `${name} · ${roleLabel}`;
    const picker = $("#role"); if (picker) { picker.value = type; picker.disabled = true; }
    const title = $("#page-title"); if (title) title.textContent = `${roleLabel} project dashboard`;
    const create = $("#create-project"); if (create) create.onclick = () => { location.href = `project-form.html?kind=${type}`; };
    $("#apply-date")?.addEventListener("click", () => setTimeout(syncDashboardDates, 0));
    $("#date-from")?.addEventListener("change", () => document.querySelector('[data-preset="custom"]')?.classList.add("active"));
    $("#date-to")?.addEventListener("change", () => document.querySelector('[data-preset="custom"]')?.classList.add("active"));
    await refreshDashboardData();
    
    const params = new URLSearchParams(location.search);
    const targetProject = params.get("project");
    if (targetProject && projectById[targetProject]) openApplicants(targetProject, params.get("application") || "");
    connectDashboardRealtime();
    
    setInterval(() => { if (!dashboardRealtimeConnected && !document.hidden) { refreshDashboardData().catch(() => {}); } }, 30000);
    document.body.classList.add("bmc-dashboard-ready");
  } catch (error) {
    console.error("Live dashboard could not load:", error);
    ["#range-summary", "#creator-range-summary", "#agency-projects-summary"].forEach((selector) => { const node = $(selector); if (node) node.textContent = "Live data could not be loaded. Refresh or check your connection."; });
    toast(error.message || "Live dashboard data could not be loaded.");
    document.body.classList.add("bmc-dashboard-ready");
  }
})();


