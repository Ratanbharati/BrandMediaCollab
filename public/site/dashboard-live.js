// Account dashboard: posts owned by this account and applications sent by it
// are shown in separate reports. Applicant and message records stay in their
// own tables and are joined by project/user ids.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 3200); } };
  let supabase, user, projectById = {}, profileById = {};

  function setupReports() {
    const layout = $(".layout"); if (!layout) return;
    const notice = document.createElement("section"); notice.id = "activity-notifications";
    notice.className = "panel table-panel"; notice.style.cssText = "margin:0 0 14px;padding:14px 16px";
    notice.innerHTML = '<div class="table-head" style="padding:0 0 9px"><h2>Recent notifications</h2><span id="notification-caption">New interest and message activity for this account</span></div><div id="notification-list" style="display:grid;gap:8px"></div>';
    layout.prepend(notice);
    $("#table-title").textContent = "Projects posted by this account";
    $("#table-head")?.replaceChildren();
    const postsPanel = $("#table-body")?.closest(".table-panel");
    const sentPanel = $("#creator-table-body")?.closest(".table-panel");
    const firstHead = postsPanel?.querySelector(".table-head h2"); if (firstHead) firstHead.textContent = "Projects posted by this account";
    const firstSpan = postsPanel?.querySelector(".table-head span"); if (firstSpan) firstSpan.textContent = "Incoming interest, decisions, and private chats";
    const secondHead = sentPanel?.querySelector(".table-head h2"); if (secondHead) secondHead.textContent = "Applications sent to other accounts";
    const secondSpan = sentPanel?.querySelector(".table-head span"); if (secondSpan) secondSpan.textContent = "Your activity on other members’ projects";
    const heads = postsPanel?.querySelector("thead tr");
    if (heads) heads.innerHTML = "<th>Project</th><th>Status</th><th>Responses</th><th>Interested</th><th>Working together</th><th>Passed</th><th>Chats</th><th>Actions</th>";
    const secondHeads = sentPanel?.querySelector("thead tr");
    if (secondHeads) secondHeads.innerHTML = "<th>Project</th><th>Owner</th><th>Application status</th><th>Your note</th><th>Applied</th><th colspan=2>Conversation</th><th>Actions</th>";
    const insight = $(".insight"); if (insight) insight.innerHTML = '<b>How it works:</b> “Projects posted” shows responses to your own posts. “Applications sent” shows your interest in other people’s posts. Each conversation is private and one-to-one. A bulk update sends the same message separately to each interested person.';
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
    items.forEach((app) => { const select = $(`[data-status="${CSS.escape(app.id)}"]`); if (select) { select.value = app.status; select.onchange = async () => { const { error } = await supabase.from("applications").update({ status: select.value, updated_at: new Date().toISOString() }).eq("id", app.id); if (error) toast(error.message); else { app.status = select.value; toast("Application status updated."); } }; } const button = $(`[data-chat="${CSS.escape(app.id)}"]`); if (button) button.onclick = async () => { try { const id = await ensureChat(projectId, app.applicant_id); location.href = `messages.html?conversation=${encodeURIComponent(id)}`; } catch (error) { toast(error.message); } }; });
  }

  async function bulkMessage(projectId) {
    const project = projectById[projectId]; const recipients = (project?.applications || []).filter((app) => ["interested", "working_together"].includes(app.status));
    if (!recipients.length) return toast("There are no interested people to message yet.");
    const text = prompt(`Send a private message about “${project.project_name}” to ${recipients.length} interested person(s). Each person gets a separate private message:`);
    if (!text?.trim()) return;
    try {
      for (const app of recipients) {
        const id = await ensureChat(projectId, app.applicant_id);
        const { error } = await supabase.from("messages").insert({ conversation_id: id, sender_id: user.id, body: text.trim() });
        if (error) throw error;
      }
      toast(`Sent privately to ${recipients.length} interested person(s).`);
    } catch (error) { toast(error.message || "Could not send the project update."); }
  }

  function renderOwned(owned, applications, conversations) {
    const ownBody = $("#table-body"); const creatorBody = $("#creator-table-body");
    const ownedIds = new Set(owned.map((p) => p.id));
    const forProject = Object.fromEntries(owned.map((project) => [project.id, applications.filter((app) => app.project_id === project.id)]));
    for (const project of owned) project.applications = forProject[project.id] || [];
    const chatCounts = conversations.reduce((out, chat) => { if (chat.project_id) out[chat.project_id] = (out[chat.project_id] || 0) + 1; return out; }, {});
    if (ownBody) ownBody.innerHTML = owned.map((p) => {
      const rows = forProject[p.id] || []; const interested = rows.filter((x) => x.status === "interested").length;
      const together = rows.filter((x) => x.status === "working_together").length; const rejected = rows.filter((x) => x.status === "rejected").length;
      return `<tr><td class="project-cell"><b>${esc(p.project_name)}</b><span>${esc(p.project_type === "creator_idea" ? "Creator idea" : "Brand campaign")} · ${esc(p.category)}</span></td><td>${esc(p.status)}</td><td>${rows.length}</td><td>${interested}</td><td>${together}</td><td>${rejected}</td><td>${chatCounts[p.id] || 0}</td><td><div class="row-actions"><button class="action" data-applicants="${esc(p.id)}">View responses (${rows.length})</button><button class="action primary-action" data-bulk="${esc(p.id)}">Message interested</button></div></td></tr>`;
    }).join("");
    const externalApps = applications.filter((app) => !ownedIds.has(app.project_id));
    if (creatorBody) creatorBody.innerHTML = externalApps.map((app) => {
      const project = projectById[app.project_id] || {}; const owner = profileById[project.owner_id] || {};
      const name = owner.display_name || owner.company_name || "Project owner";
      const chat = conversations.find((c) => c.project_id === app.project_id && c.memberIds?.includes(project.owner_id));
      return `<tr><td class="project-cell"><b>${esc(project.project_name || "Project")}</b><span>${esc(project.category || "")}</span></td><td>${esc(name)}</td><td>${esc(app.status)}</td><td>${esc(app.message || "—")}</td><td>${new Date(app.created_at).toLocaleDateString()}</td><td colspan="2">${chat ? "Private chat ready" : "No chat yet"}</td><td><button class="action primary-action" data-open-chat="${esc(app.project_id)}" data-other="${esc(project.owner_id || "")}">Open chat</button></td></tr>`;
    }).join("");
    if (ownBody) ownBody.querySelectorAll("[data-applicants]").forEach((button) => button.onclick = () => openApplicants(button.dataset.applicants));
    if (ownBody) ownBody.querySelectorAll("[data-bulk]").forEach((button) => button.onclick = () => bulkMessage(button.dataset.bulk));
    if (creatorBody) creatorBody.querySelectorAll("[data-open-chat]").forEach((button) => button.onclick = async () => { try { const id = await ensureChat(button.closest("tr").querySelector("[data-open-chat]").dataset.openChat, button.dataset.other); location.href = `messages.html?conversation=${encodeURIComponent(id)}`; } catch (error) { toast(error.message); } });
    const ownEmpty = $("#empty"); if (ownEmpty) ownEmpty.style.display = owned.length ? "none" : "block";
    const sentEmpty = $("#creator-empty"); if (sentEmpty) sentEmpty.style.display = externalApps.length ? "none" : "block";
    const summary = $("#range-summary"); if (summary) summary.textContent = `${owned.length} post${owned.length === 1 ? "" : "s"} · ${applications.filter((a) => ownedIds.has(a.project_id)).length} responses received`;
    const sentSummary = $("#creator-range-summary"); if (sentSummary) sentSummary.textContent = `${externalApps.length} application${externalApps.length === 1 ? "" : "s"} sent to other members’ posts`;
  }

  async function renderNotifications() {
    const host = $("#notification-list"); if (!host) return;
    const { data, error } = await supabase.from("notifications").select("id,type,title,body,project_id,application_id,conversation_id,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15);
    if (error) { host.innerHTML = '<span>Activity alerts will appear here after the notifications update is installed.</span>'; return; }
    host.innerHTML = data?.length ? data.map((n) => `<button data-notification="${esc(n.id)}" data-conversation="${esc(n.conversation_id || "")}" data-project="${esc(n.project_id || "")}" style="text-align:left;border:1px solid #e5e8df;border-radius:9px;background:${n.read_at ? "white" : "#f0f6e9"};padding:10px 12px"><b>${esc(n.title)}</b><div>${esc(n.body)}</div><small>${new Date(n.created_at).toLocaleString()}</small></button>`).join("") : "<span>No new activity yet.</span>";
    host.querySelectorAll("[data-notification]").forEach((button) => button.onclick = async () => {
      const id = button.dataset.notification; await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
      if (button.dataset.conversation) location.href = `messages.html?conversation=${encodeURIComponent(button.dataset.conversation)}`;
      else if (button.dataset.project) { const project = projectById[button.dataset.project]; if (project) openApplicants(project.id); }
      button.style.background = "white";
    });
  }

  async function refreshDashboardData() {
    const { data: own, error: ownError } = await supabase.from("projects").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (ownError) throw ownError;
    const { data: outgoing, error: appsError } = await supabase.from("applications").select("id,project_id,applicant_id,status,message,created_at,updated_at").eq("applicant_id", user.id).order("created_at", { ascending: false });
    if (appsError) throw appsError;
    const ownIds = (own || []).map((p) => p.id);
    const incomingResult = ownIds.length ? await supabase.from("applications").select("id,project_id,applicant_id,status,message,created_at,updated_at").in("project_id", ownIds) : { data: [], error: null };
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
    const chatResult = chatIds.length ? await supabase.from("conversations").select("id,project_id").in("id", chatIds).in("project_id", allProjectIds) : { data: [], error: null };
    if (chatResult.error) throw chatResult.error;
    const memberIds = chatIds.length ? await supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", chatIds) : { data: [], error: null };
    if (memberIds.error) throw memberIds.error;
    const memberMap = (memberIds.data || []).reduce((map, row) => { (map[row.conversation_id] ||= []).push(row.user_id); return map; }, {});
    const chats = (chatResult.data || []).map((c) => ({ ...c, memberIds: memberMap[c.id] || [] }));
    renderOwned(own || [], [...(incomingResult.data || []), ...(outgoing || [])], chats);
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
    const type = profile?.account_type || "creator";
    const header = $(".collabry-account > span"); if (header) header.textContent = `${name} · ${type === "creator" ? "Creator" : type[0].toUpperCase() + type.slice(1)}`;
    const picker = $("#role"); if (picker) { picker.value = type; picker.disabled = true; }
    const title = $("#page-title"); if (title) title.textContent = type === "creator" ? "Creator project dashboard" : type === "agency" ? "Agency project dashboard" : "Brand project dashboard";
    const create = $("#create-project"); if (create) create.onclick = () => { location.href = `project-form.html?kind=${type === "creator" ? "creator" : "brand"}`; };
    await refreshDashboardData();
    await renderNotifications();
    setInterval(() => { refreshDashboardData().catch(() => {}); renderNotifications().catch(() => {}); }, 20000);
    document.body.classList.add("bmc-dashboard-ready");
  } catch (error) {
    console.error("Live dashboard could not load:", error);
    toast(error.message || "Live dashboard data could not be loaded.");
    document.body.classList.add("bmc-dashboard-ready");
  }
})();
