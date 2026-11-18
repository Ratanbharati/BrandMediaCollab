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
  async function refreshMessageBadge() {
    try {
      const supabase = await client(); const user = await signedIn(supabase);
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "new_message").is("read_at", null);
      if (error) throw error;
      const total = count || 0; window.bmcUnreadMessages = total;
      document.querySelectorAll('a[href$="messages.html"],a[href*="messages.html?"]').forEach((link) => {
        link.style.position = "relative";
        let badge = link.querySelector(".bmc-message-badge");
        if (!badge) { badge = document.createElement("span"); badge.className = "bmc-message-badge"; badge.setAttribute("aria-label", "Unread messages"); badge.style.cssText = "position:absolute;top:-3px;right:0;min-width:15px;height:15px;padding:0 4px;border-radius:9px;background:#d73535;color:#fff;font:700 9px/15px Arial;text-align:center"; link.append(badge); }
        badge.textContent = total > 9 ? "9+" : String(total); badge.hidden = total === 0;
      });
    } catch (_) { /* Badge is available after the activity migration is installed. */ }
  }
  window.bmcRefreshMessageBadge = refreshMessageBadge;
  async function getOrCreateProjectChat(supabase, projectId, otherId, user, firstMessage) {
    const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (membershipError) throw membershipError;
    const ids = (memberships || []).map((row) => row.conversation_id);
    if (ids.length) {
      const { data: chats, error } = await supabase.from("conversations").select("id,project_id").eq("project_id", projectId).in("id", ids);
      if (error) throw error;
      for (const chat of chats || []) {
        const { data: members, error: membersError } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", chat.id);
        if (membersError) throw membersError;
        if ((members || []).some((m) => m.user_id === user.id) && (members || []).some((m) => m.user_id === otherId)) {
          if (firstMessage) {
            const { error: messageError } = await supabase.from("messages").insert({ conversation_id: chat.id, sender_id: user.id, body: firstMessage });
            if (messageError) throw messageError;
          }
          return chat.id;
        }
      }
    }
    const { data: chat, error: chatError } = await supabase.from("conversations").insert({ project_id: projectId, created_by: user.id, is_group: false }).select("id").single();
    if (chatError) throw chatError;
    const { error: addMembersError } = await supabase.from("conversation_members").insert([{ conversation_id: chat.id, user_id: user.id }, { conversation_id: chat.id, user_id: otherId }]);
    if (addMembersError) throw addMembersError;
    const { error: messageError } = await supabase.from("messages").insert({ conversation_id: chat.id, sender_id: user.id, body: firstMessage || "Hi, I’m interested in this project. Let’s discuss it here." });
    if (messageError) throw messageError;
    return chat.id;
  }
  function interestDialog(projectName) {
    let dialog = document.querySelector("#bmc-interest-dialog");
    if (!dialog) {
      dialog = document.createElement("div"); dialog.id = "bmc-interest-dialog"; dialog.className = "modal-back open"; dialog.style.cssText = "display:flex;position:fixed;inset:0;z-index:9999;background:#14221caa;align-items:center;justify-content:center;padding:20px";
      dialog.innerHTML = '<section style="background:#fffefa;border-radius:16px;padding:24px;width:min(100%,520px);box-shadow:0 20px 70px #0003"><h2 style="margin:0 0 8px;font:700 20px Arial">Send your interest</h2><p class="bmc-interest-project" style="color:#647066"></p><label for="bmc-interest-note">Add a short note to start the conversation</label><textarea id="bmc-interest-note" maxlength="1000" rows="5" style="display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:1px solid #dfe4d9;border-radius:9px;font:14px Arial" placeholder="Tell them why this project is a good fit..."></textarea><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-cancel style="padding:10px 15px">Cancel</button><button type="button" data-send style="padding:10px 15px;background:#293d30;color:white;border:0;border-radius:20px">Send interest</button></div></section>';
      document.body.append(dialog);
    }
    dialog.querySelector(".bmc-interest-project").textContent = projectName;
    dialog.querySelector("#bmc-interest-note").value = "";
    return dialog;
  }
  async function submitInterest(projectId, projectName, button) {
    const dialog = interestDialog(projectName);
    const note = dialog.querySelector("#bmc-interest-note");
    const cancel = dialog.querySelector("[data-cancel]"); const send = dialog.querySelector("[data-send]");
    return new Promise((resolve) => {
      const close = () => { dialog.remove(); resolve(false); };
      cancel.onclick = close;
      send.onclick = async () => {
        send.disabled = true;
        try {
          const supabase = await client(); const user = await signedIn(supabase);
          const { data: project, error: projectError } = await supabase.from("projects").select("id,owner_id,project_name").eq("id", projectId).single();
          if (projectError) throw projectError;
          if (project.owner_id === user.id) throw new Error("You can’t express interest in your own project.");
          const { data: prior, error: priorError } = await supabase.from("applications").select("id,status").eq("project_id", projectId).eq("applicant_id", user.id).maybeSingle();
          if (priorError) throw priorError;
          const message = note.value.trim() || `Hi, I’m interested in “${project.project_name}”. Let’s discuss it here.`;
          const save = prior
            ? await supabase.from("applications").update({ status: prior.status === "withdrawn" ? "interested" : prior.status, message, updated_at: new Date().toISOString() }).eq("id", prior.id)
            : await supabase.from("applications").insert({ project_id: projectId, applicant_id: user.id, status: "interested", message });
          if (save.error) throw save.error;
          const conversationId = await getOrCreateProjectChat(supabase, projectId, project.owner_id, user, message);
          dialog.remove();
          if (button) { button.textContent = "Interest sent ✓"; button.disabled = true; }
          toast("Interest sent. Your private project chat is ready in Messages.");
          if (location.pathname.endsWith("/messages.html")) location.href = `messages.html?conversation=${encodeURIComponent(conversationId)}`;
          resolve(true);
        } catch (error) { send.disabled = false; toast(error.message || "Could not send interest."); }
      };
    });
  }
  window.bmcSubmitInterest = submitInterest;
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
    if (location.pathname.endsWith("/project-form.html") && !new URLSearchParams(location.search).has("id")) {
      const kind = $("#kind");
      if (kind) {
        kind.value = type === "creator" ? "creator" : "brand";
        const brandOption = kind.querySelector('option[value="brand"]');
        if (type === "creator") brandOption?.remove();
        else if (type === "agency" && brandOption) brandOption.textContent = "Agency campaign";
      }
    }
    if (type === "agency" && location.pathname.endsWith("/project-form.html")) {
      const kind = $("#kind"); if (kind?.querySelector('option[value="brand"]')) kind.querySelector('option[value="brand"]').textContent = "Agency campaign";
      if (!new URLSearchParams(location.search).has("id")) {
        const title = $("#title"); if (title) title.textContent = "Create an agency project";
        const intro = $(".head p"); if (intro) intro.textContent = "Share a campaign brief your agency is managing and invite creators to collaborate.";
      }
    }
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
    const editingProfile = new URLSearchParams(location.search).get("edit") === "1";
    const accountType = editingProfile
      ? sessionStorage.getItem("bmc_edit_account_type") || $("[data-type].selected")?.dataset.type || "creator"
      : sessionStorage.getItem("bmc_signup_type") || $("[data-type].selected")?.dataset.type || "creator";
    const isOrg = accountType === "brand" || accountType === "agency";
    const displayName = (isOrg ? $("#company")?.value : $("#display-name")?.value)?.trim() || sessionStorage.getItem("bmc_signup_name") || "";
    const contentCategories = [...document.querySelectorAll(".tag.selected")].map((x) => x.textContent.trim()).filter(Boolean);
    const availabilitySelect = !isOrg ? $("#availability") : null;
    const availabilityStatus = availabilitySelect?.value || null;
    const availabilityDate = availabilityStatus === "Available from a date" ? $("#availability-date")?.value || null : null;
    if (availabilityStatus === "Available from a date") {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (!availabilityDate || availabilityDate < today) throw new Error("Choose a future date for your availability.");
    }
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
    if (availabilitySelect) {
      payload.availability_status = availabilityStatus;
      payload.availability_date = availabilityDate;
    }
    const { error } = await supabase.from("profiles").upsert(payload);
    if (error) throw error;
    const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName, account_type: accountType } });
    if (metadataError) throw metadataError;
    const contact = { user_id: user.id, email: user.email || null, phone: $("#phone")?.value?.trim() || null };
    const { error: contactError } = await supabase.from("private_contacts").upsert(contact);
    if (contactError) throw contactError;
    if (complete) {
      sessionStorage.removeItem("bmc_signup_type"); sessionStorage.removeItem("bmc_signup_name"); sessionStorage.removeItem("bmc_edit_account_type");
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
    const editingProfile = new URLSearchParams(location.search).get("edit") === "1";
    if (editingProfile && !profile) { location.replace("profile-setup.html"); return; }
    const accountType = editingProfile ? profile.account_type : profile?.account_type || sessionStorage.getItem("bmc_signup_type") || user.user_metadata?.account_type || "creator";
    sessionStorage.setItem("bmc_signup_type", accountType);
    if (editingProfile) sessionStorage.setItem("bmc_edit_account_type", accountType);
    if (user.user_metadata?.display_name && !sessionStorage.getItem("bmc_signup_name")) sessionStorage.setItem("bmc_signup_name", user.user_metadata.display_name);
    const typeButton = $(`[data-type="${accountType === "creator" ? "influencer" : accountType}"]`); if (typeButton) typeButton.click();
    const availabilitySelect = $("#availability");
    if (availabilitySelect) {
      if (profile?.availability_status) availabilitySelect.value = profile.availability_status;
      let dateField = $("#availability-date-field");
      if (!dateField) {
        dateField = document.createElement("div"); dateField.id = "availability-date-field"; dateField.className = "field";
        dateField.innerHTML = '<label for="availability-date">Available from</label><input id="availability-date" type="date">';
        availabilitySelect.closest(".field")?.after(dateField);
      }
      const dateInput = $("#availability-date");
      if (dateInput) {
        const now = new Date();
        dateInput.value = profile?.availability_date || "";
        dateInput.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      }
      const syncAvailabilityDate = () => { if (dateField) dateField.hidden = availabilitySelect.value !== "Available from a date"; };
      availabilitySelect.addEventListener("change", syncAvailabilityDate);
      syncAvailabilityDate();
    }
    if (editingProfile) {
      const switcher = $(".account-switch");
      if (switcher) { const label = document.createElement("p"); label.className = "profile-edit-type"; label.textContent = `Editing your ${accountType === "creator" ? "Creator" : accountType[0].toUpperCase() + accountType.slice(1)} profile`; switcher.before(label); switcher.hidden = true; }
      document.querySelectorAll(".account-switch [data-type]").forEach((button) => { button.disabled = true; });
      const title = $("h1"); if (title) title.textContent = `Edit your ${accountType === "creator" ? "creator" : accountType} profile`;
      const step = $(".step-label"); if (step) step.textContent = "YOUR ACCOUNT · PROFILE EDIT";
      const save = $("#continue"); if (save) save.textContent = "Save profile changes";
      const draft = $(".save"); if (draft) draft.textContent = "Save changes";
    }
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
    if (editingProfile) document.documentElement.classList.remove("bmc-profile-loading");
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
    root.innerHTML = `<section class="card"><div class="avatar">${profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="${esc(profile.display_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc((profile.display_name || "BMC").slice(0, 2).toUpperCase())}</div><div class="profile-body"><span class="role">${esc(profile.account_type)}</span><h1>${esc(profile.display_name || profile.company_name || "New member")}</h1><p>${esc(profile.category || "")}${profile.location ? ` · ${esc(profile.location)}` : ""}</p><p class="bio">${esc(profile.bio || "")}</p>${profile.website_url ? `<a href="${esc(profile.website_url)}" target="_blank" rel="noopener">${esc(profile.website_url)}</a>` : ""}<div class="tags">${(profile.content_categories || []).map((x) => `<span>${esc(x)}</span>`).join("")}</div>${isOwner ? '<a class="edit" href="profile-setup.html?edit=1">Edit my profile</a>' : ""}</div></section>`;
    document.title = `${profile.display_name || "Profile"} — Stagerang`;
  }
  function projectPayload(user, accountType) {
    const budget = [...document.querySelectorAll(".delivery")].map((row) => ({
      deliverable: row.querySelector(".deliverable").value,
      amount_range: row.querySelector(".amount").value.trim(),
    })).filter((x) => x.amount_range);
    return {
      owner_id: user.id, owner_type: accountType,
      project_type: accountType === "creator" ? "creator_idea" : "brand_campaign",
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
    const { data: profile, error: profileError } = await supabase.from("profiles").select("account_type").eq("id", user.id).single();
    if (profileError) throw profileError;
    const values = {
      "#name": p.project_name, "#category": p.category, "#location": p.location,
      "#requirements": p.requirements, "#applicationDeadline": p.application_deadline,
      "#deliveryDate": p.delivery_date, "#timelineStart": p.timeline_start,
      "#timelineEnd": p.timeline_end, "#tiers": (p.creator_tiers || []).join(", "),
      "#platforms": (p.platforms || []).join(", "), "#usage": p.usage_permissions,
      "#reshare": p.reshare_permissions, "#status": p.status,
    };
    Object.entries(values).forEach(([selector, value]) => { const el = $(selector); if (el && value) el.value = value; });
    $("#kind").value = profile.account_type === "creator" ? "creator" : "brand";
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
    const { data: profile, error: profileError } = await supabase.from("profiles").select("account_type").eq("id", user.id).single();
    if (profileError) throw profileError;
    const { data, error } = await supabase.from("projects").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    host.innerHTML = "";
    $("#empty").hidden = data.length > 0;
    data.forEach((p) => {
      const row = document.createElement("article"); row.className = "card project";
      const projectLabel = profile.account_type === "agency" ? "Agency project" : profile.account_type === "creator" ? "Creator collaboration idea" : "Brand campaign";
      row.innerHTML = `<div><h2>${esc(p.project_name)}</h2><div class="meta">${projectLabel} · ${esc(p.category)} · ${new Date(p.updated_at || p.created_at).toLocaleDateString()}</div><div class="chips"><span class="chip">Apply by ${esc(p.application_deadline || "Not set")}</span><span class="chip">Delivery ${esc(p.delivery_date || "Not set")}</span><span class="chip">${esc(p.status)}</span></div></div><div class="actions"><a class="secondary" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a><button class="secondary danger" data-delete="${esc(p.id)}">Delete</button></div>`;
      host.append(row);
    });
    host.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this project?")) return;
      const { error } = await supabase.from("projects").delete().eq("id", button.dataset.delete).eq("owner_id", user.id);
      if (error) return toast(error.message);
      loadMyProjects().catch((e) => toast(e.message));
    }));
  }
  function subscribeFeedRealtime(supabase, user) {
    if (window.bmcFeedRealtimeChannel) return;
    let projectRefresh, activityRefresh;
    const refreshProjects = () => { clearTimeout(projectRefresh); projectRefresh = setTimeout(() => openProjectsForFeed().catch((error) => console.error("Live feed refresh failed:", error)), 250); };
    const refreshActivity = () => { clearTimeout(activityRefresh); activityRefresh = setTimeout(async () => { try { await refreshFeedActivity(supabase, user); await refreshMessageBadge(); } catch (error) { console.error("Live activity refresh failed:", error); } }, 250); };
    const announce = (title, body) => {
      toast(body || title || "You have new activity.");
      if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(title || "Stagerang", { body: body || "You have new activity." });
    };
    window.bmcFeedRealtimeConnected = false;
    window.bmcFeedRealtimeChannel = supabase.channel(`creator-dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refreshProjects)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refreshProjects)
      .on("postgres_changes", { event: "*", schema: "public", table: "saved_projects" }, refreshProjects)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, refreshActivity)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refreshActivity)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        refreshActivity();
        if (payload.eventType === "INSERT" && payload.new?.type !== "new_message") announce(payload.new?.title, payload.new?.body);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new?.sender_id !== user.id) announce("New project message", "A new message arrived in your collaboration inbox.");
        refreshActivity();
      })
      .subscribe((status) => { window.bmcFeedRealtimeConnected = status === "SUBSCRIBED"; });
  }
  async function openProjectsForFeed() {
    const selectedKind = window.bmcSelectedFeedKind || "brand";
    document.querySelectorAll(".center-col > .post").forEach((node) => node.remove());
    const supabase = await client(); const user = await signedIn(supabase);
    const { data: profile, error: pError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (pError) throw pError;
    if (!profile) { location.href = "profile-setup.html"; return; }
    if (!window.bmcFeedRealtimeChannel) subscribeFeedRealtime(supabase, user);
    const name = profile.display_name || profile.company_name || "Member";
    window.bmcAccountType = profile.account_type;
    const accountLabel = profile.account_type === "brand" ? "Brand" : profile.account_type === "agency" ? "Agency" : "Creator";
    const navAccount = $(".collabry-account > span");
    if (navAccount) navAccount.textContent = `${name} · ${accountLabel}`;
    const person = $(".identity .person");
    if (person) {
      const h = person.querySelector("h3"); if (h) h.textContent = name;
      // The HTML template still contains a link to the old sample creator profile.
      // Route the signed-in member's identity card to their live Supabase profile.
      const identityLink = person.querySelector("a"); if (identityLink) identityLink.href = "my-profile.html";
      const bio = person.querySelector("p"); if (bio) bio.textContent = profile.account_type === "brand" ? "Brand account" : profile.account_type === "agency" ? "Agency account" : "Creator account";
      const loc = person.querySelector(".loc"); if (loc) loc.textContent = profile.location || "Open to collaborations";
      const portrait = person.querySelector(".portrait"); if (portrait) portrait.innerHTML = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc(name.slice(0, 1).toUpperCase());
    }
    const profileType = profile.account_type || "creator";
    const roleStat = $(".identity .stats .stat:nth-child(3)");
    if (roleStat) {
      const label = roleStat.querySelector("span"), value = roleStat.querySelector("b");
      if (label) label.textContent = profileType === "creator" ? "Creator tier" : "Account type";
      if (value) value.textContent = profileType === "creator" ? profile.follower_tier || "Not set" : accountLabel;
    }
    const completionFields = profileType === "creator"
      ? [profile.display_name, profile.bio, profile.category, profile.location, profile.avatar_url, profile.website_url, profile.follower_tier, (profile.content_categories || []).length > 0]
      : [profile.display_name || profile.company_name, profile.bio, profile.category, profile.location, profile.avatar_url, profile.website_url, profileType === "agency" ? profile.agency_type : true];
    const completion = Math.round(completionFields.filter(Boolean).length / completionFields.length * 100);
    const completionValue = $(".profile-complete .complete-row b"), completionBar = $(".profile-complete .progress div"), profileStrength = $(".identity .stats .stat:nth-child(2) b");
    if (completionValue) completionValue.textContent = `${completion}%`;
    if (completionBar) completionBar.style.width = `${completion}%`;
    if (profileStrength) profileStrength.textContent = completion >= 75 ? "Good" : completion >= 45 ? "Building" : "Getting started";
    const profileLink = $("#my-profile-link"); if (profileLink) profileLink.href = "my-profile.html";
    const profileMenu = $(".profile-menu"); if (profileMenu) {
      const switcher = profileMenu.querySelector("select"); if (switcher) switcher.remove();
      const label = profileMenu.querySelector(".person-label"); if (label) label.textContent = `${name} · ${profile.account_type}`;
    }
    const metricPanel = [...document.querySelectorAll(".left-col .panel")].find((panel) => panel.textContent.includes("Your social stats"));
    if (metricPanel) {
      const { data: socialRows, error: socialError } = await supabase.from("social_accounts").select("id,platform,profile_url,follower_count,engagement_rate,last_synced_at").eq("user_id", user.id).order("platform");
      metricPanel.innerHTML = `<div class="side-title">Social accounts</div>${socialError ? '<div class="trend"><b>Social account metrics unavailable</b><span>Reconnect your profile to refresh these stats.</span></div>' : socialRows?.length ? socialRows.map((account) => `<div class="trend"><b>${account.profile_url ? `<a href="${esc(account.profile_url)}" target="_blank" rel="noopener noreferrer">${esc(account.platform)}</a>` : esc(account.platform)}${account.follower_count != null ? ` · ${Number(account.follower_count).toLocaleString()} followers` : ""}</b><span>${account.engagement_rate != null ? `${Number(account.engagement_rate).toLocaleString()}% engagement · ` : ""}${account.last_synced_at ? `Updated ${new Date(account.last_synced_at).toLocaleDateString()}` : "Connected"}</span></div>`).join("") : '<div class="trend"><b>No social accounts connected</b><span>Connect a profile to show verified audience metrics.</span></div>'}`;
    }
    $(".right-col .profile-prompt")?.remove();
    $(".right-col .upcoming")?.remove();
    const side = $(".right-col");
    if (side && !$("#bmc-feed-activity")) {
      const activity = document.createElement("section"); activity.id = "bmc-feed-activity"; activity.className = "panel";
      activity.innerHTML = '<h3>Your activity</h3><div id="bmc-feed-stats">Loading your activity…</div><div class="activity-link"><a href="dashboard.html">Open dashboard →</a></div>';
      side.prepend(activity);
    }
    if (side && !$("#bmc-feed-notification-center")) {
      const notifications = document.createElement("section"); notifications.id = "bmc-feed-notification-center"; notifications.className = "panel";
      notifications.innerHTML = '<h3>Notifications <span class="notification-count" data-notification-count hidden></span></h3><div id="bmc-notification-toolbar"><div id="bmc-notification-filters" role="group" aria-label="Filter notifications"><button type="button" data-notification-filter="all" aria-pressed="true">All</button><button type="button" data-notification-filter="unread" aria-pressed="false">Unread</button><button type="button" data-notification-filter="read" aria-pressed="false">Read</button></div><button type="button" id="bmc-mark-notifications-read">Mark all read</button></div><div id="bmc-feed-notifications">Loading notifications…</div>';
      side.insertBefore(notifications, side.querySelector(".tip"));
      notifications.querySelectorAll("[data-notification-filter]").forEach((button) => button.addEventListener("click", () => {
        window.bmcNotificationFilter = button.dataset.notificationFilter;
        notifications.querySelectorAll("[data-notification-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        window.bmcRenderFeedNotifications?.();
      }));
      notifications.querySelector("#bmc-mark-notifications-read").addEventListener("click", async () => {
        try { const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null); if (error) throw error; await refreshFeedActivity(supabase, user); toast("All notifications marked as read."); }
        catch (error) { toast(error.message || "Could not update notifications."); }
      });
    }
    const feedTip = $(".right-col .tip p");
    if (feedTip) feedTip.textContent = "When you send interest, add a note and a private one-to-one project chat opens for both people. You can manage the application status from your dashboard.";
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
      if (primary && !primary.dataset.feedBound) { primary.dataset.feedBound = "true"; primary.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = `project-form.html?kind=${profile.account_type === "creator" ? "creator" : "brand"}`; }, true); }
      if (idea && !idea.dataset.feedBound) { idea.dataset.feedBound = "true"; idea.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = `project-form.html?kind=${profile.account_type === "creator" ? "creator" : "brand"}`; }, true); }
      const addWork = $("#add-work");
      if (addWork) {
        addWork.innerHTML = '<span>▣</span><span>View my profile</span>';
        if (!addWork.dataset.feedBound) { addWork.dataset.feedBound = "true"; addWork.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = "my-profile.html"; }, true); }
      }
      const availability = $("#set-availability");
      if (availability) {
        availability.hidden = false;
        availability.innerHTML = profileType === "creator" ? '<span>◷</span>Set availability' : '<span>▣</span>Edit profile';
        availability.setAttribute("aria-label", profileType === "creator" ? "Set your availability" : "Edit your profile");
        if (!availability.dataset.feedBound) { availability.dataset.feedBound = "true"; availability.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); location.href = profileType === "creator" ? "profile-setup.html?edit=1#availability" : "profile-setup.html?edit=1"; }, true); }
      }
    }
    const { data: projects, error } = await supabase.from("projects").select("*").eq("status", "Open").order("created_at", { ascending: false });
    if (error) throw error;
    const ownerIds = [...new Set(projects.map((p) => p.owner_id))];
    let owners = [];
    if (ownerIds.length) {
      const { data, error: ownersError } = await supabase.from("profiles").select("id,display_name,company_name,account_type,avatar_url").in("id", ownerIds);
      if (ownersError) throw ownersError; owners = data || [];
    }
    const { data: savedRows, error: savedError } = await supabase.from("saved_projects").select("project_id").eq("user_id", user.id);
    if (savedError) throw savedError;
    const savedIds = new Set((savedRows || []).map((row) => row.project_id));
    const byId = Object.fromEntries(owners.map((p) => [p.id, p]));
    const kindOf = (p) => {
      const projectType = String(p.project_type || "").trim().toLowerCase();
      const ownerType = p.owner_type || byId[p.owner_id]?.account_type;
      if (projectType === "creator_idea") return "creator";
      if (projectType === "brand_campaign") return ownerType === "agency" ? "agency" : "brand";
      if (["brand", "creator", "agency"].includes(ownerType)) return ownerType;
      return "brand";
    };
    const feedKinds = projects.map(kindOf);
    let live = $("#bmc-live-posts");
    const center = $(".center-col");
    if (!live) {
      live = document.createElement("div"); live.id = "bmc-live-posts";
      const composer = center?.querySelector(".composer");
      if (composer) composer.insertAdjacentElement("afterend", live); else center?.append(live);
    }
    if (!$("#bmc-feed-tabs")) {
      const tabs = document.createElement("div"); tabs.id = "bmc-feed-tabs"; tabs.className = "bmc-feed-tabs";
      tabs.innerHTML = `<button type="button" data-feed-kind="brand" class="${selectedKind === "brand" ? "active" : ""}">Brand projects <span data-feed-count="brand">0</span></button><button type="button" data-feed-kind="creator" class="${selectedKind === "creator" ? "active" : ""}">Creator ideas <span data-feed-count="creator">0</span></button><button type="button" data-feed-kind="agency" class="${selectedKind === "agency" ? "active" : ""}">Agency projects <span data-feed-count="agency">0</span></button>`;
      live.before(tabs);
      tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-feed-kind]"); if (!button) return;
        tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
        window.bmcSelectedFeedKind = button.dataset.feedKind; live.dataset.kind = button.dataset.feedKind; applyFeedVisibility();
      });
    }
    if (!projects.length) { live.innerHTML = ""; ["brand", "creator", "agency"].forEach((kind) => { const badge = $(`[data-feed-count="${kind}"]`); if (badge) badge.textContent = "0"; }); live.dataset.kind = selectedKind; applyFeedVisibility(); document.body.classList.add("bmc-data-ready"); await refreshFeedActivity(supabase, user); if (!window.bmcFeedRealtimeChannel) subscribeFeedRealtime(supabase, user); if (!window.bmcFeedFallbackTimer) window.bmcFeedFallbackTimer = window.setInterval(() => { if (!window.bmcFeedRealtimeConnected) openProjectsForFeed().catch((error) => console.error("Feed refresh failed:", error)); }, 30000); return; }
    ["brand", "creator", "agency"].forEach((kind) => { const badge = $(`[data-feed-count="${kind}"]`); if (badge) badge.textContent = String(feedKinds.filter((value) => value === kind).length); });
    live.innerHTML = projects.map((p) => {
      const owner = byId[p.owner_id] || {}; const display = owner.display_name || owner.company_name || "Stagerang member";
      const kind = kindOf(p);
      const type = kind === "agency" ? "Agency project" : kind === "creator" ? "Creator idea" : "Brand project";
      const deliverables = (Array.isArray(p.budget_by_deliverable) ? p.budget_by_deliverable : []).map((x) => `<span class="deliverable">${esc(x.deliverable)}${x.amount_range ? `<b>${esc(x.amount_range)}</b>` : ""}</span>`).join("");
      const canApply = user.id !== p.owner_id;
      return `<article class="panel card post" data-kind="${kind}" data-project-id="${esc(p.id)}" data-search="${esc(`${display} ${p.project_name} ${p.requirements} ${p.category} ${(p.platforms || []).join(" ")} ${(p.creator_tiers || []).join(" ")}`.toLowerCase())}"><div class="post-head"><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}" style="display:contents"><div class="org-logo">${owner.avatar_url ? `<img src="${esc(owner.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : esc(display.slice(0,2).toUpperCase())}</div></a><div class="org-meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(display)}</a></b><span>${type} · ${esc(p.location || "Remote")} · ${new Date(p.created_at).toLocaleDateString()}</span></div><span class="type-label">${esc(p.status)}</span></div><button type="button" class="project-title project-details-trigger" aria-label="View details for ${esc(p.project_name)}">${esc(p.project_name)}</button><p class="project-intro">${esc(p.requirements)}</p><div class="meta-grid"><span class="meta-chip">${esc(p.category)}</span><span class="meta-chip">Apply by <strong>${esc(p.application_deadline || "Open")}</strong></span><span class="meta-chip">Delivery <strong>${esc(p.delivery_date || "Not set")}</strong></span></div>${deliverables ? `<div class="deliverables"><div class="deliverables-title">Budget by deliverable</div><div class="deliverable-list">${deliverables}</div></div>` : ""}<div class="post-bottom"><span class="applications">${canApply ? "Open opportunity" : "Your project"}</span><div class="actions"><button class="btn view-project-details" type="button">View details</button>${canApply ? `<button class="btn save-project ${savedIds.has(p.id) ? "active" : ""}" data-save-project="${esc(p.id)}" aria-pressed="${savedIds.has(p.id)}">${savedIds.has(p.id) ? "♥ Saved" : "♡ Save"}</button><button class="btn interested" data-apply="${esc(p.id)}">Interested ↗</button>` : `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit project</a>`}</div></div></article>`;
    }).join("");
    live.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", async () => {
      const card = button.closest(".post");
      submitInterest(button.dataset.apply, card?.querySelector(".project-title")?.textContent || "Project", button).catch((error) => toast(error.message));
    }));
    live.querySelectorAll("[data-save-project]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.saveProject; button.disabled = true;
      try {
        if (savedIds.has(id)) { const { error: removeError } = await supabase.from("saved_projects").delete().eq("user_id", user.id).eq("project_id", id); if (removeError) throw removeError; savedIds.delete(id); }
        else { const { error: saveError } = await supabase.from("saved_projects").insert({ user_id: user.id, project_id: id }); if (saveError) throw saveError; savedIds.add(id); }
        button.textContent = savedIds.has(id) ? "♥ Saved" : "♡ Save"; button.setAttribute("aria-pressed", String(savedIds.has(id))); button.classList.toggle("active", savedIds.has(id));
        toast(savedIds.has(id) ? "Opportunity saved." : "Opportunity removed from saved items.");
      } catch (error) { toast(error.message || "Could not update saved opportunities."); }
      finally { button.disabled = false; }
    }));
    live.querySelectorAll(".project-details-trigger").forEach((button) => button.addEventListener("click", () => button.closest(".post")?.querySelector(".view-project-details")?.click()));
    live.querySelectorAll(".view-project-details").forEach((button) => button.addEventListener("click", () => {
      const card = button.closest(".post"), dialog = document.createElement("dialog"); dialog.className = "dashboard-project-dialog";
      dialog.setAttribute("aria-label", `Project details: ${card.querySelector(".project-title")?.textContent || "Opportunity"}`);
      const sheet = document.createElement("div"); sheet.className = "dashboard-project-sheet";
      const close = document.createElement("button"); close.className = "dashboard-project-close"; close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Close project details");
      const detail = card.cloneNode(true); detail.classList.remove("card"); detail.querySelector(".post-bottom")?.remove(); sheet.append(close, detail);
      const actions = document.createElement("div"); actions.className = "dashboard-project-actions";
      const save = card.querySelector("[data-save-project]"); const apply = card.querySelector("[data-apply]"); const edit = card.querySelector('a[href^="project-form.html"]');
      if (save) { const saveCopy = save.cloneNode(true); saveCopy.addEventListener("click", () => { save.click(); dialog.close(); }); actions.append(saveCopy); }
      if (apply) { const applyCopy = apply.cloneNode(true); applyCopy.addEventListener("click", () => { dialog.close(); apply.click(); }); actions.append(applyCopy); }
      if (edit) { const editCopy = edit.cloneNode(true); editCopy.textContent = "Edit project"; actions.append(editCopy); }
      sheet.append(actions); dialog.append(sheet); document.body.append(dialog); dialog.showModal(); close.addEventListener("click", () => dialog.close()); dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }); dialog.addEventListener("close", () => dialog.remove());
    }));
    live.dataset.kind = $("#bmc-feed-tabs .active")?.dataset.feedKind || selectedKind;
    applyFeedVisibility();
    await refreshFeedActivity(supabase, user);
    if (!window.bmcFeedRealtimeChannel) subscribeFeedRealtime(supabase, user);
    if (!window.bmcFeedFallbackTimer) window.bmcFeedFallbackTimer = window.setInterval(() => { if (!window.bmcFeedRealtimeConnected) openProjectsForFeed().catch((error) => console.error("Feed refresh failed:", error)); }, 30000);
    document.body.classList.add("bmc-data-ready");
    window.bmcRefreshMessageBadge?.();
  }
  function applyFeedVisibility() {
    const host = $("#bmc-live-posts"); if (!host) return;
    const kind = host.dataset.kind || "brand";
    const search = (window.bmcFeedSearch || "").trim().toLowerCase();
    host.querySelectorAll(".post[data-kind]").forEach((card) => {
      const visible = card.dataset.kind === kind && (!search || card.dataset.search.includes(search));
      card.hidden = !visible; card.style.display = visible ? "" : "none";
    });
    let empty = $("#bmc-feed-kind-empty");
    if (!empty) { empty = document.createElement("div"); empty.id = "bmc-feed-kind-empty"; empty.className = "panel empty"; host.append(empty); }
    const visible = [...host.querySelectorAll(".post[data-kind]")].some((card) => !card.hidden);
    empty.hidden = visible;
    empty.textContent = search ? "No projects or ideas match this search." : kind === "brand" ? "No brand projects have been posted yet." : kind === "agency" ? "No agency projects have been posted yet." : "No creator ideas have been posted yet.";
  }
  async function refreshFeedActivity(supabase, user) {
    const stats = $("#bmc-feed-stats"), notifications = $("#bmc-feed-notifications");
    const { count: postCount, error: postError } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    if (postError) throw postError;
    const { count: sentCount, error: sentError } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("applicant_id", user.id).neq("status", "withdrawn");
    if (sentError) throw sentError;
    const own = await supabase.from("projects").select("id").eq("owner_id", user.id);
    if (own.error) throw own.error;
    const ids = (own.data || []).map((row) => row.id); let receivedCount = 0;
    if (ids.length) { const received = await supabase.from("applications").select("id", { count: "exact", head: true }).in("project_id", ids).neq("status", "withdrawn"); if (received.error) throw received.error; receivedCount = received.count || 0; }
    await refreshMessageBadge();
    if (stats) stats.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px"><span><b>${postCount || 0}</b><br>Projects/ideas posted</span><span><b>${sentCount || 0}</b><br>Interests sent</span><span><b>${receivedCount}</b><br>Interests received</span><span><b>${window.bmcUnreadMessages || 0}</b><br>Unread messages</span></div>`;
    const { data, error } = await supabase.from("notifications").select("id,title,body,type,project_id,application_id,conversation_id,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25);
    if (error) { if (notifications) notifications.textContent = "Notifications could not be loaded. Please try again."; return; }
    const unreadResult = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
    const unread = unreadResult.error ? (data || []).filter((item) => !item.read_at).length : unreadResult.count || 0;
    const countNode = document.querySelector("[data-notification-count]");
    if (countNode) { countNode.textContent = unread > 99 ? "99+" : String(unread); countNode.hidden = unread === 0; countNode.setAttribute("aria-label", `${unread} unread notifications`); }
    if (notifications) {
      const icons = { new_message: "✉", application_received: "↗", application_status: "✓" };
      window.bmcRenderFeedNotifications = () => {
        const filter = window.bmcNotificationFilter || "all";
        const visible = (data || []).filter((item) => filter === "all" || (filter === "unread" ? !item.read_at : Boolean(item.read_at)));
        notifications.innerHTML = visible.length ? visible.map((item) => {
          const href = item.conversation_id
            ? `messages.html?conversation=${encodeURIComponent(item.conversation_id)}`
            : item.type === "application_received" && item.project_id
              ? `dashboard.html?project=${encodeURIComponent(item.project_id)}${item.application_id ? `&application=${encodeURIComponent(item.application_id)}` : ""}`
              : item.type === "application_status" && item.application_id
                ? `applications.html?application=${encodeURIComponent(item.application_id)}`
                : item.project_id ? `projects.html?project=${encodeURIComponent(item.project_id)}` : "dashboard.html";
          return `<a class="bmc-notification" href="${href}" data-notification-id="${esc(item.id)}" data-read="${Boolean(item.read_at)}" data-unread="${!item.read_at}" data-icon="${icons[item.type] || "•"}"><b>${esc(item.title)}</b><span>${esc(item.body)}</span><time datetime="${esc(item.created_at)}">${new Date(item.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></a>`;
        }).join("") : `<div class="bmc-empty">${filter === "unread" ? "You’re all caught up." : filter === "read" ? "No read notifications yet." : "No new activity yet."}</div>`;
        notifications.querySelectorAll("[data-notification-id]").forEach((link) => link.addEventListener("click", async (event) => {
          event.preventDefault();
          if (link.dataset.read !== "true") { const { error: updateError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", link.dataset.notificationId).eq("user_id", user.id); if (updateError) return toast(updateError.message); }
          await refreshMessageBadge(); location.href = link.href;
        }));
      };
      window.bmcRenderFeedNotifications();
    }
    window.bmcRefreshMessageBadge?.();
  }
  async function openProjectsDirectory() {
    if (window.bmcProjectsDirectoryHandled) return;
    if (window.bmcLoadProjectsDirectory) return window.bmcLoadProjectsDirectory();
    $("#list")?.querySelectorAll(".item").forEach((el) => el.remove());
    const supabase = await client(); const user = await signedIn(supabase);
    const { data, error } = await supabase.from("projects").select("*").eq("status", "Open").order("created_at", { ascending: false });
    if (error) throw error;
    const host = $("#list"); if (!host) return;
    const empty = $("#empty");
    if (!data.length) { if (empty) { empty.textContent = "No open projects yet. Published opportunities will appear here."; empty.classList.remove("hidden"); } document.body.classList.add("bmc-projects-ready"); return; }
    if (empty) empty.classList.add("hidden");
    const owners = [...new Set(data.map((p) => p.owner_id))];
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", owners);
    if (profileError) throw profileError;
    const names = Object.fromEntries((profiles || []).map((x) => [x.id, x.display_name || x.company_name || "Member"]));
    data.forEach((p) => {
      const row = document.createElement("article"); row.className = "panel project item";
      const owner = (profiles || []).find((item) => item.id === p.owner_id);
      const projectType = String(p.project_type || "").trim().toLowerCase();
      const ownerType = p.owner_type || owner?.account_type;
      const kind = projectType === "creator_idea" ? "creator" : projectType === "brand_campaign" ? (ownerType === "agency" ? "agency" : "brand") : ownerType;
      row.dataset.kind = kind === "agency" ? "agency" : kind === "creator" ? "ideas" : "projects";
      row.dataset.category = p.category; row.dataset.tier = (p.creator_tiers || []).join(","); row.dataset.platform = (p.platforms || []).join(","); row.dataset.location = p.location || "";
      row.dataset.search = `${p.project_name} ${names[p.owner_id] || ""} ${p.requirements} ${p.category} ${(p.platforms || []).join(" ")} ${(p.creator_tiers || []).join(" ")} ${p.location || ""}`.toLowerCase();
      const kindLabel = row.dataset.kind === "agency" ? "Agency project" : row.dataset.kind === "ideas" ? "Creator idea" : "Brand project";
      row.innerHTML = `<div class="project-top"><div class="logo">${esc((names[p.owner_id] || "BMC").slice(0,2).toUpperCase())}</div><div class="meta"><b><a href="my-profile.html?user=${encodeURIComponent(p.owner_id)}">${esc(names[p.owner_id] || "Member")}</a></b><span>${kindLabel} · ${esc(p.location || "Remote")}</span></div></div><h2>${esc(p.project_name)}</h2><p>${esc(p.requirements)}</p><div class="chips"><span class="chip">${esc(p.category)}</span><span class="chip">Apply by ${esc(p.application_deadline || "Open")}</span><span class="chip">Delivery by ${esc(p.delivery_date || "Not set")}</span></div><div class="bottom"><small>${p.owner_id === user.id ? "Your project" : "Open opportunity"}</small><div class="actions">${p.owner_id === user.id ? `<a class="btn" href="project-form.html?id=${encodeURIComponent(p.id)}">Edit</a>` : `<button class="btn" data-apply="${esc(p.id)}" data-project-name="${esc(p.project_name)}">Interested ↗</button>`}</div></div>`;
      host.insertBefore(row, empty || null);
    });
    host.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", async () => {
      submitInterest(button.dataset.apply, button.dataset.projectName || button.closest(".item")?.querySelector("h2")?.textContent || "Project", button).catch((error) => toast(error.message));
    }));
    document.querySelectorAll("#q,#search").forEach((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
    document.body.classList.add("bmc-projects-ready");
  }
  function init() {
    const path = location.pathname;
    refreshMessageBadge(); window.setInterval(refreshMessageBadge, 20000);
    $("#search")?.addEventListener("input", (event) => { window.bmcFeedSearch = event.target.value; applyFeedVisibility(); });
    if (!path.endsWith("/index.html") && path !== "/" && !path.endsWith("/logout.html")) loadAccountHeader().catch(() => {});
    if (path.endsWith("/index.html") || path === "/") $("#auth-form")?.addEventListener("submit", authSubmit, true);
    if (path.endsWith("/profile-setup.html")) document.addEventListener("click", profileClick, true);
    if (path.endsWith("/profile-setup.html")) loadProfileSetup().catch((error) => { document.documentElement.classList.remove("bmc-profile-loading"); toast(error.message); });
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


