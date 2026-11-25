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
  const projectKinds = ["brand", "creator", "agency", "celebrity", "event", "media", "community", "distributor", "freelancer"];
  if (!projectKinds.includes(activeKind)) activeKind = "brand";
  let channel, refreshTimer, loadInFlight = false, refreshQueued = false, realtimeConnected = false, deepLinkOpened = false;
  const counts = { owned: 0, applications: 0, saved: 0, ideas: 0, brands: 0, agencies: 0, celebrities: 0, events: 0, media: 0, communities: 0, distributors: 0, freelancers: 0 };

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
    return projectKinds.includes(type) ? type : "";
  }
  function projectKind(project) {
    const type = String(project.project_type || "").trim().toLowerCase();
    if (["creator_idea", "creator", "idea"].includes(type)) return "creator";
    for (const kind of ["celebrity", "event", "media", "community", "distributor", "freelancer"]) if ([`${kind}_project`, kind, ...(kind === "distributor" ? ["distribution_project"] : kind === "freelancer" ? ["freelance_project"] : [])].includes(type)) return kind;
    const owner = accountKind(project.owner_type || profilesById[project.owner_id]?.account_type);
    // The current database represents agency campaigns as brand_campaign rows
    // with owner_type=agency. Keep them in their own category.
    if (["agency_campaign", "agency_project", "agency"].includes(type)) return "agency";
    if (["brand_campaign", "brand", "campaign"].includes(type)) return owner === "agency" ? "agency" : "brand";
    return owner || "brand";
  }
  function projectState(project) {
    const application = applications.find((item) => item.project_id === project.id);
    return window.bmcProjectUiState ? window.bmcProjectUiState(project, application) : { closed: String(project.status).toLowerCase() !== "open", action: application?.status === "working_together" ? "chat" : application?.status === "interested" ? "sent" : "apply", label: application?.status === "working_together" ? "Working together" : application?.status === "interested" ? "Interest sent" : "Open opportunity", statusLabel: String(project.status || "Open") };
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
    populateSelect("#target-type", "Any collaborator", [...new Set(available.flatMap((project) => project.target_profile_types || []))].sort());
  }
  function projectMatches(project) {
    const query = $("#q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const category = $("#cat").value.toLowerCase(), tier = $("#tier").value.toLowerCase();
    const platform = $("#platform").value.toLowerCase(), locationValue = $("#location").value.toLowerCase();
    const targetType = $("#target-type")?.value.toLowerCase() || "all";
    const skill = $("#skill")?.value.trim().toLowerCase() || "", language = $("#language")?.value.trim().toLowerCase() || "";
    const owner = profilesById[project.owner_id] || {};
    const haystack = [project.project_name, project.requirements, project.category, project.location,
      owner.display_name, owner.company_name, owner.account_type, project.project_type,
      ...(project.platforms || []), ...(project.creator_tiers || []), ...(project.target_profile_types || []), ...(project.required_skills || []), ...(project.required_languages || []),
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
      && (locationValue === "all" || String(project.location || "").toLowerCase().includes(locationValue))
      && (targetType === "all" || !(project.target_profile_types || []).length || (project.target_profile_types || []).map((value) => String(value).toLowerCase()).includes(targetType))
      && (!skill || (project.required_skills || []).some((value) => String(value).toLowerCase().includes(skill)))
      && (!language || (project.required_languages || []).some((value) => String(value).toLowerCase().includes(language)));
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
    if (!projectKinds.includes(kind)) return;
    activeKind = kind;
    document.querySelectorAll(".segmented [data-kind]").forEach((button) => {
      const active = button.dataset.kind === kind;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active));
    });
    if (scope === "discover") {
      document.querySelectorAll(".side-link[data-status]").forEach((link) => link.classList.toggle("active", link.dataset.status === (kind === "creator" ? "collab" : kind === "agency" ? "agency" : "discover")));
      document.querySelectorAll(".side-link[data-side-kind]").forEach((link) => link.classList.toggle("active", link.dataset.sideKind === kind));
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
  async function reportProject(projectId) {
    const allowed = ["spam", "harassment", "impersonation", "unsafe_content", "fraud", "other"];
    const reason = (prompt(`Choose a reason: ${allowed.join(", ")}`, "other") || "").trim().toLowerCase();
    if (!allowed.includes(reason)) throw new Error("Enter one of the listed report reasons.");
    const description = (prompt("Please describe the concern (at least 10 characters):") || "").trim();
    if (description.length < 10) throw new Error("Add a little more detail before submitting.");
    const { data: { session } } = await db.auth.getSession();
    const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify({ targetProjectId: projectId, reason, description }) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Could not submit this report.");
    toast("Report sent to the moderation team.");
  }
  function buildCard(project) {
    const owner = profilesById[project.owner_id] || {};
    const name = owner.display_name || owner.company_name || "Brand Media Collab member";
    const kind = projectKind(project), label = ({ agency: "Agency project", creator: "Creator idea", celebrity: "Celebrity project", event: "Event project", media: "Media project", community: "Community partnership", distributor: "Distribution partnership", freelancer: "Freelance assignment", brand: "Brand project" })[kind];
    const state = projectState(project);
    const isSaved = saved.has(project.id), own = project.owner_id === user.id;
    const card = document.createElement("article"); card.className = "panel project item"; card.dataset.projectId = project.id;
    const budgetRows = Array.isArray(project.budget_by_deliverable) ? project.budget_by_deliverable : [];
    const budgets = budgetRows.map((item) => `<span class="chip">${esc(item.deliverable || "Deliverable")}${item.amount_range ? ` · ${esc(item.amount_range)}` : ""}</span>`).join("");
    const primaryAction = own ? `<a class="btn" href="/site/project-form.html?id=${encodeURIComponent(project.id)}">Edit</a>`
      : state.action === "apply" ? `<button class="btn" type="button" data-apply="${esc(project.id)}" data-project-name="${esc(project.project_name)}">Interested</button>`
      : state.action === "chat" ? `<button class="btn" type="button" data-open-chat="${esc(project.id)}">Open chat</button>`
      : `<button class="btn" type="button" disabled>${state.action === "sent" ? "Interest sent ✓" : state.action === "passed" ? "Not selected" : "Closed"}</button>`;
    card.innerHTML = `<div class="project-top"><div class="logo">${esc(name.slice(0, 2).toUpperCase())}</div><div class="meta"><b><a href="/site/my-profile.html?user=${encodeURIComponent(project.owner_id)}">${esc(name)}</a></b><span>${label} · ${esc(project.location || "Remote")}</span></div><span class="badge">${esc(state.statusLabel)}</span></div><button class="project-card-title" type="button" data-details="${esc(project.id)}">${esc(project.project_name)}</button><p>${esc(project.requirements)}</p><div class="chips"><span class="chip">${esc(project.category || "Other")}</span>${(project.platforms || []).map((item) => `<span class="chip">${esc(item)}</span>`).join("")}${(project.creator_tiers || []).map((item) => `<span class="chip">${esc(item)} creator</span>`).join("")}${budgets}</div><div class="chips"><span class="chip">Apply by ${esc(formatDate(project.application_deadline))}</span><span class="chip">Delivery ${esc(formatDate(project.delivery_date))}</span></div><div class="bottom"><small>${own ? "Your project" : state.label}</small><div class="actions">${own ? "" : `<button class="btn save ${isSaved ? "active" : ""}" type="button" data-save="${esc(project.id)}" aria-pressed="${isSaved}">${isSaved ? "♥ Saved" : "♡ Save"}</button><button class="btn" type="button" data-details="${esc(project.id)}">View details</button>${primaryAction}<button class="btn" type="button" data-share="${esc(project.id)}">Share</button>`}${own ? primaryAction : ""}</div></div>`;
    if (!own) { const report = document.createElement("button"); report.type = "button"; report.className = "btn"; report.textContent = "Report"; report.onclick = async () => { report.disabled = true; try { await reportProject(project.id); } catch (error) { toast(error.message || "Could not submit this report."); } finally { report.disabled = false; } }; card.querySelector(".actions")?.append(report); }
    return card;
  }
  function openDetails(projectId) {
    const project = projects.find((item) => item.id === projectId); if (!project) return;
    const owner = profilesById[project.owner_id] || {}, kind = projectKind(project);
    const state = projectState(project);
    const dialog = document.createElement("dialog"); dialog.className = "project-details-dialog";
    const budget = Array.isArray(project.budget_by_deliverable) ? project.budget_by_deliverable : [];
    const budgetMarkup = budget.length ? `<section><h3>Budget & deliverables</h3>${budget.map((item) => `<p><strong>${esc(item.deliverable || "Deliverable")}</strong>${item.amount_range ? ` · ${esc(item.amount_range)}` : ""}</p>`).join("")}</section>` : "";
    const detailAction = project.owner_id === user.id ? `<a class="btn" href="/site/project-form.html?id=${encodeURIComponent(project.id)}">Edit project</a>`
      : state.action === "apply" ? `<button class="btn" type="button" data-detail-apply="${esc(project.id)}">Express interest</button>`
      : state.action === "chat" ? `<button class="btn" type="button" data-detail-chat="${esc(project.id)}">Open project chat</button>`
      : `<button class="btn" type="button" disabled>${state.action === "sent" ? "Interest sent" : state.action === "passed" ? "Not selected" : "Closed"}</button>`;
    dialog.innerHTML = `<article class="project-details-sheet"><button class="details-close" type="button" aria-label="Close project details">×</button><span class="badge">${({ agency: "Agency project", creator: "Creator idea", celebrity: "Celebrity project", event: "Event project", media: "Media project", community: "Community partnership", distributor: "Distribution partnership", freelancer: "Freelance assignment", brand: "Brand project" })[kind]}</span><h2>${esc(project.project_name)}</h2><p class="details-owner"><a href="/site/my-profile.html?user=${encodeURIComponent(project.owner_id)}">${esc(owner.display_name || owner.company_name || "Brand Media Collab member")}</a> · ${esc(project.location || "Remote")}</p><p>${esc(project.requirements)}</p>${budgetMarkup}<section><h3>Eligibility</h3><p>${esc((project.target_profile_types || project.creator_tiers || []).join(", ") || "Open to collaborators")}${project.platforms?.length ? ` · ${esc(project.platforms.join(", "))}` : ""}${project.required_skills?.length ? ` · Skills: ${esc(project.required_skills.join(", "))}` : ""}</p></section><section><h3>Timeline</h3><p>Applications close ${esc(formatDate(project.application_deadline))}; delivery ${esc(formatDate(project.delivery_date))}.</p></section>${project.usage_permissions ? `<section><h3>Usage permissions</h3><p>${esc(project.usage_permissions)}</p></section>` : ""}${project.reshare_permissions ? `<section><h3>Reshare permissions</h3><p>${esc(project.reshare_permissions)}</p></section>` : ""}<div class="details-actions"><a class="btn" href="/site/my-profile.html?user=${encodeURIComponent(project.owner_id)}">View profile</a>${detailAction}</div></article>`;
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
    $("[data-detail-chat]", dialog)?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { await window.bmcOpenProjectConversation(project.id); }
      catch (error) { button.disabled = false; toast(error.message || "Could not open the project conversation."); }
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
      if (appsResult.error) throw appsResult.error;
      if (savedResult.error) throw savedResult.error;
      projects = postsResult.data || [];
      applications = appsResult.data || [];
      saved = new Set((savedResult.data || []).map((row) => row.project_id));
      counts.owned = ownedResult.error ? projects.filter((project) => project.owner_id === user.id).length : ownedResult.count || 0;
      counts.applications = new Set(applications.filter((item) => item.status !== "withdrawn").map((item) => item.project_id)).size;
      counts.saved = saved.size;

      const owners = [...new Set(projects.map((project) => project.owner_id))];
      const profileResult = owners.length ? await db.from("profiles").select("id,display_name,company_name,account_type").in("id", owners) : { data: [], error: null };
      if (profileResult.error) throw profileResult.error;
      profilesById = Object.fromEntries((profileResult.data || []).map((profile) => [profile.id, profile]));
      const discoverable = projects.filter((project) => String(project.status).toLowerCase() === "open" && project.owner_id !== user.id);
      counts.brands = discoverable.filter((project) => projectKind(project) === "brand").length;
      counts.ideas = discoverable.filter((project) => projectKind(project) === "creator").length;
      counts.agencies = discoverable.filter((project) => projectKind(project) === "agency").length;
      counts.celebrities = discoverable.filter((project) => projectKind(project) === "celebrity").length;
      counts.events = discoverable.filter((project) => projectKind(project) === "event").length;
      counts.media = discoverable.filter((project) => projectKind(project) === "media").length;
      counts.communities = discoverable.filter((project) => projectKind(project) === "community").length;
      counts.distributors = discoverable.filter((project) => projectKind(project) === "distributor").length;
      counts.freelancers = discoverable.filter((project) => projectKind(project) === "freelancer").length;
      setCount("owned", counts.owned); setCount("applied", counts.applications); setCount("saved", counts.saved);
      setCount("ideas", counts.ideas); setCount("ideaTab", counts.ideas); setCount("brands", counts.brands); setCount("agency", counts.agencies); setCount("agencyTab", counts.agencies);
      setCount("celebrityTab", counts.celebrities); setCount("eventTab", counts.events); setCount("mediaTab", counts.media);
      setCount("celebrity", counts.celebrities); setCount("event", counts.events); setCount("media", counts.media);
      setCount("communityTab", counts.communities); setCount("distributorTab", counts.distributors); setCount("freelancerTab", counts.freelancers);
      setCount("community", counts.communities); setCount("distributor", counts.distributors); setCount("freelancer", counts.freelancers);
      renderFilterChoices();
      document.body.classList.add("bmc-projects-ready");
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
    document.querySelectorAll(".side-link[data-side-kind]").forEach((button) => button.addEventListener("click", () => { setScope("discover"); setKind(button.dataset.sideKind); }));
    document.querySelectorAll("[data-mobile-kind]").forEach((button) => button.addEventListener("click", () => {
      $(".mobile-project-menu")?.removeAttribute("open"); setScope("discover"); setKind(button.dataset.mobileKind);
    }));
    $("[data-mobile-scope='discover']")?.addEventListener("click", () => { $(".mobile-project-menu")?.removeAttribute("open"); setScope("discover"); setKind("brand"); });
    ["q", "skill", "language", "cat", "tier", "platform", "location", "target-type"].forEach((id) => $("#" + id)?.addEventListener(["q", "skill", "language"].includes(id) ? "input" : "change", renderFilters));
    $("#clear")?.addEventListener("click", () => { ["q", "skill", "language", "cat", "tier", "platform", "location", "target-type"].forEach((id) => { const input = $("#" + id); if (input) input.value = ["q", "skill", "language"].includes(id) ? "" : "all"; }); renderFilters(); });
    host.addEventListener("click", async (event) => {
      const target = event.target.closest("button"); if (!target) return;
      const project = projects.find((item) => item.id === target.dataset.save || item.id === target.dataset.apply || item.id === target.dataset.details || item.id === target.dataset.share || item.id === target.dataset.openChat);
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
      if (target.dataset.openChat && project) {
        target.disabled = true;
        try { await window.bmcOpenProjectConversation(project.id); }
        catch (error) { target.disabled = false; toast(error.message || "Could not open the project conversation."); }
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
