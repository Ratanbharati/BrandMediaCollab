// Live one-to-one conversations backed by Supabase conversations and messages.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2800); } };
  let supabase, user, activeId = null, poller = null, realtimeChannel = null, realtimeConnected = false;
  let activityTimer = null;
  let eligibleCollabs = [];
  let activeFilter = "all";
  const conversationNode = $("#conversation");
  const threadNode = $("#thread-list");
  const input = $("#message-input");
  const sendButton = $("#send");

  function ensureActivityPanel() {
    let panel = $("#bmc-project-activity");
    if (!panel) {
      panel = document.createElement("details"); panel.id = "bmc-project-activity"; panel.className = "campaign-box"; panel.open = window.matchMedia("(min-width: 801px)").matches;
      panel.innerHTML = '<summary class="camp-top"><b>Project snapshot</b><span>Live</span></summary><select id="bmc-activity-project" aria-label="Choose a project"><option value="all">All your project activity</option></select><div class="camp-stats"><div class="camp-stat"><b data-activity="active">—</b><span>Active projects</span></div><div class="camp-stat"><b data-activity="interests">—</b><span>Received interests</span></div><div class="camp-stat"><b data-activity="chats">—</b><span>Chats</span></div><div class="camp-stat"><b data-activity="messages">—</b><span>Messages</span></div><div class="camp-stat"><b data-activity="unread">—</b><span>Unread</span></div><div class="camp-stat"><b data-activity="applied">—</b><span>Applied</span></div></div><div class="readline" id="bmc-activity-context">Counts update from your saved project activity.</div>';
      $(".list-head")?.after(panel);
    }
    return panel;
  }
  async function refreshActivity() {
    const panel = ensureActivityPanel(), chooser = $("#bmc-activity-project"); if (!panel || !chooser) return;
    const current = chooser.value || "all";
    const [ownedResult, sentResult] = await Promise.all([
      supabase.from("projects").select("id,project_name,owner_id,status").eq("owner_id", user.id),
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
    const interestCount = received.length;
    const memberResult = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (memberResult.error) throw memberResult.error;
    const convIds = [...new Set((memberResult.data || []).map((r) => r.conversation_id))];
    let chats = [];
    if (convIds.length) {
      const { data, error } = await supabase.from("conversations").select("id,project_id").in("id", convIds);
      if (error) throw error; chats = (data || []).filter((c) => projectIds.includes(c.project_id));
    }
    const chatIds = chats.map((c) => c.id); let messageCount = 0, unread = 0;
    if (chatIds.length) {
      const { count: totalMessages, error } = await supabase.from("messages").select("id", { count: "exact", head: true }).in("conversation_id", chatIds);
      if (error) throw error; messageCount = totalMessages || 0;
      const { count, error: unreadError } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "new_message").is("read_at", null).in("conversation_id", chatIds);
      if (!unreadError) unread = count || 0;
    }
    panel.querySelector('[data-activity="active"]').textContent = String(owned.filter((p) => String(p.status || "").toLowerCase() === "open").length);
    panel.querySelector('[data-activity="interests"]').textContent = String(interestCount);
    panel.querySelector('[data-activity="chats"]').textContent = String(chats.length);
    panel.querySelector('[data-activity="messages"]').textContent = String(messageCount);
    panel.querySelector('[data-activity="unread"]').textContent = String(unread);
    panel.querySelector('[data-activity="applied"]').textContent = String(appliedIds.length);
    $("#bmc-activity-context").textContent = chooser.value === "all" ? `${owned.length} posts · ${appliedIds.length} applied projects` : (ownedIds.includes(chooser.value) ? "Your post · incoming interest and chat activity" : "Your application · conversation activity");
  }

  function showMessage(message) {
    conversationNode.innerHTML = `<div class="system-note">${esc(message)}</div>`;
  }
  function showEmptyChat() {
    conversationNode.innerHTML = '<section class="empty-chat-state"><span class="empty-chat-icon" aria-hidden="true">✉</span><h2>Your collaborations start here.</h2><p>Connect with brands, creators, and agencies to discuss projects and turn opportunities into collaborations.</p><a class="empty-chat-cta" href="explore.html">Explore profiles</a> <a class="empty-chat-cta" href="projects.html">Explore projects</a></section>';
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
    else {
      let lastDay = "";
      data.forEach((message) => {
        const day = new Date(message.created_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        if (day !== lastDay) { const divider = document.createElement("div"); divider.className = "day"; divider.textContent = day; conversationNode.append(divider); lastDay = day; }
        appendMessage(message);
      });
    }
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_members", filter: `user_id=eq.${user.id}` }, refreshThreads)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_connections", filter: `requester_id=eq.${user.id}` }, refreshThreads)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_connections", filter: `recipient_id=eq.${user.id}` }, refreshThreads)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, refreshThreads)
      .subscribe((status) => { realtimeConnected = status === "SUBSCRIBED"; });
  }
  async function selectConversation(item) {
    activeId = item.id;
    $("#chat-name").textContent = item.otherName;
    $("#chat-name").href = `my-profile.html?user=${encodeURIComponent(item.otherId)}`;
    $("#chat-title").textContent = item.accountType ? item.projectName + " · " + item.accountType.replaceAll("_", " ") : item.projectName;
    $("#context-title").textContent = item.projectName;
    if ($("#context-subtitle")) $("#context-subtitle").textContent = item.isDirect ? "Connected on Stagerang · Private conversation" : item.projectType ? item.projectType.replaceAll("_", " ") + " · Private project chat" : "Private project chat";
    $("#chat-avatar").textContent = item.otherName.slice(0, 2).toUpperCase();
    $("#messages").classList.add("show-chat");
    $(".compose").style.display = "";
    $(".chat-head").style.display = "";
    $(".context").style.display = "";
    const contextLink = $("#chat-project-link");
    if (contextLink) {
      contextLink.href = item.isDirect ? `my-profile.html?user=${encodeURIComponent(item.otherId)}` : "projects.html?project=" + encodeURIComponent(item.projectId || "");
      contextLink.textContent = item.isDirect ? "View profile ↗" : "View project ↗";
    }
    [...threadNode.querySelectorAll(".thread")].forEach((node) => node.classList.toggle("active", node.dataset.id === item.id));
    await loadMessages(item.id);
    const { error: notificationReadError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("type", "new_message").eq("conversation_id", item.id).is("read_at", null);
    if (notificationReadError) toast("Conversation opened, but unread notifications could not be updated.");
    await renderThreads();
    window.bmcRefreshMessageBadge?.();
    window.dispatchEvent(new CustomEvent("bmc-notifications-updated"));
    refreshActivity().catch(() => {});
    if (poller) { clearInterval(poller); poller = null; }
  }
  async function createConversation(projectId, otherId, projectName, otherName) {
    let query = supabase.from("conversations").select("id,project_id,created_by");
    query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
    const { data: existing, error: listError } = await query;
    if (listError) throw listError;
    for (const conv of existing || []) {
      const { data: members } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conv.id);
      if ((members || []).some((m) => m.user_id === otherId) && (members || []).some((m) => m.user_id === user.id)) {
        const eligible = eligibleCollabs.find((item) => item.otherId === otherId && item.projectId === projectId);
        return selectConversation({ id: conv.id, projectId, isDirect: !projectId, projectName: projectName || "Direct connection", otherId, otherName, accountType: eligible?.accountType || "", avatarUrl: eligible?.avatarUrl || "" });
      }
    }
    const { data: conv, error: createError } = await supabase.from("conversations").insert({ project_id: projectId, created_by: user.id, is_group: false }).select("id").single();
    if (createError) throw createError;
    const { error: membersError } = await supabase.from("conversation_members").insert([{ conversation_id: conv.id, user_id: user.id }, { conversation_id: conv.id, user_id: otherId }]);
    if (membersError) throw membersError;
    const eligible = eligibleCollabs.find((collab) => collab.otherId === otherId && collab.projectId === projectId);
    const item = { id: conv.id, projectId, isDirect: !projectId, projectName: projectName || "Direct connection", otherId, otherName, accountType: eligible?.accountType || "", avatarUrl: eligible?.avatarUrl || "" };
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
    if (!conversations.length) threadNode.innerHTML = '<div class="list-empty-state"><b>No conversations yet</b><span>Connect with someone or accept a project collaboration to start a private chat.</span><a href="explore.html">Explore profiles ↗</a></div>';
    const projectIds = [...new Set(conversations.map((c) => c.project_id).filter(Boolean))];
    const { data: members } = ids.length ? await supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids) : { data: [] };
    const otherIds = [...new Set((members || []).map((m) => m.user_id).filter((id) => id !== user.id))];
    const { data: profiles } = otherIds.length ? await supabase.from("profiles").select("id,display_name,company_name,account_type,avatar_url").in("id", otherIds) : { data: [] };
    const { data: projects } = projectIds.length ? await supabase.from("projects").select("id,project_name,project_type").in("id", projectIds) : { data: [] };
    const [messageResult, unreadResult] = ids.length ? await Promise.all([
      supabase.from("messages").select("conversation_id,sender_id,body,created_at").in("conversation_id", ids).order("created_at", { ascending: false }).limit(1000),
      supabase.from("notifications").select("conversation_id,created_at").eq("user_id", user.id).eq("type", "new_message").is("read_at", null).in("conversation_id", ids).order("created_at", { ascending: false })
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (messageResult.error) throw messageResult.error;
    if (unreadResult.error) throw unreadResult.error;
    const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const projectById = Object.fromEntries((projects || []).map((p) => [p.id, p]));
    const latestByConversation = new Map();
    for (const message of messageResult.data || []) if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
    const unreadByConversation = new Map();
    for (const notification of unreadResult.data || []) if (notification.conversation_id) unreadByConversation.set(notification.conversation_id, (unreadByConversation.get(notification.conversation_id) || 0) + 1);
    const items = [];
    for (const conv of conversations) {
      const otherId = (members || []).find((m) => m.conversation_id === conv.id && m.user_id !== user.id)?.user_id;
      if (!otherId) continue;
      const p = profileById[otherId] || {};
      const latest = latestByConversation.get(conv.id);
      const project = projectById[conv.project_id] || {};
      const item = { id: conv.id, projectId: conv.project_id, isDirect: !conv.project_id, projectName: project.project_name || (conv.project_id ? "Collaboration chat" : "Direct connection"), projectType: project.project_type || "", otherId, otherName: p.display_name || p.company_name || "Member", accountType: p.account_type || "", avatarUrl: p.avatar_url || "", latest, unread: unreadByConversation.get(conv.id) || 0, activityAt: latest?.created_at || conv.created_at };
      items.push(item);
    }
    items.sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt));
    for (const item of items) {
      const button = document.createElement("button"); button.className = "thread"; button.dataset.id = item.id; button.dataset.kind = item.accountType; button.dataset.unread = String(item.unread > 0); button.dataset.unreadCount = String(item.unread);
      const preview = item.latest ? (item.latest.sender_id === user.id ? "You: " : "") + item.latest.body : "No messages yet · start the conversation";
      const timestamp = item.latest?.created_at ? new Date(item.latest.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      const avatar = /^https?:\/\//i.test(item.avatarUrl) ? '<span class="avatar"><img src="' + esc(item.avatarUrl) + '" alt="" loading="lazy"></span>' : '<span class="avatar">' + esc(item.otherName.slice(0, 2).toUpperCase()) + '</span>';
      button.innerHTML = avatar + '<span class="thread-info"><span class="thread-top"><b>' + esc(item.otherName) + (item.unread ? ' <span class="unread">' + (item.unread > 99 ? "99+" : item.unread) + '</span>' : "") + '</b><time>' + esc(timestamp) + '</time></span><span class="subject">' + esc(item.projectName) + '</span><span class="preview">' + esc(preview) + '</span></span>';
      button.addEventListener("click", () => selectConversation(item).catch((error) => toast(error.message)));
      threadNode.append(button);
    }
    if (activeId) { const active = items.find((item) => item.id === activeId); if (active) [...threadNode.querySelectorAll(".thread")].find((node) => node.dataset.id === activeId)?.classList.add("active"); }
    const requestedId = new URLSearchParams(location.search).get("conversation");
    if (!activeId && requestedId) { const requested = items.find((item) => item.id === requestedId); if (requested) await selectConversation(requested); }
    await renderAcceptedPartners(conversations, members || []);
    applyThreadFilters();
    renderStartChoices();
    const requestedProfile = new URLSearchParams(location.search).get("profile");
    if (!activeId && requestedProfile) {
      const direct = eligibleCollabs.find((item) => item.direct && item.otherId === requestedProfile);
      const existingDirect = items.find((item) => item.isDirect && item.otherId === requestedProfile);
      const params = new URLSearchParams(location.search); params.delete("profile");
      history.replaceState({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
      if (existingDirect) await selectConversation(existingDirect);
      else if (direct) await createConversation(null, direct.otherId, "Direct connection", direct.otherName);
      else toast("Accept a connection request before starting a direct message.");
    }
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
    const { data: acceptedConnections, error: connectionError } = await supabase.from("profile_connections").select("requester_id,recipient_id").eq("status", "accepted").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
    if (connectionError) throw connectionError;
    for (const connection of acceptedConnections || []) {
      const otherId = connection.requester_id === user.id ? connection.recipient_id : connection.requester_id;
      if (otherId) opportunities.push({ projectId: null, projectName: "Direct connection", otherId, direct: true });
    }
    const existingPairs = new Set();
    for (const conv of conversations) {
      const pair = (members || []).filter((m) => m.conversation_id === conv.id).map((m) => m.user_id).sort().join(":");
      if (pair) existingPairs.add(`${conv.project_id}:${pair}`);
    }
    const filtered = opportunities.filter((o) => !existingPairs.has(`${o.projectId}:${[user.id, o.otherId].sort().join(":")}`));
    eligibleCollabs = [];
    if (!filtered.length) return;
    const otherIds = [...new Set(filtered.map((x) => x.otherId).filter(Boolean))];
    const { data: people, error: peopleError } = await supabase.from("profiles").select("id,display_name,company_name,account_type,avatar_url").in("id", otherIds);
    if (peopleError) throw peopleError;
    const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
    const heading = document.createElement("div"); heading.className = "accepted-heading"; heading.textContent = "Accepted collaborations"; threadNode.append(heading);
    for (const opportunity of filtered) {
      const person = byId[opportunity.otherId]; if (!person) continue;
      const otherName = person.display_name || person.company_name || "Member";
      eligibleCollabs.push({ ...opportunity, otherName, accountType: person.account_type || "", avatarUrl: person.avatar_url || "" });
      const button = document.createElement("button"); button.className = "thread";
      button.dataset.kind = person.account_type || ""; button.dataset.start = "true";
      button.innerHTML = '<span class="avatar">' + esc(otherName.slice(0, 2).toUpperCase()) + '</span><span class="thread-info"><span class="thread-top"><b>' + esc(otherName) + '</b></span><span class="subject">' + esc(opportunity.projectName) + '</span><span class="preview">' + (opportunity.direct ? "Start direct conversation" : "Start project chat") + '</span></span>';
      button.addEventListener("click", () => createConversation(opportunity.projectId, opportunity.otherId, opportunity.projectName, otherName).catch((error) => toast(error.message)));
      threadNode.append(button);
    }
  }
  function applyThreadFilters() {
    const query = (document.querySelector("#thread-search")?.value || "").trim().toLowerCase();
    threadNode.querySelectorAll(".thread").forEach((node) => {
      const matchesQuery = node.textContent.toLowerCase().includes(query);
      const matchesFilter = activeFilter === "all" || (activeFilter === "unread" ? node.dataset.unread === "true" : node.dataset.kind === activeFilter);
      node.classList.toggle("hidden", !matchesQuery || !matchesFilter);
    });
    document.querySelectorAll("#conversation-filters [data-filter]").forEach((button) => {
      const selected = button.dataset.filter === activeFilter;
      button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected));
    });
    const unreadTotal = [...threadNode.querySelectorAll(".thread[data-unread='true']")].reduce((sum, node) => sum + Number(node.dataset.unreadCount || 0), 0);
    const badge = document.querySelector("#unread-total");
    if (badge) { badge.textContent = String(unreadTotal); badge.hidden = unreadTotal === 0; }
  }
  function renderStartChoices() {
    const host = document.querySelector("#start-message-choices"); if (!host) return;
    const query = (document.querySelector("#start-message-search")?.value || "").trim().toLowerCase();
    const matches = eligibleCollabs.filter((item) => (item.otherName + " " + item.projectName).toLowerCase().includes(query));
    host.innerHTML = matches.length ? matches.map((item, index) => '<button class="start-choice" type="button" data-choice="' + index + '"><span class="avatar">' + esc(item.otherName.slice(0, 2).toUpperCase()) + '</span><span><b>' + esc(item.otherName) + '</b><span>' + esc(item.projectName) + '</span></span></button>').join("") : '<div class="list-empty-state"><b>No eligible collaborators found</b><span>Direct chats open with accepted connections. Project chats open after a collaboration is accepted.</span></div>';
    host.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
      const item = matches[Number(button.dataset.choice)]; if (!item) return;
      document.querySelector("#start-message-modal")?.classList.remove("open");
      createConversation(item.projectId, item.otherId, item.projectName, item.otherName).catch((error) => toast(error.message));
    }));
  }
  async function sendMessage() {
    const body = input.value.trim();
    if (!body || !activeId) { if (!activeId) toast("Open an accepted-collaboration chat first."); return; }
    sendButton.disabled = true;
    try {
      const { error } = await supabase.from("messages").insert({ conversation_id: activeId, sender_id: user.id, body });
      if (error) throw error;
      input.value = "";
      await loadMessages(activeId);
      await renderThreads();
    } catch (error) { toast(error.message || "Message could not be sent. Try again."); }
    finally { sendButton.disabled = false; }
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
    if (sendButton) sendButton.onclick = null;
    if (input) input.onkeydown = null;
    document.querySelector("#new-message")?.addEventListener("click", () => { renderStartChoices(); document.querySelector("#start-message-modal")?.classList.add("open"); document.querySelector("#start-message-search")?.focus(); });
    document.querySelector("#close-start-message")?.addEventListener("click", () => document.querySelector("#start-message-modal")?.classList.remove("open"));
    document.querySelector("#start-message-modal")?.addEventListener("click", (event) => { if (event.target.id === "start-message-modal") event.currentTarget.classList.remove("open"); });
    document.querySelector("#start-message-search")?.addEventListener("input", renderStartChoices);
    document.querySelector("#conversation-filters")?.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { activeFilter = button.dataset.filter; applyThreadFilters(); }));
    $("#thread-search")?.addEventListener("input", applyThreadFilters);
    $("#back")?.addEventListener("click", () => $("#messages").classList.remove("show-chat"));
    sendButton?.addEventListener("click", sendMessage);
    input?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
    await refreshActivity(); connectRealtime(); activityTimer = setInterval(() => { if (!realtimeConnected) { refreshActivity().catch((e) => { console.error("Project snapshot refresh failed:", e); $("#bmc-activity-context").textContent = `Could not refresh project counts: ${e.message || "Supabase error"}`; }); if (activeId && !document.hidden) loadMessages(activeId).catch(() => {}); renderThreads().catch(() => {}); } }, 30000);
    await renderThreads();
    if (!activeId) {
      $("#chat-name").textContent = "No conversation selected"; $("#chat-name").removeAttribute("href");
      $("#chat-title").textContent = ""; $("#context-title").textContent = "Select a conversation";
      $("#chat-avatar").textContent = "—"; $(".chat-head").style.display = "none"; $(".context").style.display = "none"; $(".compose").style.display = "none";
      showEmptyChat();
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
