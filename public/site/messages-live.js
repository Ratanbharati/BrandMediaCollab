// Live one-to-one conversations backed by Supabase conversations and messages.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2800); } };
  let supabase, user, activeId = null, poller = null, realtimeChannel = null, realtimeConnected = false;
  let activityTimer = null;
  const conversationNode = $("#conversation");
  const threadNode = $("#thread-list");
  const input = $("#message-input");
  const sendButton = $("#send");

  function ensureActivityPanel() {
    let panel = $("#bmc-project-activity");
    if (!panel) {
      panel = document.createElement("section"); panel.id = "bmc-project-activity"; panel.className = "campaign-box";
      panel.innerHTML = '<div class="camp-top"><b>Project snapshot</b><span>Live</span></div><select id="bmc-activity-project" aria-label="Choose a project"><option value="all">All your project activity</option></select><div class="camp-stats"><div class="camp-stat"><b data-activity="interests">—</b><span>Interests</span></div><div class="camp-stat"><b data-activity="chats">—</b><span>Chats</span></div><div class="camp-stat"><b data-activity="messages">—</b><span>Messages</span></div><div class="camp-stat"><b data-activity="unread">—</b><span>Unread</span></div></div><div class="readline" id="bmc-activity-context">Counts update from your saved project activity.</div>';
      $(".list-head")?.after(panel);
    }
    return panel;
  }
  async function refreshActivity() {
    const panel = ensureActivityPanel(), chooser = $("#bmc-activity-project"); if (!panel || !chooser) return;
    const current = chooser.value || "all";
    const [ownedResult, sentResult] = await Promise.all([
      supabase.from("projects").select("id,project_name,owner_id").eq("owner_id", user.id),
      supabase.from("applications").select("project_id,status").eq("applicant_id", user.id).neq("status", "withdrawn")
    ]);
    if (ownedResult.error) throw ownedResult.error; if (sentResult.error) throw sentResult.error;
    const owned = ownedResult.data || [], sent = sentResult.data || [], ownedIds = owned.map((p) => p.id);
    const appliedIds = [...new Set(sent.map((a) => a.project_id))].filter((id) => !ownedIds.includes(id));
    const { data: appliedProjects, error: appliedError } = appliedIds.length ? await supabase.from("projects").select("id,project_name,owner_id").in("id", appliedIds) : { data: [], error: null };
    if (appliedError) throw appliedError;
    const relevant = [...owned, ...(appliedProjects || [])].sort((a, b) => a.project_name.localeCompare(b.project_name));
    chooser.innerHTML = '<option value="all">All your project activity</option>' + relevant.map((p) => `<option value="${esc(p.id)}">${esc(p.project_name)} · ${ownedIds.includes(p.id) ? "Your post" : "Applied"}</option>`).join("");
    chooser.value = relevant.some((p) => p.id === current) ? current : "all";
    chooser.onchange = () => refreshActivity().catch((e) => { console.error(e); $("#bmc-activity-context").textContent = "Could not refresh project activity."; });
    const projectIds = chooser.value === "all" ? relevant.map((p) => p.id) : [chooser.value];
    let received = [];
    const ownedSelection = projectIds.filter((id) => ownedIds.includes(id));
    if (ownedSelection.length) {
      const { data, error } = await supabase.from("applications").select("id,project_id,applicant_id,status").in("project_id", ownedSelection).neq("status", "withdrawn");
      if (error) throw error; received = data || [];
    }
    const outgoing = sent.filter((a) => projectIds.includes(a.project_id) && !ownedIds.includes(a.project_id));
    const interestCount = received.length + outgoing.length;
    const memberResult = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (memberResult.error) throw memberResult.error;
    const convIds = [...new Set((memberResult.data || []).map((r) => r.conversation_id))];
    let chats = [];
    if (convIds.length) {
      const { data, error } = await supabase.from("conversations").select("id,project_id").in("id", convIds);
      if (error) throw error; chats = (data || []).filter((c) => projectIds.includes(c.project_id));
    }
    const chatIds = chats.map((c) => c.id); let messages = [], unread = 0;
    if (chatIds.length) {
      const { data, error } = await supabase.from("messages").select("id,sender_id,read_at").in("conversation_id", chatIds);
      if (error) throw error; messages = data || []; unread = messages.filter((m) => m.sender_id !== user.id && !m.read_at).length;
      const { count, error: unreadError } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "new_message").is("read_at", null).in("conversation_id", chatIds);
      if (!unreadError) unread = count || 0;
    }
    panel.querySelector('[data-activity="interests"]').textContent = String(interestCount);
    panel.querySelector('[data-activity="chats"]').textContent = String(chats.length);
    panel.querySelector('[data-activity="messages"]').textContent = String(messages.length);
    panel.querySelector('[data-activity="unread"]').textContent = String(unread);
    $("#bmc-activity-context").textContent = chooser.value === "all" ? `${owned.length} posts · ${appliedIds.length} applied projects` : (ownedIds.includes(chooser.value) ? "Your post · incoming interest and chat activity" : "Your application · conversation activity");
  }

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
  function connectRealtime() {
    if (realtimeChannel || !supabase || !user) return;
    const refreshThreads = () => { renderThreads().catch((error) => console.error("Conversation list refresh failed:", error)); refreshActivity().catch(() => {}); };
    realtimeChannel = supabase.channel(`messages-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new || payload.old || {};
        if (payload.eventType === "INSERT" && message.sender_id !== user.id && document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("New project message", { body: "A new message arrived in your collaboration inbox." });
        if (payload.eventType === "INSERT" && message.sender_id !== user.id && (!activeId || message.conversation_id !== activeId)) toast("New message in your collaboration inbox.");
        if (activeId && message.conversation_id === activeId) loadMessages(activeId).catch((error) => console.error("Live message refresh failed:", error));
        refreshThreads(); window.bmcRefreshMessageBadge?.();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => { window.bmcRefreshMessageBadge?.(); refreshActivity().catch(() => {}); })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refreshThreads)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, refreshThreads)
      .subscribe((status) => { realtimeConnected = status === "SUBSCRIBED"; });
    window.addEventListener("pagehide", () => { if (realtimeChannel) supabase.removeChannel(realtimeChannel); realtimeChannel = null; if (poller) clearInterval(poller); if (activityTimer) clearInterval(activityTimer); }, { once: true });
  }
  async function selectConversation(item) {
    activeId = item.id;
    $("#chat-name").textContent = item.otherName;
    $("#chat-name").href = `my-profile.html?user=${encodeURIComponent(item.otherId)}`;
    $("#chat-title").textContent = item.projectName;
    $("#context-title").textContent = item.projectName;
    $("#chat-avatar").textContent = item.otherName.slice(0, 2).toUpperCase();
    $("#messages").classList.add("show-chat");
    $(".compose").style.display = "";
    $(".chat-head").style.display = "";
    $(".context").style.display = "";
    $("#chat-project-link")?.setAttribute("href", `my-projects.html`);
    [...threadNode.querySelectorAll(".thread")].forEach((node) => node.classList.toggle("active", node.dataset.id === item.id));
    await loadMessages(item.id);
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("type", "new_message").eq("conversation_id", item.id).is("read_at", null);
    window.bmcRefreshMessageBadge?.();
    window.dispatchEvent(new CustomEvent("bmc-notifications-updated"));
    refreshActivity().catch(() => {});
    if (poller) { clearInterval(poller); poller = null; }
  }
  async function createConversation(projectId, otherId, projectName, otherName) {
    const { data: existing, error: listError } = await supabase.from("conversations").select("id,project_id,created_by").eq("project_id", projectId);
    if (listError) throw listError;
    for (const conv of existing || []) {
      const { data: members } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conv.id);
      if ((members || []).some((m) => m.user_id === otherId) && (members || []).some((m) => m.user_id === user.id)) {
        return selectConversation({ id: conv.id, projectName, otherId, otherName });
      }
    }
    const { data: conv, error: createError } = await supabase.from("conversations").insert({ project_id: projectId, created_by: user.id, is_group: false }).select("id").single();
    if (createError) throw createError;
    const { error: membersError } = await supabase.from("conversation_members").insert([{ conversation_id: conv.id, user_id: user.id }, { conversation_id: conv.id, user_id: otherId }]);
    if (membersError) throw membersError;
    const item = { id: conv.id, projectName, otherId, otherName };
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
      const item = { id: conv.id, projectName: projectById[conv.project_id]?.project_name || "Collaboration chat", otherId, otherName: p.display_name || p.company_name || "Member" };
      items.push(item);
      const button = document.createElement("button"); button.className = "thread"; button.dataset.id = item.id;
      button.innerHTML = `<span class="avatar">${esc(item.otherName.slice(0, 2).toUpperCase())}</span><span class="thread-info"><span class="thread-top"><b>${esc(item.otherName)}</b></span><span class="subject">${esc(item.projectName)}</span><span class="preview">Open conversation</span></span>`;
      button.addEventListener("click", () => selectConversation(item).catch((error) => toast(error.message)));
      threadNode.append(button);
    }
    if (activeId) { const active = items.find((item) => item.id === activeId); if (active) [...threadNode.querySelectorAll(".thread")].find((node) => node.dataset.id === activeId)?.classList.add("active"); }
    const requestedId = new URLSearchParams(location.search).get("conversation");
    if (!activeId && requestedId) { const requested = items.find((item) => item.id === requestedId); if (requested) await selectConversation(requested); }
    await renderAcceptedPartners(conversations, members || []);
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
  }

  try {
    supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    const { data: { user: current }, error } = await supabase.auth.getUser();
    if (error || !current) { location.href = "index.html"; return; }
    user = current;
    // Remove static demo counters, threads, and mock message composer behavior.
    $(".campaign-box")?.remove(); ensureActivityPanel(); $("#bulk-modal")?.remove(); $("#meeting-modal")?.remove(); $("#schedule")?.remove(); $("#meet-inline")?.remove();
    threadNode.querySelectorAll(".thread").forEach((node) => node.remove());
    const segmented = document.querySelector(".seg"); if (segmented) segmented.remove();
    if (sendButton) sendButton.onclick = null;
    if (input) input.onkeydown = null;
    document.querySelectorAll(".list-title button").forEach((button) => { button.onclick = null; button.setAttribute("aria-label", "Find a project to start a conversation"); button.title = "Show interest in a project to start a private project conversation"; button.addEventListener("click", () => { location.href = "projects.html"; }); });
    $("#thread-search")?.addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); threadNode.querySelectorAll(".thread").forEach((node) => node.classList.toggle("hidden", !node.textContent.toLowerCase().includes(query))); });
    $("#back")?.addEventListener("click", () => $("#messages").classList.remove("show-chat"));
    sendButton?.addEventListener("click", sendMessage);
    input?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
    await refreshActivity(); connectRealtime(); activityTimer = setInterval(() => { if (!realtimeConnected) { refreshActivity().catch((e) => { console.error("Project snapshot refresh failed:", e); $("#bmc-activity-context").textContent = `Could not refresh project counts: ${e.message || "Supabase error"}`; }); if (activeId && !document.hidden) loadMessages(activeId).catch(() => {}); renderThreads().catch(() => {}); } }, 30000);
    await renderThreads();
    if (!activeId) {
      $("#chat-name").textContent = "No conversation selected"; $("#chat-name").removeAttribute("href");
      $("#chat-title").textContent = ""; $("#context-title").textContent = "Select a conversation";
      $("#chat-avatar").textContent = "—"; $(".chat-head").style.display = "none"; $(".context").style.display = "none"; $(".compose").style.display = "none";
      showMessage("Your replies and conversations will appear here. Express interest in a project to start a private project chat.");
    }
    document.body.classList.add("bmc-messages-ready");
  } catch (error) {
    console.error("Messages could not load:", error);
    if ($("#bmc-activity-context")) $("#bmc-activity-context").textContent = `Could not load project counts: ${error.message || "Supabase error"}`;
    threadNode.innerHTML = "";
    $("#chat-name").textContent = "No conversation selected"; $("#chat-title").textContent = "";
    $("#context-title").textContent = "Select a conversation"; $("#chat-avatar").textContent = "—";
    $(".chat-head").style.display = "none"; $(".context").style.display = "none"; $(".compose").style.display = "none";
    showMessage(error.message || "Your conversations could not be loaded.");
    toast(error.message || "Your conversations could not be loaded.");
    document.body.classList.add("bmc-messages-ready");
  }
})();

