// Database-backed profile discovery and real connection actions.
(async function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2600); } };
  const PAGE_SIZE = 24;
  let supabase, user, profiles = [], total = 0, loading = false, activeType = "all", searchTimer;
  const grid = $("#profile-grid"), countNode = $("#result-count"), loadMore = $("#load-more");

  function filterValues() {
    const value = (id) => $(id)?.value.trim() || "";
    return {
      p_search: value("#profile-search") || null,
      p_type: activeType === "all" ? null : activeType,
      p_industry: $("[data-filter-field='industry']")?.hidden ? null : value("#filter-industry") || null,
      p_niche: $("[data-filter-field='niche']")?.hidden ? null : value("#filter-niche") || null,
      p_location: value("#filter-location") || null,
      p_language: $("[data-filter-field='language']")?.hidden ? null : value("#filter-language") || null,
      p_platform: $("[data-filter-field='platform']")?.hidden ? null : value("#filter-platform") || null,
      p_service: $("[data-filter-field='service']")?.hidden ? null : value("#filter-service") || null,
      p_limit: PAGE_SIZE,
    };
  }

  function setRoleFilter(type) {
    activeType = type;
    $$(".role-tabs [data-type]").forEach((button) => {
      const active = button.dataset.type === type;
      button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
    });
    const typeFields = {
      creator: ["niche", "location", "language", "platform"],
      brand: ["industry", "location", "platform"],
      agency: ["industry", "location", "service", "platform"],
      all: ["industry", "niche", "location", "language", "platform", "service"],
    }[type] || [];
    $$("[data-filter-field]").forEach((field) => { field.hidden = !typeFields.includes(field.dataset.filterField); });
    const heading = $("#results-title");
    if (heading) heading.textContent = type === "all" ? "People to discover" : `${type === "agency" ? "Agencies" : `${type[0].toUpperCase()}${type.slice(1)}s`} to discover`;
    if (window.matchMedia("(min-width:721px)").matches) $("#filter-panel").open = true;
  }

  function loadingState() {
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = '<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>';
    countNode.textContent = "Loading profiles…";
    loadMore.hidden = true;
  }

  function profileName(profile) {
    return profile.account_type === "creator"
      ? (profile.display_name || profile.company_name || "Stagerang creator")
      : (profile.company_name || profile.display_name || "Stagerang member");
  }

  function profileHref(profile) { return `my-profile.html?user=${encodeURIComponent(profile.profile_id)}`; }

  function cardHtml(profile) {
    const name = profileName(profile);
    const role = profile.account_type || "member";
    const subtitle = role === "creator" ? (profile.content_categories || []).slice(0, 2).join(" · ") || profile.category || "Creator" : role === "agency" ? (profile.agency_type || profile.category || "Agency") : (profile.category || "Brand");
    const tags = [...new Set([
      ...(profile.content_categories || []), ...(profile.collaboration_categories || []),
      ...(role === "agency" ? [...(profile.services || []), ...(profile.specialisations || [])] : []),
      ...(role === "creator" ? (profile.languages || []) : []),
    ])].filter(Boolean).slice(0, 4);
    const social = (profile.social_accounts || []).filter((item) => item.platform).map((item) => item.platform).filter((item, index, all) => all.indexOf(item) === index).slice(0, 3);
    const avatar = /^https?:\/\//i.test(profile.avatar_url || "")
      ? `<img src="${esc(profile.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : esc(name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
    const joinedDate = profile.created_at ? new Date(profile.created_at) : null;
    const recent = joinedDate && (Date.now() - joinedDate.getTime()) < 30 * 86400000;
    return `<article class="profile-card" data-profile-id="${esc(profile.profile_id)}" data-type="${esc(role)}">
      <a class="profile-main" href="${profileHref(profile)}" aria-label="View ${esc(name)}’s profile">
        <div class="profile-cover"><div class="profile-avatar">${avatar}</div><span class="type-pill">${esc(role)}</span></div>
        <div class="profile-content">
          <div class="profile-title-row"><h3>${esc(name)}</h3>${recent ? '<span class="joined">Recently joined</span>' : ""}</div>
          <p class="profile-kind">${esc(subtitle)}</p>
          <p class="profile-description">${esc(profile.bio || "This member is still completing their public profile.")}</p>
          <div class="profile-place">${profile.location ? `<span>⌖ ${esc(profile.location)}</span>` : ""}${profile.follower_tier && role === "creator" ? `<span>${esc(profile.follower_tier)} creator</span>` : ""}</div>
          <div class="tags">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
          ${social.length ? `<p class="social-platforms">On ${social.map(esc).join(" · ")}</p>` : ""}
        </div>
      </a>
      <div class="profile-actions" data-actions-for="${esc(profile.profile_id)}"></div>
    </article>`;
  }

  function renderCards() {
    if (!profiles.length) {
      if (total > 0) grid.innerHTML = '<div class="empty-state"><b>No profiles to show</b><p>There are no discoverable profiles matching these filters.</p></div>';
      return;
    }
    const visibleProfiles = profiles.filter((profile) => !["blocked-by-me", "unavailable"].includes(window.bmcConnections.stateFor(profile.profile_id).kind));
    if (!visibleProfiles.length) {
      grid.innerHTML = '<div class="empty-state"><b>No profiles to show</b><p>There are no discoverable profiles matching these filters.</p></div>';
      return;
    }
    grid.innerHTML = visibleProfiles.map((profile) => cardHtml(profile)).join("");
    visibleProfiles.forEach((profile) => {
      const state = window.bmcConnections.stateFor(profile.profile_id);
      const host = $(`[data-actions-for="${CSS.escape(profile.profile_id)}"]`, grid);
      if (!host) return;
      const control = (action, label, cls = "connect-action") => `<button type="button" class="${cls}" data-action="${action}">${label}</button>`;
      let controls;
      if (state.kind === "connected") controls = '<a class="message-action" href="messages.html?profile=' + encodeURIComponent(profile.profile_id) + '">Message</a>';
      else if (state.kind === "incoming") controls = control("accept", "Accept") + control("decline", "Decline", "connect-action secondary");
      else if (state.kind === "outgoing") controls = control("cancel", "Request sent · Cancel", "connect-action secondary");
      else if (state.kind === "unavailable") controls = '<button class="connect-action secondary" type="button" disabled>Unavailable</button>';
      else controls = control("connect", state.kind === "declined" ? "Connect again" : "Connect");
      controls += `<details class="block-menu"><summary aria-label="More profile actions">···</summary><button type="button" data-action="block">Block profile</button></details>`;
      host.innerHTML = controls;
      host.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation(); button.disabled = true;
        try {
          if (button.dataset.action === "connect") await window.bmcConnections.request(profile.profile_id);
          else if (button.dataset.action === "accept") await window.bmcConnections.respond(profile.profile_id, "accepted");
          else if (button.dataset.action === "decline") await window.bmcConnections.respond(profile.profile_id, "declined");
          else if (button.dataset.action === "cancel") await window.bmcConnections.cancel(profile.profile_id);
          else if (button.dataset.action === "block") await window.bmcConnections.block(profile.profile_id);
          toast(button.dataset.action === "accept" ? "You’re connected. You can now message each other." : button.dataset.action === "block" ? "Profile blocked. Manage blocked profiles below." : "Connection status updated.");
          renderCards();
        } catch (error) { button.disabled = false; toast(error.message || "Could not update this connection."); }
      }));
    });
  }

  async function loadProfiles({ reset = false } = {}) {
    if (loading) return;
    if (reset) { profiles = []; total = 0; loadingState(); }
    loading = true;
    const offset = reset ? 0 : profiles.length;
    if (!reset) { const button = $("#load-more button"); if (button) { button.disabled = true; button.textContent = "Loading…"; } }
    try {
      const { data, error } = await supabase.rpc("discover_profiles", { ...filterValues(), p_offset: offset });
      if (error) throw error;
      const rows = data || [];
      if (reset) profiles = rows; else profiles = profiles.concat(rows);
      total = Number(rows[0]?.total_count || (reset ? 0 : total));
      grid.setAttribute("aria-busy", "false");
      countNode.textContent = total === 1 ? "1 profile" : `${total} profiles`;
      if (!profiles.length) {
        const activeFilters = Object.values(filterValues()).some((value) => typeof value === "string" && value);
        grid.innerHTML = `<div class="empty-state"><b>${activeFilters ? "No matching profiles" : "No profiles to show yet"}</b><p>${activeFilters ? "Try another search or clear some filters." : "As more members choose to be discoverable, you’ll find them here."}</p>${activeFilters ? '<a href="#" id="empty-clear">Clear search and filters</a>' : ""}</div>`;
        $("#empty-clear")?.addEventListener("click", (event) => { event.preventDefault(); clearFilters(); });
      } else renderCards();
      loadMore.hidden = rows.length < PAGE_SIZE || profiles.length >= total;
      const button = $("#load-more button"); if (button) { button.disabled = false; button.textContent = "Show more profiles"; }
    } catch (error) {
      console.error("Explore profiles could not load:", error);
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML = `<div class="empty-state"><b>Profiles could not load</b><p>${esc(error.message || "Check your connection and try again.")}</p><button class="load-retry" type="button">Try again</button></div>`;
      $(".load-retry")?.addEventListener("click", () => loadProfiles({ reset: true }));
      countNode.textContent = "Please try again"; loadMore.hidden = true;
    } finally { loading = false; }
  }

  function clearFilters() {
    $("#profile-search").value = "";
    ["#filter-industry", "#filter-niche", "#filter-location", "#filter-language", "#filter-platform", "#filter-service"].forEach((id) => { if ($(id)) $(id).value = ""; });
    setRoleFilter("all");
    loadProfiles({ reset: true });
  }

  async function renderBlockedProfiles() {
    const host = $("#blocked-list"); if (!host) return;
    try {
      const items = await window.bmcConnections.listBlockedProfiles();
      host.innerHTML = items.length ? items.map((item) => `<div class="blocked-item"><span>${esc(item.profile.display_name || item.profile.company_name || "Stagerang member")} · ${esc(item.profile.account_type || "member")}</span><button type="button" data-unblock="${esc(item.blocked_id)}">Unblock</button></div>`).join("") : '<span>No profiles blocked.</span>';
      host.querySelectorAll("[data-unblock]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try { await window.bmcConnections.unblock(button.dataset.unblock); await renderBlockedProfiles(); renderCards(); toast("Profile unblocked."); }
        catch (error) { button.disabled = false; toast(error.message || "Could not unblock profile."); }
      }));
    } catch (error) { host.textContent = error.message || "Blocked profiles could not load."; }
  }

  try {
    const { supabase: client, user: currentUser } = await window.bmcConnections.ready();
    supabase = client; user = currentUser;
    if (window.matchMedia("(min-width:721px)").matches) $("#filter-panel").open = true;
    setRoleFilter("all");
    $(".role-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-type]"); if (!button) return;
      setRoleFilter(button.dataset.type); loadProfiles({ reset: true });
    });
    $("#profile-search").addEventListener("input", () => {
      clearTimeout(searchTimer); searchTimer = setTimeout(() => loadProfiles({ reset: true }), 280);
    });
    $$(".filter-field input").forEach((input) => input.addEventListener("input", () => {
      clearTimeout(searchTimer); searchTimer = setTimeout(() => loadProfiles({ reset: true }), 180);
    }));
    $("#clear-filters").addEventListener("click", clearFilters);
    $("#load-more button").addEventListener("click", () => loadProfiles());
    $("#blocked-area").addEventListener("toggle", () => { if ($("#blocked-area").open) renderBlockedProfiles(); });
    window.bmcConnections.subscribe(() => { renderCards(); if ($("#blocked-area").open) renderBlockedProfiles(); });
    await Promise.all([loadProfiles({ reset: true }), renderBlockedProfiles()]);
  } catch (error) {
    console.error("Explore could not start:", error);
    grid.setAttribute("aria-busy", "false"); grid.innerHTML = `<div class="empty-state"><b>Sign in to explore Stagerang</b><p>${esc(error.message || "Your profile discovery session could not be started.")}</p><a href="index.html">Go to sign in</a></div>`; countNode.textContent = "";
  }
})();

