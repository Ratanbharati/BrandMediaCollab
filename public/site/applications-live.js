// Replace the historic sample application cards with this member's real rows.
(async function () {
  const list = document.querySelector("#list");
  const empty = document.querySelector("#empty");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = document.querySelector("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2800); } };
  try {
    const supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { location.href = "index.html"; return; }
    list.querySelectorAll(".application").forEach((node) => node.remove());
    const { data: apps, error } = await supabase.from("applications").select("id,project_id,applicant_id,status,message,created_at").eq("applicant_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    const projectIds = [...new Set((apps || []).map((a) => a.project_id))];
    const { data: projects, error: projectsError } = projectIds.length ? await supabase.from("projects").select("id,owner_id,project_name,category,project_type,status").in("id", projectIds) : { data: [], error: null };
    if (projectsError) throw projectsError;
    const ownerIds = [...new Set((projects || []).map((p) => p.owner_id))];
    const { data: profiles, error: profilesError } = ownerIds.length ? await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", ownerIds) : { data: [], error: null };
    if (profilesError) throw profilesError;
    const byProject = Object.fromEntries((projects || []).map((p) => [p.id, p]));
    const byOwner = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const rows = apps || [];
    const count = (status) => rows.filter((a) => status === "all" || (status === "pending" ? a.status === "interested" : status === "matched" ? a.status === "working_together" : a.status === "rejected")).length;
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const key = button.dataset.filter;
      const label = key === "all" ? "All" : key === "pending" ? "Awaiting response" : key === "matched" ? "Working together" : "Passed";
      button.textContent = `${label} · ${count(key)}`;
    });
    for (const app of rows) {
      const project = byProject[app.project_id] || {}; const owner = byOwner[project.owner_id] || {};
      const statusKey = app.status === "working_together" ? "matched" : app.status === "rejected" ? "passed" : "pending";
      const card = document.createElement("article"); card.className = `card application`; card.dataset.status = statusKey;
      card.innerHTML = `<div class="topline"><div class="symbol">${esc((owner.display_name || owner.company_name || "SR").slice(0,2).toUpperCase())}</div><div class="meta"><b>${esc(owner.display_name || owner.company_name || "Project owner")}</b><span>Applied ${new Date(app.created_at).toLocaleDateString()} · ${esc(project.category || "Project")}</span></div><span class="status ${statusKey === "matched" ? "match" : statusKey === "passed" ? "pass" : ""}">${esc(app.status.replaceAll("_", " "))}</span></div><h2>${esc(project.project_name || "Project")}</h2><p>${esc(app.message || "No note was added.")}</p><div class="actions"><button class="btn dark" data-open-chat>Open private project chat ↗</button>${app.status === "interested" ? '<button class="btn" data-withdraw>Withdraw interest</button>' : ""}</div>`;
      card.querySelector("[data-open-chat]").onclick = async () => {
        try {
          const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
          if (membershipError) throw membershipError;
          const ids = (memberships || []).map((m) => m.conversation_id); let conversationId;
          if (ids.length) {
            const { data: chats, error: chatsError } = await supabase.from("conversations").select("id").eq("project_id", project.id).in("id", ids);
            if (chatsError) throw chatsError;
            for (const chat of chats || []) { const { data: members } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", chat.id); if ((members || []).some((m) => m.user_id === project.owner_id)) { conversationId = chat.id; break; } }
          }
          if (!conversationId) {
            const { data: chat, error: createError } = await supabase.from("conversations").insert({ project_id: project.id, created_by: user.id, is_group: false }).select("id").single();
            if (createError) throw createError;
            const { error: addError } = await supabase.from("conversation_members").insert([{ conversation_id: chat.id, user_id: user.id }, { conversation_id: chat.id, user_id: project.owner_id }]);
            if (addError) throw addError;
            conversationId = chat.id;
          }
          location.href = `messages.html?conversation=${encodeURIComponent(conversationId)}`;
        } catch (chatError) { toast(chatError.message || "Could not open the project chat."); }
      };
      card.querySelector("[data-withdraw]")?.addEventListener("click", async () => {
        const { error: updateError } = await supabase.from("applications").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", app.id);
        if (updateError) return toast(updateError.message);
        card.remove(); toast("Interest withdrawn.");
      });
      list.insertBefore(card, empty);
    }
    empty.textContent = rows.length ? "No applications in this status." : "You haven’t expressed interest in a project yet. Browse open projects to get started.";
    empty.style.display = rows.length ? "none" : "block";
    document.body.classList.add("bmc-applications-ready");
  } catch (error) {
    console.error("Applications could not load:", error);
    list.querySelectorAll(".application").forEach((node) => node.remove());
    empty.textContent = error.message || "Applications could not be loaded."; empty.style.display = "block";
    document.body.classList.add("bmc-applications-ready");
  }
})();
