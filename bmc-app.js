// Supabase wiring for the prototype pages: authentication, profile save, and project CRUD.
// Uses the publishable key only; authorization is enforced by Supabase RLS.
(function () {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function projectKind(project, owner) {
    const type = String(project?.project_type || "").toLowerCase();
    if (type.includes("creator") || type.includes("idea")) return "creator";
    if (type.includes("brand") || type.includes("campaign")) return "brand";
    const ownerType = String(project?.owner_type || owner?.account_type || "").toLowerCase();
    return ownerType === "creator" || ownerType === "influencer" ? "creator" : "brand";
  }
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
  async function refreshMessageBadge() {
    try {
      const supabase = await client(); const user = await signedIn(supabase);
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "new_message").is("read_at", null);
      if (error) throw error;
      window.bmcUnreadMessages = count || 0;
      document.querySelectorAll('a[href$="messages.html"],a[href*="messages.html?"]').forEach((link) => {
        link.style.position = "relative"; let badge = link.querySelector(".bmc-message-badge");
        if (!badge) { badge = document.createElement("span"); badge.className = "bmc-message-badge"; badge.style.cssText = "position:absolute;top:-3px;right:0;min-width:15px;height:15px;padding:0 4px;border-radius:9px;background:#d73535;color:#fff;font:700 9px/15px Arial;text-align:center"; link.append(badge); }
        badge.textContent = count > 9 ? "9+" : String(count || 0); badge.hidden = !count;
      });
    } catch (_) {}
  }
  window.bmcRefreshMessageBadge = refreshMessageBadge;
  async function startProjectChat(supabase, projectId, ownerId, user, firstMessage) {
    const { data: memberships, error: me } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id); if (me) throw me;
    const ids = (memberships || []).map((x) => x.conversation_id);
    if (ids.length) {
      const { data: chats, error } = await supabase.from("conversations").select("id,project_id").eq("project_id", projectId).in("id", ids); if (error) throw error;
      for (const chat of chats || []) {
        const { data: members, error: memberError } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", chat.id); if (memberError) throw memberError;
        if ((members || []).some((x) => x.user_id === user.id) && (members || []).some((x) => x.user_id === ownerId)) {
          if (firstMessage) { const sent = await supabase.from("messages").insert({ conversation_id: chat.id, sender_id: user.id, body: firstMessage }); if (sent.error) throw sent.error; }
          return chat.id;
        }
      }
    }
    const { data: chat, error } = await supabase.from("conversations").insert({ project_id: projectId, created_by: user.id, is_group: false }).select("id").single(); if (error) throw error;
    const { error: membersError } = await supabase.from("conversation_members").insert([{ conversation_id: chat.id, user_id: user.id }, { conversation_id: chat.id, user_id: ownerId }]); if (membersError) throw membersError;
    const { error: messageError } = await supabase.from("messages").insert({ conversation_id: chat.id, sender_id: user.id, body: firstMessage || "Hi, I’m interested in this project. Let’s discuss it here." }); if (messageError) throw messageError;
    return chat.id;
  }
  async function sendProjectInterest(id, title, button) {
    const note = prompt(`Add a short note to ${title || "the project owner"}:`); if (note === null) return;
    try {
      const supabase = await client(); const user = await signedIn(supabase);
      const { data: project, error: pError } = await supabase.from("projects").select("id,owner_id,project_name").eq("id", id).single(); if (pError) throw pError;
      if (project.owner_id === user.id) throw new Error("You can’t express interest in your own project.");
      const message = note.trim() || `Hi, I’m interested in “${project.project_name}”. Let’s discuss it here.`;
      const { error } = await supabase.from("applications").upsert({ project_id: id, applicant_id: user.id, status: "interested", message, updated_at: new Date().toISOString() }, { onConflict: "project_id,applicant_id" }); if (error) throw error;
      const { count } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("applicant_id", user.id);
      const applicationLabel = document.querySelector('.side-link[data-status="applied"] .count'); if (applicationLabel && count !== null) applicationLabel.textContent = String(count || 0);
      const projectCard = button?.closest("[data-project-id]"); if (projectCard) projectCard.dataset.applied = "true";
      const conversationId = await startProjectChat(supabase, id, project.owner_id, user, message);
      if (button) { button.textContent = "Interest sent ✓"; button.disabled = true; }
      toast("Interest saved. Your private project conversation is in Messages.");
      if (location.pathname.endsWith("/messages.html")) location.href = `messages.html?conversation=${encodeURIComponent(conversationId)}`;
    } catch (error) { toast(error.message || "Could not send your interest."); }
  }
  async function signedIn(supabase) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Please log in first, then try again.");
    return user;
  }
  async function loadAccountHeader() {
    const headerName = $(".collabry-account > span");
    if (!headerName) return;
    const supabase = await client();
    const user = await signedIn(supabase);
    const { data: profile, error } = await supabase.from("profiles").select("display_name,company_name,account_type").eq("id", user.id).maybeSingle();
    if (error) throw error;
    const name = profile?.display_name || profile?.company_name || user.user_metadata?.display_name || user.email?.split("@")[0] || "Member";
    const type = profile?.account_type || user.user_metadata?.account_type || "creator";
    const label = type === "brand" ? "Brand" : type === "agency" ? "Agency" : "Creator";
    headerName.textContent = `${name} · ${label}`;
    document.body.classList.add("bmc-account-ready");
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
    const selected = window.bmcFeedKind || "brand";
    document.querySelectorAll(".center-col .post,#bmc-live-posts,#bmc-feed-tabs").forEach((el) => el.remove());
    const supabase = await client(), user = await signedIn(supabase);
    const { data: profile, error: pError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(); if (pError) throw pError;
    if (!profile) { location.href = "profile-setup.html"; return; }
    const name = profile.display_name || profile.company_name || "Member", type = profile.account_type || "creator"; window.bmcAccountType = type;
    const nav = $(".collabry-account > span"); if (nav) nav.textContent = `${name} · ${type === "brand" ? "Brand" : type === "agency" ? "Agency" : "Creator"}`;
    document.body.classList.add("bmc-account-ready");
    const person = $(".identity .person"); if (person) { person.querySelector("h3") && (person.querySelector("h3").textContent = name); person.querySelector("p") && (person.querySelector("p").textContent = `${type[0].toUpperCase()}${type.slice(1)} account`); person.querySelector(".loc") && (person.querySelector(".loc").textContent = profile.location || "Open to collaborations"); }
    const composer = $(".composer"), primary = $("#open-post"), idea = $("#open-post-idea");
    if (primary) primary.textContent = type === "creator" ? "Share a collaboration idea with brands..." : "Share a campaign project with creators...";
    if (idea) idea.textContent = type === "creator" ? "Post an idea" : "Post a project";
    for (const button of [primary, idea]) if (button && !button.dataset.liveBound) { button.dataset.liveBound = "1"; button.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); location.href = `project-form.html?kind=${type === "creator" ? "creator" : "brand"}`; }, true); }
    const { data: projects, error } = await supabase.from("projects").select("*").eq("status", "Open").order("created_at", { ascending: false }); if (error) throw error;
    const ownerIds = [...new Set((projects || []).map((p) => p.owner_id))];
    const { data: owners, error: ownerError } = ownerIds.length ? await supabase.from("profiles").select("id,display_name,company_name,account_type,avatar_url").in("id", ownerIds) : { data: [], error: null }; if (ownerError) throw ownerError;
    const byId = Object.fromEntries((owners || []).map((p) => [p.id, p]));
    const center = $(".center-col"); let tabs = document.createElement("div"); tabs.id = "bmc-feed-tabs"; tabs.innerHTML = `<button data-kind="brand" class="${selected === "brand" ? "active" : ""}">Brand projects</button><button data-kind="creator" class="${selected === "creator" ? "active" : ""}">Creator ideas</button>`;
    let live = document.createElement("div"); live.id = "bmc-live-posts"; const composerNode = center?.querySelector(".composer"); if (composerNode) { composerNode.insertAdjacentElement("afterend", tabs); tabs.insertAdjacentElement("afterend", live); } else center?.append(tabs, live);
    tabs.onclick = (e) => { const btn = e.target.closest("[data-kind]"); if (!btn) return; window.bmcFeedKind = btn.dataset.kind; tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === btn)); updateFeedVisibility(); };
    live.innerHTML = (projects || []).map((p) => {
      const owner = byId[p.owner_id] || {}, display = owner.display_name || owner.company_name || "Stagerang member", kind = projectKind(p, owner), typeName = kind === "creator" ? "Creator idea" : "Brand project";
      const budget = (Array.isArray(p.budget_by_deliverable) ? p.budget_by_deliverable : []).map((x) => `<span class="deliverable">${esc(x.deliverable)} ${esc(x.amount_range || "")}</span>`).join("");
      return `<article class="panel card post" data-kind="${kind}" data-project-id="${esc(p.id)}" data-search="${esc(`${display} ${p.project_name} ${p.requirements} ${p.category}`.toLowerCase())}"><div class="post-head"><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}"><div class="org-logo">${owner.avatar_url ? `<img src="${esc(owner.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc(display.slice(0,2).toUpperCase())}</div></a><div class="org-meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(display)}</a></b><span>${typeName} · ${esc(p.location || "Remote")} · ${new Date(p.created_at).toLocaleDateString()}</span></div></div><h2 class="project-title">${esc(p.project_name)}</h2><p class="project-intro">${esc(p.requirements)}</p><div class="meta-grid"><span class="meta-chip">${esc(p.category)}</span><span class="meta-chip">Apply by ${esc(p.application_deadline || "Open")}</span><span class="meta-chip">Delivery ${esc(p.delivery_date || "Not set")}</span></div>${budget ? `<div class="deliverables"><div class="deliverable-list">${budget}</div></div>` : ""}<div class="post-bottom"><span>${user.id === p.owner_id ? "Your post" : "Open opportunity"}</span><div class="actions">${user.id === p.owner_id ? `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a>` : `<button class="btn interested" data-apply="${esc(p.id)}">Interested ↗</button>`}</div></div></article>`;
    }).join("");
    live.querySelectorAll("[data-apply]").forEach((btn) => btn.addEventListener("click", () => sendProjectInterest(btn.dataset.apply, btn.closest("article")?.querySelector("h2")?.textContent, btn)));
    if (!projects?.length) live.innerHTML = '<div class="panel empty">No brand projects or creator ideas have been posted yet.</div>';
    updateFeedVisibility();
    const side = $(".right-col"); side?.querySelector(".profile-prompt")?.remove(); side?.querySelector(".upcoming")?.remove();
    if (side && !$("#bmc-feed-activity")) { const panel = document.createElement("section"); panel.id = "bmc-feed-activity"; panel.className = "panel"; panel.innerHTML = '<h3 style="padding:14px 15px 8px;margin:0">Your platform activity</h3><div id="bmc-feed-stats" style="padding:0 15px 12px">Loading…</div><a href="dashboard.html" style="display:block;padding:0 15px 12px;color:#54763f">Open dashboard →</a><h3 style="padding:12px 15px 8px;margin:0;border-top:1px solid #efeee8">Notifications</h3><div id="bmc-feed-notifications" style="padding:0 15px 12px">Loading…</div>'; side.prepend(panel); }
    await refreshFeedActivity(supabase, user); document.body.classList.add("bmc-data-ready");
    if (!window.bmcFeedPoll) window.bmcFeedPoll = setInterval(() => openProjectsForFeed().catch((e) => console.error(e)), 30000);
    if (!window.bmcActivityPoll) window.bmcActivityPoll = setInterval(() => refreshFeedActivity(supabase, user).catch(() => {}), 20000);
  }
  function updateFeedVisibility() {
    const kind = window.bmcFeedKind || "brand", q = (window.bmcFeedSearch || "").toLowerCase(), host = $("#bmc-live-posts"); if (!host) return;
    const cards = [...host.querySelectorAll(".post[data-kind]")]; cards.forEach((card) => { card.hidden = card.dataset.kind !== kind || Boolean(q && !card.dataset.search.includes(q)); });
    let empty = $("#bmc-feed-kind-empty"); if (!empty) { empty = document.createElement("div"); empty.id = "bmc-feed-kind-empty"; empty.className = "panel empty"; host.append(empty); }
    empty.hidden = cards.some((card) => !card.hidden); empty.textContent = q ? "No projects or ideas match this search." : kind === "brand" ? "No brand projects have been posted yet." : "No creator ideas have been posted yet.";
  }
  async function refreshFeedActivity(supabase, user) {
    const own = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id); if (own.error) throw own.error;
    const sent = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("applicant_id", user.id); if (sent.error) throw sent.error;
    const projects = await supabase.from("projects").select("id").eq("owner_id", user.id); if (projects.error) throw projects.error;
    let received = 0; if (projects.data?.length) { const a = await supabase.from("applications").select("id", { count: "exact", head: true }).in("project_id", projects.data.map((p) => p.id)); if (a.error) throw a.error; received = a.count || 0; }
    if ($("#bmc-feed-stats")) $("#bmc-feed-stats").innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><span><b>${own.count || 0}</b><br>Posts</span><span><b>${sent.count || 0}</b><br>Interests sent</span><span><b>${received}</b><br>Interests received</span><span><b>${window.bmcUnreadMessages || 0}</b><br>Unread messages</span></div>`;
    const result = await supabase.from("notifications").select("id,title,body,conversation_id,project_id,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6);
    const host = $("#bmc-feed-notifications"); if (!host) return;
    if (result.error) { host.textContent = "Run the activity notification SQL update to enable alerts."; return; }
    host.innerHTML = result.data?.length ? result.data.map((n) => `<a href="${n.conversation_id ? `messages.html?conversation=${encodeURIComponent(n.conversation_id)}` : "dashboard.html"}" style="display:block;padding:8px 0;border-top:1px solid #eee;text-decoration:none;color:inherit"><b>${esc(n.title)}</b><br><small>${esc(n.body)}</small></a>`).join("") : "No new activity yet.";
    window.bmcRefreshMessageBadge?.();
  }
  async function openProjectsDirectory() {
    const supabase = await client(); const user = await signedIn(supabase);
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const host = $("#list"); if (!host) return;
    host.querySelectorAll(".item").forEach((el) => el.remove());
    const account = await signedIn(supabase);
    const ownApps = await supabase.from("applications").select("project_id").eq("applicant_id", account.id);
    const savedRows = await supabase.from("saved_projects").select("project_id").eq("user_id", account.id);
    const appliedSet = new Set((ownApps.data || []).map((x) => x.project_id)); const savedSet = new Set((savedRows.data || []).map((x) => x.project_id));
    if (ownApps.error) throw ownApps.error; if (savedRows.error) throw savedRows.error;
    const appliedLabel = document.querySelector('.side-link[data-status="applied"] .count'); if (appliedLabel) appliedLabel.textContent = String(appliedSet.size);
    const savedLabel = document.querySelector('.side-link[data-status="saved"] .count'); if (savedLabel) savedLabel.textContent = String(savedSet.size);
    const ownedLabel = document.querySelector('.side-link[data-status="owned"] .count');
    const ownedCount = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", account.id);
    if (ownedCount.error) throw ownedCount.error;
    if (ownedLabel) ownedLabel.textContent = String(ownedCount.count || 0);
    const openRows = data.filter((p) => String(p.status || "").toLowerCase() === "open");
    const brandTotal = openRows.filter((p) => projectKind(p) === "brand").length;
    const ideaTotal = openRows.filter((p) => projectKind(p) === "creator").length;
    const brandTab = document.querySelector('.segmented button[data-kind="projects"]'); if (brandTab) brandTab.textContent = `Brand projects (${brandTotal})`;
    const ideaTab = document.querySelector('.segmented button[data-kind="ideas"]'); if (ideaTab) ideaTab.textContent = `Creator ideas (${ideaTotal})`;
    const ideaLabel = document.querySelector('.side-link[data-status="collab"] .count'); if (ideaLabel) ideaLabel.textContent = String(ideaTotal);
    const empty = $("#empty");
    if (!data.length) { if (empty) { empty.textContent = "No open projects yet. Published opportunities will appear here."; empty.classList.remove("hidden"); } document.body.classList.add("bmc-projects-ready"); if (!window.bmcProjectsPoll) window.bmcProjectsPoll = setInterval(() => openProjectsDirectory().catch((e) => console.error("Projects refresh failed:", e)), 30000); return; }
    if (empty) empty.classList.add("hidden");
    const owners = [...new Set(data.map((p) => p.owner_id))];
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", owners);
    if (profileError) throw profileError;
    const names = Object.fromEntries((profiles || []).map((x) => [x.id, x.display_name || x.company_name || "Member"]));
    data.forEach((p) => {
      const row = document.createElement("article"); row.className = "panel project item";
      row.dataset.projectId = p.id;
      const postKind = projectKind(p) === "creator" ? "ideas" : "projects";
      row.dataset.kind = postKind;
      row.dataset.status = p.status; row.dataset.applied = String(appliedSet.has(p.id)); row.dataset.saved = String(savedSet.has(p.id));
      row.dataset.category = p.category || ""; row.dataset.tier = (p.creator_tiers || []).join(","); row.dataset.platform = (p.platforms || []).join(","); row.dataset.location = p.location || "";
      row.dataset.search = `${p.project_name} ${names[p.owner_id] || ""} ${p.requirements} ${p.category} ${(p.platforms || []).join(" ")} ${(p.creator_tiers || []).join(" ")} ${p.location || ""}`.toLowerCase();
      row.innerHTML = `<div class="project-top"><div class="logo">${esc((names[p.owner_id] || "BMC").slice(0,2).toUpperCase())}</div><div class="meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(names[p.owner_id] || "Member")}</a></b><span>${postKind === "ideas" ? "Creator collaboration idea" : "Brand project"} · ${esc(p.location || "Remote")}</span></div></div><h2>${esc(p.project_name)}</h2><p>${esc(p.requirements)}</p><div class="chips"><span class="chip">${esc(p.category)}</span><span class="chip">Apply by ${esc(p.application_deadline || "Open")}</span><span class="chip">Delivery by ${esc(p.delivery_date || "Not set")}</span></div><div class="bottom"><small>${p.owner_id === user.id ? "Your project" : "Open opportunity"}</small><div class="actions">${p.owner_id === user.id ? `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a>` : `<button class="btn" data-save="${esc(p.id)}">${savedSet.has(p.id) ? "♥ Saved" : "♡ Save"}</button><button class="btn" data-apply="${esc(p.id)}">Interested ↗</button>`}</div></div>`;
      host.insertBefore(row, empty || null);
    });
    host.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", async () => {
      sendProjectInterest(button.dataset.apply, button.closest(".item")?.querySelector("h2")?.textContent, button);
    }));
    host.querySelectorAll("[data-save]").forEach((button) => button.addEventListener("click", async () => {
      const projectId = button.dataset.save;
      const result = savedSet.has(projectId) ? await supabase.from("saved_projects").delete().eq("user_id", user.id).eq("project_id", projectId) : await supabase.from("saved_projects").insert({ user_id: user.id, project_id: projectId });
      if (result.error) return toast(result.error.message);
      if (savedSet.has(projectId)) savedSet.delete(projectId); else savedSet.add(projectId);
      button.textContent = savedSet.has(projectId) ? "♥ Saved" : "♡ Save";
      const card = host.querySelector(`[data-project-id="${CSS.escape(projectId)}"]`); if (card) card.dataset.saved = String(savedSet.has(projectId));
      const savedLabel = document.querySelector('.side-link[data-status="saved"] .count'); if (savedLabel) savedLabel.textContent = String(savedSet.size);
      document.querySelector("#q")?.dispatchEvent(new Event("input", { bubbles: true }));
    }));
    document.querySelector("#q")?.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#cat")?.dispatchEvent(new Event("change", { bubbles: true }));
    window.bmcSetProjectScope = (scope) => { window.bmcProjectScope = scope === "collab" ? "discover" : scope; if (scope === "collab") document.querySelector('.segmented button[data-kind="ideas"]')?.click(); else if (scope === "discover") document.querySelector('.segmented button[data-kind="projects"]')?.click(); else document.querySelector("#q")?.dispatchEvent(new Event("input", { bubbles: true })); };
    document.body.classList.add("bmc-projects-ready");
    if (!window.bmcProjectsPoll) window.bmcProjectsPoll = setInterval(() => openProjectsDirectory().catch((e) => console.error("Projects refresh failed:", e)), 30000);
  }
  function init() {
    const path = location.pathname;
    refreshMessageBadge(); window.setInterval(refreshMessageBadge, 20000);
    $("#search")?.addEventListener("input", (event) => { window.bmcFeedSearch = event.target.value; updateFeedVisibility(); });
    if (!path.endsWith("/index.html") && path !== "/" && !path.endsWith("/logout.html")) loadAccountHeader().catch(() => {});
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
    if (path.endsWith("/projects.html")) openProjectsDirectory().catch((error) => { console.error("Projects could not load:", error); $("#list")?.querySelectorAll(".item").forEach((el) => el.remove()); document.body.classList.add("bmc-projects-ready"); const empty = $("#empty"); if (empty) { empty.textContent = error.message || "Projects could not load. Please refresh and try again."; empty.classList.remove("hidden"); } });
    if (path.endsWith("/logout.html")) client().then((supabase) => supabase.auth.signOut()).finally(() => { location.href = "index.html"; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
