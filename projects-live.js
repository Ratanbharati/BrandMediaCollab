// Live project directory. Public posts, account-owned posts, applications, and
// saved posts are kept in separate scopes while sharing the same filters.
(async function () {
  window.bmcProjectsDirectoryHandled = true;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (s) => { const n = $("#toast"); if (n) { n.textContent = s; n.classList.add("show"); setTimeout(() => n.classList.remove("show"), 2400); } };
  const host = $("#list"), empty = $("#empty");
  if (!host || !empty) return;
  const requestedScope = new URLSearchParams(location.search).get("scope");
  let db, user, projects = [], applications = [], saved = new Set(), profilesById = {}, scope = ["owned", "applied", "saved"].includes(requestedScope) ? requestedScope : "discover", activeKind = "brand";
  const counts = { owned: 0, applications: 0, saved: 0, ideas: 0, brands: 0, agencies: 0 };
  const selected = (v, key) => (v || []).some((x) => String(x).toLowerCase().includes(key));
  function setCount(status, count) { const el = document.querySelector(`[data-count="${status}"]`); if (el) el.textContent = String(count); }
  function renderFilters() {
    const q = $("#q").value.trim().toLowerCase(), cat = $("#cat").value.toLowerCase(), tier = $("#tier").value.toLowerCase(), platform = $("#platform").value.toLowerCase(), loc = $("#location").value.toLowerCase();
    // Filter the project records before creating cards. A tab change replaces
    // the rendered dataset, so cards from other categories are not merely hidden.
    const visibleProjects = projects.filter((project) => {
      const kindOk = projectKind(project, profilesById[project.owner_id]) === activeKind;
      const projectApplications = applications.filter((application) => application.project_id === project.id);
      const scopeOk = scope === "owned" ? project.owner_id === user.id
        : scope === "applied" ? projectApplications.some((application) => application.status !== "withdrawn")
        : scope === "saved" ? saved.has(project.id)
        : String(project.status || "").toLowerCase() === "open" && project.owner_id !== user.id;
      return kindOk && scopeOk
        && (!q || `${project.project_name || ""} ${profilesById[project.owner_id]?.display_name || ""} ${profilesById[project.owner_id]?.company_name || ""} ${project.requirements || ""} ${project.category || ""} ${(project.platforms || []).join(" ")} ${(project.creator_tiers || []).join(" ")} ${project.location || ""}`.toLowerCase().includes(q))
        && (cat === "all" || String(project.category || "").toLowerCase().includes(cat))
        && (tier === "all" || (project.creator_tiers || []).some((value) => String(value).toLowerCase().includes(tier)))
        && (platform === "all" || (project.platforms || []).some((value) => String(value).toLowerCase().includes(platform)))
        && (loc === "all" || String(project.location || "").toLowerCase().includes(loc));
    });
    host.querySelectorAll(".item").forEach((row) => row.remove());
    visibleProjects.forEach((project) => host.insertBefore(buildCard(project, profilesById), empty));
    const shown = visibleProjects.length;
    empty.textContent = scope === "owned" ? "You haven’t posted anything in this category yet." : scope === "applied" ? "You have no applications in this category yet." : scope === "saved" ? "You haven’t saved anything in this category yet." : "No live posts in this category yet.";
    empty.classList.toggle("hidden", shown > 0);
  }
  window.bmcApplyProjectFilters = renderFilters;
  function setScope(next) {
    scope = next;
    document.querySelectorAll(".side-link[data-status]").forEach((x) => x.classList.toggle("active", x.dataset.status === (next === "discover" ? (activeKind === "creator" ? "collab" : activeKind === "agency" ? "agency" : "discover") : next)));
    renderFilters();
  }
  function setKind(next) {
    activeKind = next;
    document.querySelectorAll(".segmented [data-kind]").forEach((x) => x.classList.toggle("active", x.dataset.kind === next));
    if (scope === "discover") document.querySelectorAll(".side-link[data-status]").forEach((x) => x.classList.toggle("active", x.dataset.status === (next === "creator" ? "collab" : next === "agency" ? "agency" : "discover")));
    renderFilters();
  }
  function projectKind(p, ownerProfile) {
    const normalize = (value) => {
      const type = String(value || "").trim().toLowerCase();
      if (["creator", "influencer", "creator/influencer"].includes(type)) return "creator";
      return ["brand", "agency"].includes(type) ? type : "";
    };
    // The post's saved category is stable even if its owner later edits their
    // profile. Use the account type only for legacy rows without a saved type.
    const savedOwnerType = normalize(p.owner_type);
    if (savedOwnerType) return savedOwnerType;
    if (p.project_type === "creator_idea") return "creator";
    const accountType = normalize(ownerProfile?.account_type);
    if (accountType) return accountType;
    return "brand";
  }
  function buildCard(p, profilesById) {
    const ownerProfile = profilesById[p.owner_id] || {}, owner = ownerProfile.display_name || ownerProfile.company_name || "Member";
    const kind = projectKind(p, ownerProfile), idea = kind === "creator", agency = kind === "agency";
    const row = document.createElement("article"); row.className = "panel project item";
    row.dataset.kind = agency ? "agency" : idea ? "creator" : "brand"; row.dataset.status = String(p.status || "").toLowerCase(); row.dataset.owner = p.owner_id;
    row.dataset.applied = applications.some((a) => a.project_id === p.id && a.status !== "withdrawn"); row.dataset.saved = saved.has(p.id);
    row.dataset.category = p.category || ""; row.dataset.tier = (p.creator_tiers || []).join(","); row.dataset.platform = (p.platforms || []).join(","); row.dataset.location = p.location || "";
    row.dataset.search = `${p.project_name || ""} ${owner} ${p.requirements || ""} ${p.category || ""} ${(p.platforms || []).join(" ")} ${(p.creator_tiers || []).join(" ")} ${p.location || ""}`.toLowerCase();
    const applied = row.dataset.applied === "true", isSaved = row.dataset.saved === "true";
    const actions = p.owner_id === user.id
      ? `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a>`
      : `<button class="btn save ${isSaved ? "active" : ""}" data-save="${esc(p.id)}">${isSaved ? "♥ Saved" : "♡ Save"}</button><button class="btn" data-apply="${esc(p.id)}" data-project-name="${esc(p.project_name)}" ${applied ? "disabled" : ""}>${applied ? "Interest sent ✓" : "Interested ↗"}</button>`;
    row.innerHTML = `<div class="project-top"><div class="logo">${esc(owner.slice(0,2).toUpperCase())}</div><div class="meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(owner)}</a></b><span>${agency ? "Agency project" : idea ? "Creator idea" : "Brand project"} · ${esc(p.location || "Remote")}</span></div></div><h2>${esc(p.project_name)}</h2><p>${esc(p.requirements)}</p><div class="chips"><span class="chip">${esc(p.category || "Other")}</span>${(p.platforms || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<span class="chip">Apply by ${esc(p.application_deadline || "Open")}</span>${p.delivery_date ? `<span class="chip">Delivery by ${esc(p.delivery_date)}</span>` : ""}</div><div class="bottom"><small>${p.owner_id === user.id ? "Your post" : applied ? "You expressed interest" : "Open opportunity"}</small><div class="actions">${actions}</div></div>`;
    return row;
  }
  async function load() {
    const { data: { user: current }, error: authError } = await db.auth.getUser();
    if (authError || !current) throw new Error("Please log in to see your live projects and counts."); user = current;
    const [postResult, appResult, savedResult, ownResult] = await Promise.all([
      db.from("projects").select("*").order("created_at", { ascending: false }),
      db.from("applications").select("project_id,status").eq("applicant_id", user.id),
      db.from("saved_projects").select("project_id").eq("user_id", user.id),
      db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id)
    ]);
    for (const r of [postResult, appResult, savedResult, ownResult]) if (r.error) throw r.error;
    projects = postResult.data || []; applications = appResult.data || []; saved = new Set((savedResult.data || []).map((r) => r.project_id)); counts.owned = ownResult.count || 0;
    counts.applications = new Set(applications.filter((a) => a.status !== "withdrawn").map((a) => a.project_id)).size; counts.saved = saved.size;
    const owners = [...new Set(projects.map((p) => p.owner_id))];
    const { data: profiles, error: profileError } = owners.length ? await db.from("profiles").select("id,display_name,company_name,account_type").in("id", owners) : { data: [], error: null };
    if (profileError) throw profileError;
    profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const kindOf = (p) => projectKind(p, profilesById[p.owner_id]);
    counts.ideas = projects.filter((p) => kindOf(p) === "creator" && String(p.status).toLowerCase() === "open").length; counts.brands = projects.filter((p) => kindOf(p) === "brand" && String(p.status).toLowerCase() === "open").length; counts.agencies = projects.filter((p) => kindOf(p) === "agency" && String(p.status).toLowerCase() === "open").length;
    setCount("owned", counts.owned); setCount("applied", counts.applications); setCount("saved", counts.saved); setCount("ideas", counts.ideas); setCount("ideaTab", counts.ideas); setCount("brands", counts.brands); setCount("agency", counts.agencies); setCount("agencyTab", counts.agencies);
    host.querySelectorAll(".item").forEach((x) => x.remove());
    document.body.classList.add("bmc-projects-ready"); renderFilters();
  }
  function wire() {
    // projects.html contains legacy page handlers. Handle these controls during
    // capture, then stop those old handlers from applying a second visual-only filter.
    document.querySelectorAll(".segmented [data-kind]").forEach((b) => b.addEventListener("click", (event) => {
      event.preventDefault(); event.stopImmediatePropagation(); setKind(b.dataset.kind);
    }, true));
    document.querySelectorAll(".side-link[data-status]").forEach((b) => b.addEventListener("click", (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (b.dataset.status === "collab") { setKind("creator"); setScope("discover"); }
      else if (b.dataset.status === "agency") { setKind("agency"); setScope("discover"); }
      else if (b.dataset.status === "discover") { setKind("brand"); setScope("discover"); }
      else if (["applied", "saved"].includes(b.dataset.status)) setScope(b.dataset.status);
    }, true));
    ["q", "cat", "tier", "platform", "location"].forEach((id) => $("#" + id).addEventListener(id === "q" ? "input" : "change", renderFilters));
    $("#clear").onclick = () => { ["q", "cat", "tier", "platform", "location"].forEach((id, i) => $("#" + id).value = i ? "all" : ""); renderFilters(); };
    host.addEventListener("click", async (event) => {
      const saveButton = event.target.closest("[data-save]");
      if (saveButton) {
        saveButton.disabled = true; const id = saveButton.dataset.save;
        try {
          if (saved.has(id)) { const { error } = await db.from("saved_projects").delete().eq("user_id", user.id).eq("project_id", id); if (error) throw error; saved.delete(id); }
          else { const { error } = await db.from("saved_projects").insert({ user_id: user.id, project_id: id }); if (error) throw error; saved.add(id); }
          saveButton.textContent = saved.has(id) ? "♥ Saved" : "♡ Save"; saveButton.classList.toggle("active", saved.has(id));
          saveButton.closest(".item").dataset.saved = String(saved.has(id)); counts.saved = saved.size; setCount("saved", counts.saved); renderFilters();
        } catch (e) { toast(e.message); } finally { saveButton.disabled = false; }
      }
      const apply = event.target.closest("[data-apply]");
      if (apply) { event.preventDefault(); if (typeof window.bmcSubmitInterest !== "function") return toast("Interest form is still loading. Refresh and try again."); try { const sent = await window.bmcSubmitInterest(apply.dataset.apply, apply.dataset.projectName, apply); if (!sent) return; applications.push({ project_id: apply.dataset.apply, status: "interested" }); apply.closest(".item").dataset.applied = "true"; counts.applications = new Set(applications.map((x) => x.project_id)).size; setCount("applied", counts.applications); renderFilters(); } catch (e) { toast(e.message); } }
    });
  }
  try {
    db = await window.bmcSupabaseReady; if (!db) throw new Error(window.bmcSupabaseError || "Supabase is unavailable.");
    wire(); host.querySelectorAll(".item").forEach((x) => x.remove());
    await load(); setScope(scope); setInterval(() => load().catch((e) => { console.error(e); }), 30000);
  } catch (error) {
    console.error("Live project directory could not load:", error); host.querySelectorAll(".item").forEach((x) => x.remove());
    empty.textContent = `Could not load live projects: ${error.message || "check Supabase connection and policies"}`; empty.classList.remove("hidden"); document.body.classList.add("bmc-projects-ready");
  }
})();
