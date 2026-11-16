// Populate the dashboard from the signed-in member's Supabase records.
(async function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 3000); } };

  try {
    const supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { location.href = "index.html"; return; }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("display_name,company_name,account_type").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    const accountType = profile?.account_type || user.user_metadata?.account_type || "creator";
    const isCreator = accountType === "creator";
    const rolePicker = $("#role");
    if (rolePicker) { rolePicker.value = accountType; rolePicker.disabled = true; }
    $("#page-title").textContent = isCreator ? "Creator project dashboard" : accountType === "agency" ? "Agency project dashboard" : "Project dashboard";
    $("#page-subtitle").textContent = isCreator ? "Review your creator projects and applications to brand campaigns." : "Review projects posted by your account and their applications.";
    $("#create-label").textContent = isCreator ? "Post a creator project" : "Post a project";

    const { data: ownedProjects, error: ownedError } = await supabase.from("projects").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (ownedError) throw ownedError;
    const own = ownedProjects || [];
    const ownIds = own.map((project) => project.id);
    let received = [];
    if (ownIds.length) {
      const { data, error } = await supabase.from("applications").select("id,project_id,applicant_id,status,created_at").in("project_id", ownIds);
      if (error) throw error;
      received = data || [];
    }
    const { data: myApplications, error: myApplicationsError } = await supabase.from("applications").select("id,project_id,status,created_at").eq("applicant_id", user.id).order("created_at", { ascending: false });
    if (myApplicationsError) throw myApplicationsError;
    const applied = myApplications || [];
    const appliedIds = [...new Set(applied.map((item) => item.project_id).filter((id) => !ownIds.includes(id)))];
    let appliedProjects = [];
    if (appliedIds.length) {
      const { data, error } = await supabase.from("projects").select("id,project_name,project_type,category,status,created_at,owner_id").in("id", appliedIds);
      if (error) throw error;
      appliedProjects = data || [];
    }
    const allIds = [...new Set([...ownIds, ...appliedIds])];
    let conversations = [];
    if (allIds.length) {
      const result = await supabase.from("conversations").select("id,project_id").in("project_id", allIds);
      if (!result.error) conversations = result.data || [];
    }
    const chatCounts = conversations.reduce((counts, chat) => { if (chat.project_id) counts[chat.project_id] = (counts[chat.project_id] || 0) + 1; return counts; }, {});
    const appsByProject = received.reduce((groups, item) => { (groups[item.project_id] ||= []).push(item); return groups; }, {});
    const statusText = (status) => status === "Draft" ? "Draft" : status === "Paused" ? "Paused" : status === "Closed" ? "Closed" : "Open";
    const statusClass = (status) => status === "Closed" ? "done" : status === "Draft" || status === "Paused" ? "review" : "";
    const projectRow = (project, role, appRows, subtitle, actionUrl) => {
      const rows = appRows || [];
      const interested = rows.filter((item) => item.status === "interested").length;
      const accepted = rows.filter((item) => item.status === "working_together").length;
      const rejected = rows.filter((item) => item.status === "rejected").length;
      const date = (project.created_at || new Date().toISOString()).slice(0, 10);
      return `<tr class="data-row" data-role="${role}" data-date="${date}" data-project="${esc(project.project_name)}" data-recipients="${interested}"><td class="project-cell"><b>${esc(project.project_name)}</b><span>${esc(subtitle || project.category || "Project")}</span></td><td><span class="badge ${statusClass(project.status)}">${esc(statusText(project.status))}</span></td><td><span class="metric">${rows.length}</span><span class="metric-note">applications / responses</span></td><td><span class="metric">${interested}</span><span class="metric-note">interested</span></td><td><span class="metric">${accepted}</span><span class="metric-note">working together</span></td><td><span class="metric">${rejected}</span><span class="metric-note">rejected</span></td><td><span class="metric">${chatCounts[project.id] || 0}</span><span class="metric-note">project chats</span></td><td><div class="row-actions"><a class="action" href="${actionUrl}">View project</a></div></td></tr>`;
    };
    const ownCreatorProjects = own.filter((project) => project.project_type === "creator_idea");
    const ownBrandProjects = own.filter((project) => project.project_type === "brand_campaign");
    const brandBody = $("#table-body");
    const creatorBody = $("#creator-table-body");
    if (brandBody) brandBody.innerHTML = ownBrandProjects.map((project) => projectRow(project, "brand", appsByProject[project.id], project.category, `my-projects.html`)).join("");
    const creatorRows = ownCreatorProjects.map((project) => projectRow(project, "creator", appsByProject[project.id], project.category, "my-projects.html"));
    const appliedById = new Map(applied.map((item) => [item.project_id, item]));
    for (const project of appliedProjects) {
      const application = appliedById.get(project.id);
      const synthetic = { ...project, status: application?.status === "working_together" ? "Working together" : project.status };
      const single = application ? [{ status: application.status }] : [];
      creatorRows.push(projectRow(synthetic, "creator", single, `Your application · ${project.category || "Brand campaign"}`, "projects.html"));
    }
    if (creatorBody) creatorBody.innerHTML = creatorRows.join("");
    const brandSection = brandBody?.closest(".table-panel");
    const creatorSection = creatorBody?.closest(".table-panel");
    if (brandSection) brandSection.hidden = isCreator;
    if (creatorSection) creatorSection.hidden = !isCreator;
    const activeRows = isCreator ? creatorRows.length : ownBrandProjects.length;
    const emptyNode = isCreator ? $("#creator-empty") : $("#empty");
    if (emptyNode) emptyNode.style.display = activeRows ? "none" : "block";
    const summary = isCreator ? $("#creator-range-summary") : $("#range-summary");
    if (summary) summary.textContent = activeRows ? `${activeRows} live project${activeRows === 1 ? "" : "s"} · counts from your Supabase account` : "No project activity yet. Posts and applications will appear here when you create them.";
    if (!isCreator && ownBrandProjects.length === 0 && ownCreatorProjects.length === 0) toast("No projects found for this account yet.");
    document.body.classList.add("bmc-dashboard-ready");
  } catch (error) {
    console.error("Live dashboard could not load:", error);
    $("#table-body") && ($("#table-body").innerHTML = ""); $("#creator-table-body") && ($("#creator-table-body").innerHTML = "");
    toast(error.message || "Live dashboard data could not be loaded.");
    document.body.classList.add("bmc-dashboard-ready");
  }
})();
