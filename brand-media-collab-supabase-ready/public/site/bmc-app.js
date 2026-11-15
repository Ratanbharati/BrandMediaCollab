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
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { account_type: accountType, display_name: displayName }, emailRedirectTo: `${location.origin}/site/profile-setup.html` },
        });
        if (error) throw error;
        if (!data.session) {
          toast("Account created. Check your email to confirm it, then log in to finish your profile.");
          return;
        }
        sessionStorage.setItem("bmc_signup_type", accountType);
        sessionStorage.setItem("bmc_signup_name", displayName);
        location.href = "profile-setup.html";
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = "dashboard.html";
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
    const contact = { user_id: user.id, email: user.email || null, phone: $("#phone")?.value?.trim() || null };
    const { error: contactError } = await supabase.from("private_contacts").upsert(contact);
    if (contactError) throw contactError;
    if (complete) {
      sessionStorage.removeItem("bmc_signup_type"); sessionStorage.removeItem("bmc_signup_name");
      location.href = "dashboard.html";
    } else toast("Profile saved to your account.");
  }
  function profileClick(event) {
    const button = event.target.closest(".save, #continue");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    saveProfile(button.id === "continue").catch((error) => toast(error.message || "Profile could not be saved."));
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
  function init() {
    const path = location.pathname;
    if (path.endsWith("/index.html") || path === "/") $("#auth-form")?.addEventListener("submit", authSubmit, true);
    if (path.endsWith("/profile-setup.html")) document.addEventListener("click", profileClick, true);
    if (path.endsWith("/project-form.html")) $("#form")?.addEventListener("submit", projectSubmit, true);
    if (path.endsWith("/my-projects.html")) loadMyProjects().catch((error) => toast(error.message || "Log in to see your projects."));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
