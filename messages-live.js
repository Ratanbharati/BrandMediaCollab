// Live one-to-one conversations backed by Supabase conversations and messages.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2800); } };
  let supabase, user, activeId = null, poller = null, selectedActivityProject = "all", activityRefresh = null;
  const conversationNode = $("#conversation");
  const threadNode = $("#thread-list");
  const input = $("#message-input");
  const sendButton = $("#send");
  $(".campaign-box")?.remove();
  threadNode.innerHTML = '<div class="system-note">Loading your conversations…</div>';
  $("#chat-name").textContent = "Loading messages…"; $("#chat-title").textContent = ""; $("#context-title").textContent = "";
  showMessage("Loading your conversation history…");

  function showMessage(message) {
    conversationNode.innerHTML = `<div class="system-note">${esc(message)}</div>`;
  }
  function appendMessage(message) {
    const row = document.createElement("div");
    row.className = `msg ${message.sender_id === user.id ? "mine" : "theirs"}`;
    const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = message.sender_id === user.id ? "You" : "•";
    const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = message.body;
    const time = document.createElement("time"); time.textContent = new Date(message.created_at).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" }); bubble.append(time);
    row.append(avatar, bubble); conversationNode.append(row);
  }
  async function loadMessages(id) {
    const { data, error } = await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id", id).order("created_at", { ascending: true });
    if (error) throw error;
    conversationNode.innerHTML = "";
    if (!data?.length) showMessage("This conversation is ready. Send the first message.");
    else data.forEach(appendMessage);
    conversationNode.scrollTop = conversationNode.scrollHeight;
  }
  async function selectConversation(item) {
    activeId = item.id;
    $("#chat-name").textContent = item.otherName;
    $("#chat-name").href = `my-profile.html?user=${encodeURIComponent(item.otherId)}`;
    $("#chat-title").textContent = item.projectName;
    $("#context-title").textContent = item.projectName;
    $("#chat-avatar").textContent = item.otherName.slice(0, 2).toUpperCase();
    if (item.projectId) { selectedActivityProject = item.projectId; await renderProjectActivity().catch((activityError) => { console.error("Project activity refresh failed:", activityError); }); }
    $("#messages").classList.add("show-chat");
    $(".chat-head").style.display = ""; $(".context").style.display = ""; $(".compose").style.display = "";
    $("#chat-project-link")?.setAttribute("href", `my-projects.html`);
    [...threadNode.querySelectorAll(".thread")].forEach((node) => node.classList.toggle("active", node.dataset.id === item.id));
    await loadMessages(item.id);
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("type", "new_message").eq("conversation_id", item.id).is("read_at", null);
    window.bmcRefreshMessageBadge?.();
    if (poller) clearInterval(poller);
    poller = setInterval(() => { if (activeId === item.id && !document.hidden) loadMessages(item.id).catch(() => {}); }, 5000);
  }
  async function createConversation(projectId, otherId, projectName, otherName) {
    const { data: existing, error: listError } = await supabase.from("conversations").select("id,project_id,created_by").eq("project_id", projectId);
    if (listError) throw listError;
    for (const conv of existing || []) {
      const { data: members } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conv.id);
      if ((members || []).some((m) => m.user_id === otherId) && (members || []).some((m) => m.user_id === user.id)) {
        return selectConversation({ id: conv.id, projectId, projectName, otherId, otherName });
      }
    }
    const { data: conv, error: createError } = await supabase.from("conversations").insert({ project_id: projectId, created_by: user.id, is_group: false }).select("id").single();
    if (createError) throw createError;
    const { error: membersError } = await supabase.from("conversation_members").insert([{ conversation_id: conv.id, user_id: user.id }, { conversation_id: conv.id, user_id: otherId }]);
    if (membersError) throw membersError;
    const item = { id: conv.id, projectId, projectName, otherId, otherName };
    await selectConversation(item);
    await renderThreads();
  }
  async function renderThreads() {
    threadNode.innerHTML = "";
    const { data: memberships, error: memberError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (memberError) throw memberError;
    const ids = [...new Set((memberships || []).map((row) => row.conversation_id))];
    let conversations = [];
    if (ids.length) {
      const { data, error } = await supabase.from("conversations").select("id,project_id,created_by,created_at").in("id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      conversations = data || [];
    }
    if (!conversations.length) threadNode.innerHTML = '<div class="system-note">No conversations yet. Accepted collaborations will appear here.</div>';
    const projectIds = [...new Set(conversations.map((c) => c.project_id).filter(Boolean))];
    const { data: members } = ids.length ? await supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids) : { data: [] };
    const otherIds = [...new Set((members || []).map((m) => m.user_id).filter((id) => id !== user.id))];
    const { data: profiles } = otherIds.length ? await supabase.from("profiles").select("id,display_name,company_name").in("id", otherIds) : { data: [] };
    const { data: projects } = projectIds.length ? await supabase.from("projects").select("id,project_name").in("id", projectIds) : { data: [] };
    const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const projectById = Object.fromEntries((projects || []).map((p) => [p.id, p]));
    const items = [];
    for (const conv of conversations) {
      const otherId = (members || []).find((m) => m.conversation_id === conv.id && m.user_id !== user.id)?.user_id;
      if (!otherId) continue;
      const p = profileById[otherId] || {};
      const item = { id: conv.id, projectId: conv.project_id, projectName: projectById[conv.project_id]?.project_name || "Collaboration chat", otherId, otherName: p.display_name || p.company_name || "Member" };
      items.push(item);
      const button = document.createElement("button"); button.className = "thread"; button.dataset.id = item.id;
      button.innerHTML = `<span class="avatar">${esc(item.otherName.slice(0, 2).toUpperCase())}</span><span class="thread-info"><span class="thread-top"><b>${esc(item.otherName)}</b></span><span class="subject">${esc(item.projectName)}</span><span class="preview">Open conversation</span></span>`;
      button.addEventListener("click", () => selectConversation(item).catch((error) => toast(error.message)));
      threadNode.append(button);
    }
    if (activeId) { const active = items.find((item) => item.id === activeId); if (active) [...threadNode.querySelectorAll(".thread")].find((node) => node.dataset.id === activeId)?.classList.add("active"); }
    await renderAcceptedPartners(conversations, members || []);
  }
  async function renderProjectActivity() {
    const list = $(".list"); if (!list || !supabase || !user) return;
    let panel = $("#bmc-project-activity");
    if (!panel) {
      panel = document.createElement("section"); panel.id = "bmc-project-activity"; panel.className = "campaign-box";
      panel.setAttribute("aria-label", "Compact project activity dashboard");
      panel.innerHTML = '<div class="camp-top"><b>Project snapshot</b><span>Live totals</span></div><select id="bmc-activity-project" aria-label="Choose a project for activity counts"><option value="all">All projects</option></select><div class="camp-stats"><div class="camp-stat"><b id="bmc-activity-apps">0</b><span>Interests</span></div><div class="camp-stat"><b id="bmc-activity-chats">0</b><span>Chats</span></div><div class="camp-stat"><b id="bmc-activity-messages">0</b><span>Messages</span></div><div class="camp-stat"><b id="bmc-activity-unread">0</b><span>Unread</span></div></div><div class="readline" id="bmc-activity-context">Choose a project to see its activity.</div><a href="dashboard.html" style="display:block;margin:7px 0 0;color:#54763f;font-size:10px">Open full dashboard →</a>';
      const threadHost = $("#thread-list"); threadHost?.before(panel);
      $("#bmc-activity-project").addEventListener("change", (event) => { selectedActivityProject = event.target.value; renderProjectActivity().catch((error) => toast(error.message)); });
    }
    const { data: owned, error: ownError } = await supabase.from("projects").select("id,project_name,project_type,owner_id").eq("owner_id", user.id); if (ownError) throw ownError;
    const { data: outgoing, error: outError } = await supabase.from("applications").select("project_id").eq("applicant_id", user.id); if (outError) throw outError;
    const memberships = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id); if (memberships.error) throw memberships.error;
    const convIds = [...new Set((memberships.data || []).map((r) => r.conversation_id))];
    const chats = convIds.length ? await supabase.from("conversations").select("id,project_id").in("id", convIds) : { data: [], error: null }; if (chats.error) throw chats.error;
    const ids = [...new Set([...(owned || []).map((p) => p.id), ...(outgoing || []).map((a) => a.project_id), ...(chats.data || []).map((c) => c.project_id).filter(Boolean)])];
    const projectResult = ids.length ? await supabase.from("projects").select("id,project_name,project_type,owner_id").in("id", ids) : { data: [], error: null }; if (projectResult.error) throw projectResult.error;
    const projectMap = Object.fromEntries((projectResult.data || []).map((p) => [p.id, p]));
    const ownedIds = (owned || []).map((p) => p.id);
    const incoming = ownedIds.length ? await supabase.from("applications").select("id,project_id").in("project_id", ownedIds) : { data: [], error: null }; if (incoming.error) throw incoming.error;
    const sentByProject = (outgoing || []).reduce((m, a) => { m[a.project_id] = (m[a.project_id] || 0) + 1; return m; }, {});
    const appByProject = (incoming.data || []).reduce((m, a) => { m[a.project_id] = (m[a.project_id] || 0) + 1; return m; }, { ...sentByProject });
    const chatsByProject = (chats.data || []).reduce((m, c) => { if (c.project_id) (m[c.project_id] ||= []).push(c.id); return m; }, {});
    const allChatIds = (chats.data || []).map((c) => c.id);
    const messageResult = allChatIds.length ? await supabase.from("messages").select("id,conversation_id").in("conversation_id", allChatIds) : { data: [], error: null }; if (messageResult.error) throw messageResult.error;
    const unreadResult = await supabase.from("notifications").select("id,conversation_id").eq("user_id", user.id).eq("type", "new_message").is("read_at", null); const unreadRows = unreadResult.error ? [] : unreadResult.data || [];
    const select = $("#bmc-activity-project"); const prev = selectedActivityProject;
    if (select) { select.innerHTML = '<option value="all">All projects</option>' + ids.map((id) => `<option value="${esc(id)}">${esc(projectMap[id]?.project_name || "Project")}</option>`).join(""); if (prev !== "all" && ids.includes(prev)) select.value = prev; else { selectedActivityProject = "all"; select.value = "all"; } }
    const scopeIds = selectedActivityProject === "all" ? ids : [selectedActivityProject];
    const appCount = scopeIds.reduce((n, id) => n + (appByProject[id] || 0), 0);
    const selectedChatIds = scopeIds.flatMap((id) => chatsByProject[id] || []);
    const messageCount = (messageResult.data || []).filter((m) => selectedChatIds.includes(m.conversation_id)).length;
    const unreadCount = unreadRows.filter((n) => selectedChatIds.includes(n.conversation_id)).length;
    $("#bmc-activity-apps").textContent = appCount; $("#bmc-activity-chats").textContent = selectedChatIds.length; $("#bmc-activity-messages").textContent = messageCount; $("#bmc-activity-unread").textContent = unreadCount;
    const project = selectedActivityProject === "all" ? null : projectMap[selectedActivityProject];
    $("#bmc-activity-context").textContent = project ? `${project.project_type === "creator_idea" ? "Creator idea" : "Brand project"} · ${project.owner_id === user.id ? "You posted this" : "You applied"}` : `${ids.length} projects with activity on this account.`;
  }
  async function renderAcceptedPartners(conversations, members) {
    const { data: owned, error: ownError } = await supabase.from("projects").select("id,project_name,owner_id").eq("owner_id", user.id);
    if (ownError) throw ownError;
    const ownedIds = (owned || []).map((p) => p.id);
    let received = [];
    if (ownedIds.length) {
      const { data, error } = await supabase.from("applications").select("project_id,applicant_id,status").in("project_id", ownedIds).eq("status", "working_together");
      if (error) throw error; received = data || [];
    }
    const { data: myApps, error: appError } = await supabase.from("applications").select("project_id,status").eq("applicant_id", user.id).eq("status", "working_together");
    if (appError) throw appError;
    const appIds = [...new Set((myApps || []).map((a) => a.project_id).filter((id) => !ownedIds.includes(id)))];
    let appliedProjects = [];
    if (appIds.length) {
      const { data, error } = await supabase.from("projects").select("id,project_name,owner_id").in("id", appIds);
      if (error) throw error; appliedProjects = data || [];
    }
    const opportunities = [
      ...(owned || []).flatMap((project) => received.filter((app) => app.project_id === project.id).map((app) => ({ projectId: project.id, projectName: project.project_name, otherId: app.applicant_id }))),
      ...(appliedProjects || []).map((project) => ({ projectId: project.id, projectName: project.project_name, otherId: project.owner_id })),
    ];
    const existingPairs = new Set();
    for (const conv of conversations) {
      const pair = (members || []).filter((m) => m.conversation_id === conv.id).map((m) => m.user_id).sort().join(":");
      if (pair) existingPairs.add(`${conv.project_id}:${pair}`);
    }
    const filtered = opportunities.filter((o) => !existingPairs.has(`${o.projectId}:${[user.id, o.otherId].sort().join(":")}`));
    if (!filtered.length) return;
    const otherIds = [...new Set(filtered.map((x) => x.otherId).filter(Boolean))];
    const { data: people, error: peopleError } = await supabase.from("profiles").select("id,display_name,company_name").in("id", otherIds);
    if (peopleError) throw peopleError;
    const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
    const heading = document.createElement("div"); heading.className = "system-note"; heading.textContent = "Accepted collaborations · start a conversation"; threadNode.append(heading);
    for (const opportunity of filtered) {
      const person = byId[opportunity.otherId]; if (!person) continue;
      const otherName = person.display_name || person.company_name || "Member";
      const button = document.createElement("button"); button.className = "thread";
      button.innerHTML = `<span class="avatar">${esc(otherName.slice(0, 2).toUpperCase())}</span><span class="thread-info"><span class="thread-top"><b>${esc(otherName)}</b></span><span class="subject">${esc(opportunity.projectName)}</span><span class="preview">Start project chat</span></span>`;
      button.addEventListener("click", () => createConversation(opportunity.projectId, opportunity.otherId, opportunity.projectName, otherName).catch((error) => toast(error.message)));
      threadNode.append(button);
    }
  }
  async function sendMessage() {
    const body = input.value.trim();
    if (!body || !activeId) { if (!activeId) toast("Open an accepted-collaboration chat first."); return; }
    sendButton.disabled = true;
    const { error } = await supabase.from("messages").insert({ conversation_id: activeId, sender_id: user.id, body });
    sendButton.disabled = false;
    if (error) { toast(error.message); return; }
    input.value = "";
    await loadMessages(activeId);
    await renderProjectActivity().catch((activityError) => console.error("Could not refresh project activity:", activityError));
  }

  try {
    supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    const { data: { user: current }, error } = await supabase.auth.getUser();
    if (error || !current) { location.href = "index.html"; return; }
    user = current;
    // Remove the static demo campaign counters, demo threads, and mock message composer behavior.
    $(".campaign-box")?.remove(); $("#bulk-modal")?.remove(); $("#meeting-modal")?.remove(); $("#schedule")?.remove(); $("#meet-inline")?.remove();
    threadNode.querySelectorAll(".thread").forEach((node) => node.remove());
    const segmented = document.querySelector(".seg"); if (segmented) segmented.remove();
    if (sendButton) sendButton.onclick = null;
    if (input) input.onkeydown = null;
    document.querySelectorAll(".list-title button").forEach((button) => { button.onclick = null; button.addEventListener("click", () => toast("Chats start after both people accept a project application.")); });
    $("#thread-search")?.addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); threadNode.querySelectorAll(".thread").forEach((node) => node.classList.toggle("hidden", !node.textContent.toLowerCase().includes(query))); });
    $("#back")?.addEventListener("click", () => $("#messages").classList.remove("show-chat"));
    sendButton?.addEventListener("click", sendMessage);
    input?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
    await renderProjectActivity().catch((activityError) => { console.error("Initial project activity could not load:", activityError); const context = $("#bmc-activity-context"); if (context) context.textContent = "Project counts could not load. Refresh to try again."; });
    await renderThreads();
    if (!activeId) { $("#chat-name").textContent = "No conversation selected"; $("#chat-name").removeAttribute("href"); $("#chat-title").textContent = ""; $("#context-title").textContent = "Select a conversation"; $("#chat-avatar").textContent = "—"; $(".chat-head").style.display = "none"; $(".context").style.display = "none"; $(".compose").style.display = "none"; showMessage("Your replies and conversations appear here. Express interest in a project to start a private chat."); }
    activityRefresh = setInterval(() => renderProjectActivity().catch((error) => console.error("Project activity refresh failed:", error)), 20000);
  } catch (error) {
    console.error("Messages could not load:", error);
    threadNode.innerHTML = "";
    $("#chat-name").textContent = "No conversation selected"; $("#chat-title").textContent = ""; $("#context-title").textContent = "Select a conversation"; $("#chat-avatar").textContent = "—"; $(".chat-head").style.display = "none"; $(".context").style.display = "none"; $(".compose").style.display = "none";
    showMessage(error.message || "Your conversations could not be loaded.");
    toast(error.message || "Your conversations could not be loaded.");
  }
})();
