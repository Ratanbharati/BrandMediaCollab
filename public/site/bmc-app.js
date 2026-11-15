// Supabase wiring for the prototype pages: authentication, profile save, and project CRUD.
// Uses the publishable key only; authorization is enforced by Supabase RLS.
(function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  async function client() {
    if (!window.bmcSupabaseReady) throw new Error("Supabase setup script is missing.");
    const supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");
    return supabase;
  }
  function toast(message) {
    const node = $("#toast") || $("#notice");
    if (node) { node.textContent = message; node.classList.add("show"); }
    else alert(message);
  }
  async function signedIn(supabase) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Please log in first, then try again.");
    return user;
  }
  async function authSubmit(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const form = event.currentTarget;
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const isSignup = $(".tab.active")?.dataset.mode !== "login";
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const supabase = await client();
      if (isSignup) {
        const displayName = $("#full-name").value.trim();
        const chosen = $(".role-chip.selected")?.dataset.role || "Influencer";
        const accountType = chosen.toLowerCase() === "influencer" ? "creator" : chosen.toLowerCase();
        sessionStorage.setItem("bmc_signup_type", accountType);
        sessionStorage.setItem("bmc_signup_name", displayName);
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { account_type: accountType, display_name: displayName }, emailRedirectTo: `${location.origin}/site/profile-setup.html` },
        });
        if (error) throw error;
        if (!data.session) {
          toast("Account created. Check your email to confirm it, then log in to finish your profile.");
          return;
        }
        location.href = "profile-setup.html";
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = "feed.html";
      }
    } catch (error) { toast(error.message || "Account request failed."); }
    finally { button.disabled = false; }
  }
  async function saveProfile(complete) {
    const supabase = await client();
    const user = await signedIn(supabase);
    const accountType = sessionStorage.getItem("bmc_signup_type") || $("[data-type].selected")?.dataset.type || "creator";
    const isOrg = accountType === "brand" || accountType === "agency";
    const displayName = (isOrg ? $("#company")?.value : $("#display-name")?.value)?.trim() || sessionStorage.getItem("bmc_signup_name") || "";
    const contentCategories = [...document.querySelectorAll(".tag.selected")].map((x) => x.textContent.trim()).filter(Boolean);
    const payload = {
      id: user.id, account_type: accountType, display_name: displayName,
      avatar_url: window.bmcAvatarUrl || window.bmcExistingAvatarUrl || null,
      company_name: isOrg ? displayName : null,
      agency_type: accountType === "agency" ? $("#agency-type")?.value || null : null,
      bio: (isOrg ? $("#company-bio")?.value : $("#bio")?.value)?.trim() || "",
      category: $(isOrg ? "#category" : "#category")?.value || null,
      location: $(isOrg ? "#market" : "#location")?.value?.trim() || null,
      website_url: (isOrg ? $("#company-site")?.value : $("#website")?.value)?.trim() || null,
      content_categories: contentCategories,
      is_discoverable: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("profiles").upsert(payload);
    if (error) throw error;
    const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName, account_type: accountType } });
    if (metadataError) throw metadataError;
    const contact = { user_id: user.id, email: user.email || null, phone: $("#phone")?.value?.trim() || null };
    const { error: contactError } = await supabase.from("private_contacts").upsert(contact);
    if (contactError) throw contactError;
    if (complete) {
      sessionStorage.removeItem("bmc_signup_type"); sessionStorage.removeItem("bmc_signup_name");
      location.href = "my-profile.html";
    } else toast("Profile saved to your account.");
  }
  function profileClick(event) {
    if (event.target.closest(".upload")) {
      event.preventDefault(); event.stopImmediatePropagation(); chooseAvatar(event.target.closest(".upload")); return;
    }
    const button = event.target.closest(".save, #continue");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    saveProfile(button.id === "continue").catch((error) => toast(error.message || "Profile could not be saved."));
  }
  async function chooseAvatar(button) {
    let input = $("#bmc-avatar-file");
    if (!input) {
      input = document.createElement("input"); input.id = "bmc-avatar-file"; input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp"; input.hidden = true; document.body.append(input);
      input.addEventListener("change", async () => {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 5 * 1024 * 1024) return toast("Choose an image smaller than 5 MB.");
        try {
          const supabase = await client(); const user = await signedIn(supabase);
          const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: false, contentType: file.type });
          if (error) throw error;
          const { data } = supabase.storage.from("avatars").getPublicUrl(path);
          window.bmcAvatarUrl = data.publicUrl;
          let preview = $(".profile-pic .pic"); if (preview) preview.innerHTML = `<img src="${esc(data.publicUrl)}" alt="Profile photo preview" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
          toast("Photo uploaded. Save your profile to keep it.");
        } catch (error) { toast(error.message || "Photo upload failed."); }
      });
    }
    input.click();
  }
  async function loadProfileSetup() {
    const supabase = await client(); const user = await signedIn(supabase);
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) throw error;
    const accountType = profile?.account_type || sessionStorage.getItem("bmc_signup_type") || user.user_metadata?.account_type || "creator";
    sessionStorage.setItem("bmc_signup_type", accountType);
    if (user.user_metadata?.display_name && !sessionStorage.getItem("bmc_signup_name")) sessionStorage.setItem("bmc_signup_name", user.user_metadata.display_name);
    const typeButton = $(`[data-type="${accountType}"]`); if (typeButton) typeButton.click();
    if (!profile) return;
    const values = {
      "#display-name": profile.display_name, "#company": profile.company_name,
      "#agency-type": profile.agency_type, "#bio": profile.bio, "#company-bio": profile.bio,
      "#category": profile.category, "#location": profile.location, "#market": profile.location,
      "#website": profile.website_url, "#company-site": profile.website_url,
    };
    Object.entries(values).forEach(([selector, value]) => { const el = $(selector); if (el && value) el.value = value; });
    if (profile.avatar_url) {
      window.bmcExistingAvatarUrl = profile.avatar_url;
      const preview = $(".profile-pic .pic"); if (preview) preview.innerHTML = `<img src="${esc(profile.avatar_url)}" alt="Current profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    }
    document.querySelectorAll(".tag").forEach((tag) => {
      if ((profile.content_categories || []).includes(tag.textContent.trim())) tag.classList.add("selected");
    });
  }
  async function renderMyProfile() {
    const supabase = await client(); const params = new URLSearchParams(location.search);
    const current = await supabase.auth.getUser();
    const targetId = params.get("user") || current.data.user?.id;
    if (!targetId) { location.href = "index.html"; return; }
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", targetId).single();
    if (error) throw error;
    const root = $("#dynamic-profile"); if (!root) return;
    const isOwner = current.data.user?.id === targetId;
    root.innerHTML = `<section class="card"><div class="avatar">${profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="${esc(profile.display_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc((profile.display_name || "BMC").slice(0, 2).toUpperCase())}</div><div class="profile-body"><span class="role">${esc(profile.account_type)}</span><h1>${esc(profile.display_name || profile.company_name || "New member")}</h1><p>${esc(profile.category || "")}${profile.location ? ` · ${esc(profile.location)}` : ""}</p><p class="bio">${esc(profile.bio || "")}</p>${profile.website_url ? `<a href="${esc(profile.website_url)}" target="_blank" rel="noopener">${esc(profile.website_url)}</a>` : ""}<div class="tags">${(profile.content_categories || []).map((x) => `<span>${esc(x)}</span>`).join("")}</div>${isOwner ? '<a class="edit" href="profile-setup.html">Edit my profile</a>' : ""}</div></section>`;
    document.title = `${profile.display_name || "Profile"} — Stagerang`;
  }
  function projectPayload(user, accountType) {
    const kind = $("#kind").value;
    const budget = [...document.querySelectorAll(".delivery")].map((row) => ({
      deliverable: row.querySelector(".deliverable").value,
      amount_range: row.querySelector(".amount").value.trim(),
    })).filter((x) => x.amount_range);
    return {
      owner_id: user.id, owner_type: accountType,
      project_type: kind === "creator" ? "creator_idea" : "brand_campaign",
      project_name: $("#name").value.trim(), category: $("#category").value,
      location: $("#location").value.trim() || null,
      requirements: $("#requirements").value.trim(),
      application_deadline: $("#applicationDeadline").value || null,
      delivery_date: $("#deliveryDate").value || null,
      timeline_start: $("#timelineStart").value || null,
      timeline_end: $("#timelineEnd").value || null,
      creator_tiers: $("#tiers").value.split(",").map((x) => x.trim()).filter(Boolean),
      platforms: $("#platforms").value.split(",").map((x) => x.trim()).filter(Boolean),
      usage_permissions: $("#usage").value.trim() || null,
      reshare_permissions: $("#reshare").value.trim() || null,
      budget_by_deliverable: budget,
      status: $("#status").value,
      updated_at: new Date().toISOString(),
    };
  }
  async function projectSubmit(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const supabase = await client(); const user = await signedIn(supabase);
      const { data: profile, error: profileError } = await supabase.from("profiles").select("account_type").eq("id", user.id).single();
      if (profileError) throw new Error("Please finish saving your profile before posting a project.");
      const params = new URLSearchParams(location.search); const id = params.get("id");
      const data = projectPayload(user, profile.account_type);
      const result = id
        ? await supabase.from("projects").update(data).eq("id", id).eq("owner_id", user.id).select().single()
        : await supabase.from("projects").insert(data).select().single();
      if (result.error) throw result.error;
      location.href = "my-projects.html";
    } catch (error) { toast(error.message || "Project could not be saved."); }
    finally { button.disabled = false; }
  }
  async function loadProjectEdit() {
    const id = new URLSearchParams(location.search).get("id"); if (!id) return;
    const supabase = await client(); const user = await signedIn(supabase);
    const { data: p, error } = await supabase.from("projects").select("*").eq("id", id).eq("owner_id", user.id).single();
    if (error) throw error;
    const values = {
      "#name": p.project_name, "#category": p.category, "#location": p.location,
      "#requirements": p.requirements, "#applicationDeadline": p.application_deadline,
      "#deliveryDate": p.delivery_date, "#timelineStart": p.timeline_start,
      "#timelineEnd": p.timeline_end, "#tiers": (p.creator_tiers || []).join(", "),
      "#platforms": (p.platforms || []).join(", "), "#usage": p.usage_permissions,
      "#reshare": p.reshare_permissions, "#status": p.status,
    };
    Object.entries(values).forEach(([selector, value]) => { const el = $(selector); if (el && value) el.value = value; });
    $("#kind").value = p.project_type === "creator_idea" ? "creator" : "brand";
    document.querySelectorAll(".delivery").forEach((row, index) => {
      const item = (p.budget_by_deliverable || [])[index]; if (!item) return;
      row.querySelector(".deliverable").value = item.deliverable || "Other";
      row.querySelector(".amount").value = item.amount_range || "";
    });
    $("#title").textContent = "Edit project"; const save = $(".primary"); if (save) save.textContent = "Save changes ↗";
  }
  async function loadMyProjects() {
    const host = $("#list"); if (!host) return;
    const supabase = await client(); const user = await signedIn(supabase);
    const { data, error } = await supabase.from("projects").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    host.innerHTML = "";
    $("#empty").hidden = data.length > 0;
    data.forEach((p) => {
      const row = document.createElement("article"); row.className = "card project";
      row.innerHTML = `<div><h2>${esc(p.project_name)}</h2><div class="meta">${p.project_type === "creator_idea" ? "Creator collaboration idea" : "Brand campaign"} · ${esc(p.category)} · ${new Date(p.updated_at || p.created_at).toLocaleDateString()}</div><div class="chips"><span class="chip">Apply by ${esc(p.application_deadline || "Not set")}</span><span class="chip">Delivery ${esc(p.delivery_date || "Not set")}</span><span class="chip">${esc(p.status)}</span></div></div><div class="actions"><a class="secondary" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a><button class="secondary danger" data-delete="${esc(p.id)}">Delete</button></div>`;
      host.append(row);
    });
    host.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this project?")) return;
      const { error } = await supabase.from("projects").delete().eq("id", button.dataset.delete).eq("owner_id", user.id);
      if (error) return toast(error.message);
      loadMyProjects().catch((e) => toast(e.message));
    }));
  }
  async function openProjectsForFeed() {
    document.querySelectorAll(".center-col .post").forEach((node) => node.remove());
    const supabase = await client(); const user = await signedIn(supabase);
    const { data: profile, error: pError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (pError) throw pError;
    if (!profile) { location.href = "profile-setup.html"; return; }
    const name = profile.display_name || profile.company_name || "Member";
    window.bmcAccountType = profile.account_type;
    const person = $(".identity .person");
    if (person) {
      const h = person.querySelector("h3"); if (h) h.textContent = name;
      const bio = person.querySelector("p"); if (bio) bio.textContent = profile.account_type === "brand" ? "Brand account" : profile.account_type === "agency" ? "Agency account" : "Creator account";
      const loc = person.querySelector(".loc"); if (loc) loc.textContent = profile.location || "Open to collaborations";
      const portrait = person.querySelector(".portrait"); if (portrait) portrait.innerHTML = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc(name.slice(0, 1).toUpperCase());
    }
    const profileLink = $("#my-profile-link"); if (profileLink) profileLink.href = "my-profile.html";
    const profileMenu = $(".profile-menu"); if (profileMenu) {
      const switcher = profileMenu.querySelector("select"); if (switcher) switcher.remove();
      const label = profileMenu.querySelector(".person-label"); if (label) label.textContent = `${name} · ${profile.account_type}`;
    }
    const metricPanel = [...document.querySelectorAll(".left-col .panel")].find((panel) => panel.textContent.includes("Your social stats"));
    if (metricPanel) metricPanel.innerHTML = '<div class="side-title">Social accounts</div><div class="trend"><b>Connect profiles from your profile setup</b><span>Follower syncing will appear here after platform authorization is configured.</span></div>';
    const composer = $(".composer");
    if (composer) {
      const idea = $("#open-post-idea"); const primary = $("#open-post");
      if (profile.account_type === "brand" || profile.account_type === "agency") {
        if (primary) primary.textContent = "Share a campaign project with creators...";
        if (idea) idea.textContent = "Post a project";
      } else {
        if (primary) primary.textContent = "Share a collaboration idea with brands...";
        if (idea) idea.textContent = "Post an idea";
      }
      if (primary) primary.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = `project-form.html?kind=${profile.account_type === "creator" ? "creator" : "brand"}`; }, true);
      if (idea) idea.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = `project-form.html?kind=${profile.account_type === "creator" ? "creator" : "brand"}`; }, true);
      $("#add-work")?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = "profile-setup.html"; }, true);
    }
    const { data: projects, error } = await supabase.from("projects").select("*").eq("status", "Open").order("created_at", { ascending: false });
    if (error) throw error;
    const ownerIds = [...new Set(projects.map((p) => p.owner_id))];
    let owners = [];
    if (ownerIds.length) {
      const { data, error: ownersError } = await supabase.from("profiles").select("id,display_name,company_name,account_type,avatar_url").in("id", ownerIds);
      if (ownersError) throw ownersError; owners = data || [];
    }
    const byId = Object.fromEntries(owners.map((p) => [p.id, p]));
    let live = $("#bmc-live-posts");
    if (!live) { live = document.createElement("div"); live.id = "bmc-live-posts"; ($(".filters") || $(".center-col")).insertAdjacentElement("afterend", live); }
    if (!projects.length) { live.innerHTML = '<section class="panel empty">No live projects yet. When a brand or creator posts an open opportunity, it will appear here.</section>'; return; }
    live.innerHTML = projects.map((p) => {
      const owner = byId[p.owner_id] || {}; const display = owner.display_name || owner.company_name || "Stagerang member";
      const type = p.project_type === "creator_idea" ? "Creator collaboration idea" : "Brand campaign";
      const deliverables = (Array.isArray(p.budget_by_deliverable) ? p.budget_by_deliverable : []).map((x) => `<span class="deliverable">${esc(x.deliverable)}${x.amount_range ? `<b>${esc(x.amount_range)}</b>` : ""}</span>`).join("");
      const canApply = user.id !== p.owner_id;
      return `<article class="panel card post"><div class="post-head"><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}" style="display:contents"><div class="org-logo">${owner.avatar_url ? `<img src="${esc(owner.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc(display.slice(0,2).toUpperCase())}</div></a><div class="org-meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(display)}</a></b><span>${type} · ${esc(p.location || "Remote")} · ${new Date(p.created_at).toLocaleDateString()}</span></div><span class="type-label">${esc(p.status)}</span></div><h2 class="project-title">${esc(p.project_name)}</h2><p class="project-intro">${esc(p.requirements)}</p><div class="meta-grid"><span class="meta-chip">${esc(p.category)}</span><span class="meta-chip">Apply by <strong>${esc(p.application_deadline || "Open")}</strong></span><span class="meta-chip">Delivery <strong>${esc(p.delivery_date || "Not set")}</strong></span></div>${deliverables ? `<div class="deliverables"><div class="deliverables-title">Budget by deliverable</div><div class="deliverable-list">${deliverables}</div></div>` : ""}<div class="post-bottom"><span class="applications">${canApply ? "Open opportunity" : "Your project"}</span><div class="actions">${canApply ? `<button class="btn interested" data-apply="${esc(p.id)}">Interested ↗</button>` : `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit project</a>`}</div></div></article>`;
    }).join("");
    live.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      const { error: applyError } = await supabase.from("applications").upsert({ project_id: button.dataset.apply, applicant_id: user.id, status: "interested" }, { onConflict: "project_id,applicant_id" });
      if (applyError) { button.disabled = false; return toast(applyError.message); }
      button.textContent = "Interested ✓"; toast("Your interest was sent to the project owner.");
    }));
  }
  async function openProjectsDirectory() {
    $("#list")?.querySelectorAll(".item").forEach((el) => el.remove());
    const supabase = await client(); const user = await signedIn(supabase);
    const { data, error } = await supabase.from("projects").select("*").eq("status", "Open").order("created_at", { ascending: false });
    if (error) throw error;
    const host = $("#list"); if (!host) return;
    const empty = $("#empty");
    if (!data.length) { if (empty) { empty.textContent = "No open projects yet. Published opportunities will appear here."; empty.classList.remove("hidden"); } return; }
    if (empty) empty.classList.add("hidden");
    const owners = [...new Set(data.map((p) => p.owner_id))];
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", owners);
    if (profileError) throw profileError;
    const names = Object.fromEntries((profiles || []).map((x) => [x.id, x.display_name || x.company_name || "Member"]));
    data.forEach((p) => {
      const row = document.createElement("article"); row.className = "panel project item";
      row.dataset.kind = p.project_type === "creator_idea" ? "ideas" : "projects";
      row.dataset.category = p.category; row.dataset.tier = (p.creator_tiers || []).join(","); row.dataset.platform = (p.platforms || []).join(","); row.dataset.location = p.location || "";
      row.dataset.search = `${p.project_name} ${names[p.owner_id] || ""} ${p.requirements} ${p.category}`.toLowerCase();
      row.innerHTML = `<div class="project-top"><div class="logo">${esc((names[p.owner_id] || "BMC").slice(0,2).toUpperCase())}</div><div class="meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(names[p.owner_id] || "Member")}</a></b><span>${p.project_type === "creator_idea" ? "Creator collaboration idea" : "Brand project"} · ${esc(p.location || "Remote")}</span></div></div><h2>${esc(p.project_name)}</h2><p>${esc(p.requirements)}</p><div class="chips"><span class="chip">${esc(p.category)}</span><span class="chip">Apply by ${esc(p.application_deadline || "Open")}</span><span class="chip">Delivery by ${esc(p.delivery_date || "Not set")}</span></div><div class="bottom"><small>${p.owner_id === user.id ? "Your project" : "Open opportunity"}</small><div class="actions">${p.owner_id === user.id ? `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a>` : `<button class="btn" data-apply="${esc(p.id)}">Interested ↗</button>`}</div></div>`;
      host.insertBefore(row, empty || null);
    });
    host.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", async () => {
      const { error: applyError } = await supabase.from("applications").upsert({ project_id: button.dataset.apply, applicant_id: user.id, status: "interested" }, { onConflict: "project_id,applicant_id" });
      if (applyError) return toast(applyError.message); button.textContent = "Interested ✓";
    }));
  }
  function init() {
    const path = location.pathname;
    if (path.endsWith("/index.html") || path === "/") $("#auth-form")?.addEventListener("submit", authSubmit, true);
    if (path.endsWith("/profile-setup.html")) document.addEventListener("click", profileClick, true);
    if (path.endsWith("/profile-setup.html")) loadProfileSetup().catch((error) => toast(error.message));
    if (path.endsWith("/project-form.html")) {
      $("#form")?.addEventListener("submit", projectSubmit, true);
      if (!new URLSearchParams(location.search).has("id")) {
        const requestedKind = new URLSearchParams(location.search).get("kind");
        if (requestedKind && $("#kind")) $("#kind").value = requestedKind;
      }
      loadProjectEdit().catch((error) => toast(error.message));
    }
    if (path.endsWith("/my-projects.html")) loadMyProjects().catch((error) => toast(error.message || "Log in to see your projects."));
    if (path.endsWith("/my-profile.html")) renderMyProfile().catch((error) => toast(error.message || "Could not load this profile."));
    if (path.endsWith("/feed.html")) openProjectsForFeed().catch(() => { location.href = "index.html"; });
    if (path.endsWith("/projects.html")) openProjectsDirectory().catch(() => { location.href = "index.html"; });
    if (path.endsWith("/logout.html")) client().then((supabase) => supabase.auth.signOut()).finally(() => { location.href = "index.html"; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
