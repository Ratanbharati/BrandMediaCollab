// Live Supabase-backed project discovery, category tabs, filters, saves and interest actions.
(async function () {
  window.bmcProjectsDirectoryHandled = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const host = $("#list"), empty = $("#empty");
  if (!host || !empty) return;

  let db, user, projects = [], applications = [], saved = new Set(), profilesById = {};
  let scope = ["owned", "applied", "saved"].includes(new URLSearchParams(location.search).get("scope")) ? new URLSearchParams(location.search).get("scope") : "discover";
  let activeKind = new URLSearchParams(location.search).get("kind");
  if (!["brand", "creator", "agency"].includes(activeKind)) activeKind = "brand";
  let channel, refreshTimer, loadInFlight = false, refreshQueued = false, realtimeConnected = false, deepLinkOpened = false;
  const counts = { owned: 0, applications: 0, saved: 0, ideas: 0, brands: 0, agencies: 0 };

  function toast(message) {
    const node = $("#toast");
    if (!node) return;
    node.textContent = message; node.classList.add("show");
    window.setTimeout(() => node.classList.remove("show"), 2600);
  }
  function setCount(name, value) {
    document.querySelectorAll(`[data-count="${name}"]`).forEach((node) => { node.textContent = String(value); });
  }
  function accountKind(value) {
    const type = String(value || "").trim().toLowerCase();
    if (["creator", "influencer", "creator/influencer"].includes(type)) return "creator";
    return ["brand", "agency"].includes(type) ? type : "";
  }
  function projectKind(project) {
    const type = String(project.project_type || "").trim().toLowerCase();
    if (["creator_idea", "creator", "idea"].includes(type)) return "creator";
    const owner = accountKind(project.owner_type || profilesById[project.owner_id]?.account_type);
    // The current database represents agency campaigns as brand_campaign rows
    // with owner_type=agency. Keep them in their own category.
    if (["agency_campaign", "agency_project", "agency"].includes(type)) return "agency";
    if (["brand_campaign", "brand", "campaign"].includes(type)) return owner === "agency" ? "agency" : "brand";
    return owner || "brand";
  }
  function filterValues(projects, field) {
    const values = new Set();
    projects.forEach((project) => {
      const value = project[field];
      (Array.isArray(value) ? value : [value]).filter(Boolean).forEach((item) => values.add(String(item).trim()));
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }
  function populateSelect(selector, label, values) {
    const select = $(selector); if (!select) return;
    const previous = select.value;
    select.replaceChildren(new Option(label, "all"), ...values.map((value) => new Option(value, value)));
    if (values.includes(previous)) select.value = previous;
  }
  function renderFilterChoices() {
    const available = projects.filter((project) => {
      if (projectKind(project) !== activeKind) return false;
      if (scope === "owned") return project.owner_id === user.id;
      if (scope === "applied") return applications.some((item) => item.project_id === project.id && item.status !== "withdrawn");
      if (scope === "saved") return saved.has(project.id);
      return project.owner_id !== user.id && String(project.status).toLowerCase() === "open";
    });
    populateSelect("#cat", "All categories", filterValues(available, "category"));
    populateSelect("#tier", "Any creator tier", filterValues(available, "creator_tiers"));
    populateSelect("#platform", "Any platform", filterValues(available, "platforms"));
    populateSelect("#location", "Any location", filterValues(available, "location"));
  }
  function projectMatches(project) {
    const query = $("#q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const category = $("#cat").value.toLowerCase(), tier = $("#tier").value.toLowerCase();
    const platform = $("#platform").value.toLowerCase(), locationValue = $("#location").value.toLowerCase();
    const owner = profilesById[project.owner_id] || {};
    const haystack = [project.project_name, project.requirements, project.category, project.location,
      owner.display_name, owner.company_name, owner.account_type, project.project_type,
      ...(project.platforms || []), ...(project.creator_tiers || []),
      ...(Array.isArray(project.budget_by_deliverable) ? project.budget_by_deliverable.flatMap((item) => [item.deliverable, item.amount_range]) : [])]
      .filter(Boolean).join(" ").toLowerCase();
    const scopeMatches = scope === "owned" ? project.owner_id === user.id
      : scope === "applied" ? applications.some((item) => item.project_id === project.id && item.status !== "withdrawn")
      : scope === "saved" ? saved.has(project.id)
      : project.owner_id !== user.id && String(project.status).toLowerCase() === "open";
    return projectKind(project) === activeKind && scopeMatches
      && query.every((term) => haystack.includes(term))
      && (category === "all" || String(project.category || "").toLowerCase() === category)
      && (tier === "all" || (project.creator_tiers || []).some((value) => String(value).toLowerCase() === tier))
      && (platform === "all" || (project.platforms || []).some((value) => String(value).toLowerCase() === platform))
      && (locationValue === "all" || String(project.location || "").toLowerCase().includes(locationValue));
  }
  function renderFilters() {
    if (!user) return;
    renderFilterChoices();
    const visible = projects.filter(projectMatches);
    host.querySelectorAll(".item").forEach((row) => row.remove());
    visible.forEach((project) => host.insertBefore(buildCard(project), empty));
    const messages = {
      owned: "You haven’t posted anything in this category yet.",
      applied: "You have no applications in this category yet.",
      saved: "You haven’t saved anything in this category yet.",
      discover: "No live posts match this category and these filters yet.",
    };
    empty.textContent = visible.length ? "" : messages[scope];
    empty.classList.toggle("hidden", visible.length > 0);
    const resultCount = $("#project-result-count");
    if (resultCount) resultCount.textContent = `${visible.length} ${visible.length === 1 ? "project" : "projects"}`;
    const deepLink = new URLSearchParams(location.search).get("project");
    if (!deepLinkOpened && deepLink && visible.some((project) => project.id === deepLink)) { deepLinkOpened = true; openDetails(deepLink); }
  }
  function setKind(kind) {
    if (!["brand", "creator", "agency"].includes(kind)) return;
    activeKind = kind;
    document.querySelectorAll(".segmented [data-kind]").forEach((button) => {
      const active = button.dataset.kind === kind;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active));
    });
    if (scope === "discover") {
      document.querySelectorAll(".side-link[data-status]").forEach((link) => link.classList.toggle("active", link.dataset.status === (kind === "creator" ? "collab" : kind === "agency" ? "agency" : "discover")));
    }
    const url = new URL(location.href); url.searchParams.set("kind", kind); history.replaceState({}, "", url);
    renderFilters();
  }
  function setScope(next) {
    if (!["discover", "owned", "applied", "saved"].includes(next)) return;
    scope = next;
    document.querySelectorAll(".side-link[data-status]").forEach((link) => link.classList.toggle("active", link.dataset.status === (next === "discover" ? (activeKind === "creator" ? "collab" : activeKind === "agency" ? "agency" : "discover") : next)));
    const url = new URL(location.href); if (next === "discover") url.searchParams.delete("scope"); else url.searchParams.set("scope", next); history.replaceState({}, "", url);
    renderFilters();
  }
  function formatDate(value) { if (!value) return "Not set"; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  function buildCard(project) {
    const owner = profilesById[project.owner_id] || {};
    const name = owner.display_name || owner.company_name || "Stagerang member";
    const kind = projectKind(project), label = kind === "agency" ? "Agency project" : kind === "creator" ? "Creator idea" : "Brand project";
    const applied = applications.some((item) => item.project_id === project.id && item.status !== "withdrawn");
    const isSaved = saved.has(project.id), own = project.owner_id === user.id;
    const card = document.createElement("article"); card.className = "panel project item"; card.dataset.projectId = project.id;
    const budgetRows = Array.isArray(project.budget_by_deliverable) ? project.budget_by_deliverable : [];
    const budgets = budgetRows.map((item) => `<span class="chip">${esc(item.deliverable || "Deliverable")}${item.amount_range ? ` · ${esc(item.amount_range)}` : ""}</span>`).join("");
    card.innerHTML = `<div class="project-top"><div class="logo">${esc(name.slice(0, 2).toUpperCase())}</div><div class="meta"><b><a href="/site/my-profile.html?user=${encodeURIComponent(project.owner_id)}">${esc(name)}</a></b><span>${label} · ${esc(project.location || "Remote")}</span></div><span class="badge">${esc(String(project.status || "Open"))}</span></div><button class="project-card-title" type="button" data-details="${esc(project.id)}">${esc(project.project_name)}</button><p>${esc(project.requirements)}</p><div class="chips"><span class="chip">${esc(project.category || "Other")}</span>${(project.platforms || []).map((item) => `<span class="chip">${esc(item)}</span>`).join("")}${(project.creator_tiers || []).map((item) => `<span class="chip">${esc(item)} creator</span>`).join("")}${budgets}</div><div class="chips"><span class="chip">Apply by ${esc(formatDate(project.application_deadline))}</span><span class="chip">Delivery ${esc(formatDate(project.delivery_date))}</span></div><div class="bottom"><small>${own ? "Your project" : applied ? "Interest already sent" : "Open opportunity"}</small><div class="actions">${own ? `<a class="btn" href="/site/project-form.html?id=${encodeURIComponent(project.id)}">Edit</a>` : `<button class="btn save ${isSaved ? "active" : ""}" type="button" data-save="${esc(project.id)}" aria-pressed="${isSaved}">${isSaved ? "♥ Saved" : "♡ Save"}</button><button class="btn" type="button" data-details="${esc(project.id)}">View details</button><button class="btn" type="button" data-apply="${esc(project.id)}" data-project-name="${esc(project.project_name)}" ${applied ? "disabled" : ""}>${applied ? "Interest sent ✓" : "Interested ↗"}</button><button class="btn" type="button" data-share="${esc(project.id)}">Share</button>`}</div></div>`;
    return card;
  }
  function openDetails(projectId) {
    const project = projects.find((item) => item.id === projectId); if (!project) return;
    const owner = profilesById[project.owner_id] || {}, kind = projectKind(project);
    const dialog = document.createElement("dialog"); dialog.className = "project-details-dialog";
    const budget = Array.isArray(project.budget_by_deliverable) ? project.budget_by_deliverable : [];
    const budgetMarkup = budget.length ? `<section><h3>Budget & deliverables</h3>${budget.map((item) => `<p><strong>${esc(item.deliverable || "Deliverable")}</strong>${item.amount_range ? ` · ${esc(item.amount_range)}` : ""}</p>`).join("")}</section>` : "";
    dialog.innerHTML = `<article class="project-details-sheet"><button class="details-close" type="button" aria-label="Close project details">×</button><span class="badge">${kind === "agency" ? "Agency project" : kind === "creator" ? "Creator idea" : "Brand project"}</span><h2>${esc(project.project_name)}</h2><p class="details-owner"><a href="/site/my-profile.html?user=${encodeURIComponent(project.owner_id)}">${esc(owner.display_name || owner.company_name || "Stagerang member")}</a> · ${esc(project.location || "Remote")}</p><p>${esc(project.requirements)}</p>${budgetMarkup}<section><h3>Eligibility</h3><p>${esc((project.creator_tiers || []).join(", ") || "Open creator tier")}${project.platforms?.length ? ` · ${esc(project.platforms.join(", "))}` : ""}</p></section><section><h3>Timeline</h3><p>Applications close ${esc(formatDate(project.application_deadline))}; delivery ${esc(formatDate(project.delivery_date))}.</p></section>${project.usage_permissions ? `<section><h3>Usage permissions</h3><p>${esc(project.usage_permissions)}</p></section>` : ""}${project.reshare_permissions ? `<section><h3>Reshare permissions</h3><p>${esc(project.reshare_permissions)}</p></section>` : ""}<div class="details-actions"><a class="btn" href="/site/my-profile.html?user=${encodeURIComponent(project.owner_id)}">View profile</a>${project.owner_id !== user.id ? `<button class="btn" type="button" data-detail-apply="${esc(project.id)}">Express interest</button>` : `<a class="btn" href="/site/project-form.html?id=${encodeURIComponent(project.id)}">Edit project</a>`}</div></article>`;
    document.body.append(dialog); dialog.showModal();
    $(".details-close", dialog).addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove());
    $("[data-detail-apply]", dialog)?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { const sent = await window.bmcSubmitInterest(project.id, project.project_name, button); if (sent) { await load(); dialog.close(); } }
      catch (error) { toast(error.message || "Could not send interest."); }
      finally { if (button.isConnected) button.disabled = false; }
    });
  }
  async function load() {
    if (loadInFlight) { refreshQueued = true; return; }
    loadInFlight = true;
    try {
      const { data: { user: current }, error: authError } = await db.auth.getUser();
      if (authError || !current) throw new Error("Please log in to browse and manage projects.");
      user = current;
      const [postsResult, appsResult, savedResult, ownedResult] = await Promise.all([
        db.from("projects").select("*").order("created_at", { ascending: false }),
        db.from("applications").select("project_id,status").eq("applicant_id", user.id),
        db.from("saved_projects").select("project_id").eq("user_id", user.id),
        db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      ]);
      if (postsResult.error) throw postsResult.error;
      projects = postsResult.data || [];
      applications = appsResult.error ? [] : appsResult.data || [];
      saved = new Set(savedResult.error ? [] : (savedResult.data || []).map((row) => row.project_id));
      counts.owned = ownedResult.error ? projects.filter((project) => project.owner_id === user.id).length : ownedResult.count || 0;
      counts.applications = new Set(applications.filter((item) => item.status !== "withdrawn").map((item) => item.project_id)).size;
      counts.saved = saved.size;

      const owners = [...new Set(projects.map((project) => project.owner_id))];
      const profileResult = owners.length ? await db.from("profiles").select("id,display_name,company_name,account_type").in("id", owners) : { data: [], error: null };
      profilesById = Object.fromEntries((profileResult.data || []).map((profile) => [profile.id, profile]));
      const discoverable = projects.filter((project) => String(project.status).toLowerCase() === "open" && project.owner_id !== user.id);
      counts.brands = discoverable.filter((project) => projectKind(project) === "brand").length;
      counts.ideas = discoverable.filter((project) => projectKind(project) === "creator").length;
      counts.agencies = discoverable.filter((project) => projectKind(project) === "agency").length;
      setCount("owned", counts.owned); setCount("applied", counts.applications); setCount("saved", counts.saved);
      setCount("ideas", counts.ideas); setCount("ideaTab", counts.ideas); setCount("brands", counts.brands); setCount("agency", counts.agencies); setCount("agencyTab", counts.agencies);
      renderFilterChoices();
      document.body.classList.add("bmc-projects-ready");
      if (appsResult.error || savedResult.error || profileResult.error) toast("Some activity details could not load. Project listings are still available.");
      renderFilters();
    } finally {
      loadInFlight = false;
      if (refreshQueued) { refreshQueued = false; scheduleRefresh(0); }
    }
  }
  function scheduleRefresh(delay = 250) {
    window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => load().catch(showLoadError), delay);
  }
  function showLoadError(error) {
    console.error("Live project directory could not load:", error);
    host.querySelectorAll(".item").forEach((row) => row.remove());
    empty.innerHTML = `<span>${esc(error.message || "Projects could not load. Check your connection, then retry.")}</span><br><button class="btn" type="button" id="retry-projects">Retry</button>`;
    empty.classList.remove("hidden"); document.body.classList.add("bmc-projects-ready");
    $("#retry-projects")?.addEventListener("click", () => load().catch(showLoadError));
  }
  function subscribeRealtime() {
    if (channel || !db || !user) return;
    channel = db.channel(`projects-directory-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "saved_projects", filter: `user_id=eq.${user.id}` }, () => scheduleRefresh())
      .subscribe((status) => { realtimeConnected = status === "SUBSCRIBED"; });
    window.setInterval(() => { if (!realtimeConnected) scheduleRefresh(0); }, 30000);
  }
  function wire() {
    document.querySelectorAll(".segmented [data-kind]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); setKind(button.dataset.kind); }));
    document.querySelectorAll(".side-link[data-status]").forEach((button) => button.addEventListener("click", (event) => {
      const status = button.dataset.status;
      if (status === "collab") { event.preventDefault(); setScope("discover"); setKind("creator"); }
      else if (status === "agency") { event.preventDefault(); setScope("discover"); setKind("agency"); }
      else if (status === "discover") { event.preventDefault(); setScope("discover"); setKind("brand"); }
      else if (["applied", "saved"].includes(status)) { event.preventDefault(); setScope(status); }
    }));
    document.querySelectorAll("[data-mobile-kind]").forEach((button) => button.addEventListener("click", () => {
      $(".mobile-project-menu")?.removeAttribute("open"); setScope("discover"); setKind(button.dataset.mobileKind);
    }));
    $("[data-mobile-scope='discover']")?.addEventListener("click", () => { $(".mobile-project-menu")?.removeAttribute("open"); setScope("discover"); setKind("brand"); });
    ["q", "cat", "tier", "platform", "location"].forEach((id) => $("#" + id)?.addEventListener(id === "q" ? "input" : "change", renderFilters));
    $("#clear")?.addEventListener("click", () => { ["q", "cat", "tier", "platform", "location"].forEach((id, index) => { const input = $("#" + id); if (input) input.value = index ? "all" : ""; }); renderFilters(); });
    host.addEventListener("click", async (event) => {
      const target = event.target.closest("button"); if (!target) return;
      const project = projects.find((item) => item.id === target.dataset.save || item.id === target.dataset.apply || item.id === target.dataset.details || item.id === target.dataset.share);
      if (target.dataset.details) return openDetails(target.dataset.details);
      if (target.dataset.share && project) {
        const url = new URL(`/site/projects.html?kind=${projectKind(project)}&project=${encodeURIComponent(project.id)}`, location.origin).href;
        try { if (navigator.share) await navigator.share({ title: project.project_name, url }); else { await navigator.clipboard.writeText(url); toast("Project link copied."); } } catch (error) { if (error.name !== "AbortError") toast("Could not share this project link."); }
      }
      if (target.dataset.save) {
        target.disabled = true;
        try {
          if (saved.has(project.id)) { const { error } = await db.from("saved_projects").delete().eq("user_id", user.id).eq("project_id", project.id); if (error) throw error; saved.delete(project.id); }
          else { const { error } = await db.from("saved_projects").insert({ user_id: user.id, project_id: project.id }); if (error) throw error; saved.add(project.id); }
          counts.saved = saved.size; setCount("saved", counts.saved); toast(saved.has(project.id) ? "Project saved." : "Project removed from saved items."); renderFilters();
        } catch (error) { toast(error.message || "Could not save this project."); }
        finally { target.disabled = false; }
      }
      if (target.dataset.apply && project) {
        target.disabled = true;
        try {
          if (typeof window.bmcSubmitInterest !== "function") throw new Error("Interest form is still loading. Retry in a moment.");
          const sent = await window.bmcSubmitInterest(project.id, project.project_name, target);
          if (sent) { await load(); }
        } catch (error) { toast(error.message || "Could not send interest."); }
        finally { if (target.isConnected) target.disabled = false; }
      }
    });
  }
  try {
    wire();
    db = await window.bmcSupabaseReady;
    if (!db) throw new Error(window.bmcSupabaseError || "Supabase is unavailable.");
    await load(); subscribeRealtime();
    window.bmcLoadProjectsDirectory = load;
  } catch (error) { showLoadError(error); }
})();
