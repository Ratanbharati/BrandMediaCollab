// Render the signed-in member's live applications and keep their statuses in sync.
(async function () {
  const list = document.querySelector("#list");
  const empty = document.querySelector("#empty");
  if (!list || !empty) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const toast = (message) => {
    const node = document.querySelector("#toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    window.setTimeout(() => node.classList.remove("show"), 2800);
  };
  const labels = { all: "All", interested: "Awaiting response", working_together: "Working together", rejected: "Passed", withdrawn: "Withdrawn" };
  let supabase, user, rows = [], activeFilter = "all", refreshing = false, queuedRefresh = false;
  let realtimeChannel = null, realtimeConnected = false, fallbackTimer = 0, refreshTimer = 0;

  function showFilteredRows() {
    const visible = rows.filter((app) => activeFilter === "all" || app.status === activeFilter);
    list.querySelectorAll(".application").forEach((card) => { card.hidden = activeFilter !== "all" && card.dataset.status !== activeFilter; });
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const key = button.dataset.filter;
      const count = rows.filter((app) => key === "all" || app.status === key).length;
      button.textContent = `${labels[key] || "All"} · ${count}`;
      button.classList.toggle("active", key === activeFilter);
      button.setAttribute("aria-pressed", String(key === activeFilter));
    });
    empty.hidden = visible.length > 0;
    empty.textContent = rows.length
      ? `No applications in ${labels[activeFilter]?.toLowerCase() || "this status"}.`
      : "You haven’t expressed interest in a project yet. Browse open projects to get started.";
  }

  function openChatButton(card, project, app) {
    card.querySelector("[data-open-chat]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
        if (membershipError) throw membershipError;
        const ids = (memberships || []).map((membership) => membership.conversation_id);
        let conversationId;
        if (ids.length) {
          const { data: chats, error: chatsError } = await supabase.from("conversations").select("id").eq("project_id", project.id).in("id", ids);
          if (chatsError) throw chatsError;
          for (const chat of chats || []) {
            const { data: members, error: membersError } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", chat.id);
            if (membersError) throw membersError;
            if ((members || []).some((member) => member.user_id === user.id) && (members || []).some((member) => member.user_id === project.owner_id)) {
              conversationId = chat.id;
              break;
            }
          }
        }
        if (!conversationId) {
          const { data: chat, error: createError } = await supabase.from("conversations").insert({ project_id: project.id, created_by: user.id, is_group: false }).select("id").single();
          if (createError) throw createError;
          const { error: addError } = await supabase.from("conversation_members").insert([
            { conversation_id: chat.id, user_id: user.id },
            { conversation_id: chat.id, user_id: project.owner_id },
          ]);
          if (addError) throw addError;
          conversationId = chat.id;
        }
        location.href = `messages.html?conversation=${encodeURIComponent(conversationId)}`;
      } catch (error) {
        toast(error.message || `Could not open the chat for ${app.project_id}.`);
        button.disabled = false;
      }
    });
  }

  function renderApplication(app, project, owner) {
    const statusKey = app.status === "working_together" ? "matched" : app.status === "rejected" ? "passed" : app.status === "withdrawn" ? "withdrawn" : "pending";
    const card = document.createElement("article");
    card.className = "card application";
    card.dataset.applicationId = app.id;
    card.dataset.status = app.status;
    card.innerHTML = `<div class="topline"><div class="symbol">${esc((owner.display_name || owner.company_name || "SR").slice(0, 2).toUpperCase())}</div><div class="meta"><b><a class="row-link" href="my-profile.html?user=${encodeURIComponent(project.owner_id || "")}">${esc(owner.display_name || owner.company_name || "Project owner")}</a></b><span>Applied ${new Date(app.created_at).toLocaleDateString()} · ${esc(project.category || "Project")}</span></div><span class="status ${statusKey === "matched" ? "match" : statusKey === "passed" || statusKey === "withdrawn" ? "pass" : ""}">${statusKey === "pending" ? "Awaiting response" : statusKey === "matched" ? "Working together" : statusKey === "withdrawn" ? "Withdrawn" : "Not selected"}</span></div><h2><a class="row-link" href="projects.html?project=${encodeURIComponent(project.id || "")}">${esc(project.project_name || "Project")}</a></h2><p>${esc(app.message || "No note was added.")}</p><div class="actions">${app.status !== "withdrawn" ? '<button class="btn dark" type="button" data-open-chat>Open private project chat ↗</button>' : ""}${app.status === "interested" ? '<button class="btn" type="button" data-withdraw>Withdraw interest</button>' : ""}</div>`;
    openChatButton(card, project, app);
    card.querySelector("[data-withdraw]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { error } = await supabase.from("applications").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", app.id).eq("applicant_id", user.id);
        if (error) throw error;
        toast("Interest withdrawn.");
        await refresh();
      } catch (error) {
        toast(error.message || "Could not withdraw your interest.");
        button.disabled = false;
      }
    });
    list.append(card);
  }

  async function loadApplications() {
    const { data: apps, error } = await supabase.from("applications").select("id,project_id,applicant_id,status,message,created_at").eq("applicant_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    const projectIds = [...new Set((apps || []).map((app) => app.project_id))];
    const [projectResult] = await Promise.all([
      projectIds.length ? supabase.from("projects").select("id,owner_id,project_name,category,project_type,status").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (projectResult.error) throw projectResult.error;
    const ownerIds = [...new Set((projectResult.data || []).map((project) => project.owner_id).filter(Boolean))];
    const { data: profiles, error: profilesError } = ownerIds.length
      ? await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", ownerIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    rows = apps || [];
    const byProject = Object.fromEntries((projectResult.data || []).map((project) => [project.id, project]));
    const byOwner = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
    list.replaceChildren();
    rows.forEach((app) => renderApplication(app, byProject[app.project_id] || {}, byOwner[byProject[app.project_id]?.owner_id] || {}));
    showFilteredRows();
    const applicationId = new URLSearchParams(location.search).get("application");
    if (applicationId) {
      const target = list.querySelector(`[data-application-id="${CSS.escape(applicationId)}"]`);
      if (target) {
        target.style.outline = "2px solid #91ba68";
        target.style.outlineOffset = "3px";
        target.tabIndex = -1;
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        target.focus({ preventScroll: true });
      }
    }
  }

  async function refresh() {
    if (refreshing) { queuedRefresh = true; return; }
    refreshing = true;
    try {
      await loadApplications();
      empty.removeAttribute("data-error");
      document.body.classList.add("bmc-applications-ready");
    } catch (error) {
      console.error("Applications could not load:", error);
      list.replaceChildren();
      empty.hidden = false;
      empty.dataset.error = "true";
      empty.textContent = error.message || "Applications could not be loaded. Refresh to try again.";
      document.body.classList.add("bmc-applications-ready");
    } finally {
      refreshing = false;
      if (queuedRefresh) { queuedRefresh = false; window.setTimeout(() => refresh(), 0); }
    }
  }

  try {
    supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { location.href = "index.html"; return; }
    window.currentApplicationUser = user;
    await refresh();
    document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      showFilteredRows();
    }));
    realtimeChannel = supabase.channel(`applications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `applicant_id=eq.${user.id}` }, () => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => refresh(), 250);
      })
      .subscribe((status) => { realtimeConnected = status === "SUBSCRIBED"; });
    fallbackTimer = window.setInterval(() => { if (!realtimeConnected && !document.hidden) refresh(); }, 30000);
    window.addEventListener("pagehide", () => {
      window.clearInterval(fallbackTimer);
      window.clearTimeout(refreshTimer);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    }, { once: true });
  } catch (error) {
    console.error("Applications could not initialize:", error);
    empty.hidden = false;
    empty.dataset.error = "true";
    empty.textContent = error.message || "Applications could not be loaded. Refresh to try again.";
    document.body.classList.add("bmc-applications-ready");
  }
})();
