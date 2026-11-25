// Small local outline icon set keeps static pages consistent without a CDN dependency.
(() => {
  window.BMCCategories = window.BMCCategories || Object.freeze([
    { id: "brand", singular: "Brand", plural: "Brands", projectLabel: "Brand projects", description: "Companies building partnerships and campaigns." },
    { id: "creator", singular: "Creator", plural: "Creators", projectLabel: "Creator ideas", description: "Creators sharing concepts and seeking partners." },
    { id: "agency", singular: "Agency", plural: "Agencies", projectLabel: "Agency projects", description: "Teams offering strategy and campaign services." },
    { id: "celebrity", singular: "Celebrity", plural: "Celebrities", projectLabel: "Celebrity projects", description: "Public figures and represented talent." },
    { id: "event", singular: "Event", plural: "Events", projectLabel: "Event projects", description: "Event teams, organisers and live experiences." },
    { id: "media", singular: "Media", plural: "Media", projectLabel: "Media projects", description: "Publishers, broadcasters and production teams." },
    { id: "community", singular: "Community", plural: "Communities", projectLabel: "Community projects", description: "Interest groups and professional communities." },
    { id: "distributor", singular: "Distributor", plural: "Distributors", projectLabel: "Distributor projects", description: "Distribution, retail and fulfilment partners." },
    { id: "freelancer", singular: "Freelancer", plural: "Freelancers", projectLabel: "Freelance projects", description: "Independent creative and marketing professionals." },
  ]);
  "use strict";

  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    projects: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 10h18M3 15h18"/>',
    explore: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
    dashboard: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>',
    messages: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    notifications: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1 1.1 1.9-1.8 3.1-2.2-.4a8 8 0 0 1-1.4.8l-.8 2h-3.6l-.8-2a8 8 0 0 1-1.4-.8l-2.2.4-1.8-3.1 1.1-1.9A8 8 0 0 1 5.6 12l-1.1-1.9 1.8-3.1 2.2.4a8 8 0 0 1 1.4-.8l.8-2h3.6l.8 2a8 8 0 0 1 1.4.8l2.2-.4 1.8 3.1-1.1 1.9a8 8 0 0 1 0 3Z" transform="translate(0 -1) scale(.92) translate(1 1)"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
    arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    heart: '<path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="m15 18-6-6 6-6M9 12h12"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  };

  const navIcons = new Map([
    ["feed.html", "home"], ["projects.html", "projects"], ["explore.html", "explore"],
    ["dashboard.html", "dashboard"], ["messages.html", "messages"],
    ["notifications.html", "notifications"], ["settings.html", "settings"], ["logout.html", "logout"],
  ]);
  const glyphIcons = new Map([["⌂", "home"], ["▤", "projects"], ["▦", "dashboard"], ["⌕", "explore"], ["✉", "messages"], ["♧", "notifications"], ["⚙", "settings"], ["✓", "check"], ["＋", "plus"], ["↗", "arrow"], ["♡", "heart"], ["×", "close"], ["✕", "close"], ["←", "back"]]);
  const svgNS = "http://www.w3.org/2000/svg";

  function makeIcon(name) {
    if (!paths[name]) return null;
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths[name];
    return svg;
  }

  function nameForLink(anchor) {
    try {
      const path = new URL(anchor.href, location.href).pathname.toLowerCase();
      for (const [file, icon] of navIcons) if (path.endsWith(`/${file}`)) return icon;
    } catch (_) { /* Ignore invalid or placeholder hrefs. */ }
    return null;
  }

  function normalizeNavigation(root = document) {
    const anchors = root.matches?.("nav a") ? [root] : [...(root.querySelectorAll?.("nav a") || [])];
    for (const anchor of anchors) {
      if (anchor.dataset.srIcon) continue;
      const name = nameForLink(anchor);
      if (!name) continue;
      const icon = makeIcon(name);
      if (!icon) continue;
      let slot = [...anchor.children].find((child) => child.matches("span, i") && !child.classList.contains("bmc-message-badge") && !child.classList.contains("bmc-notification-badge"));
      if (slot && !slot.querySelector("svg") && glyphIcons.has(slot.textContent.trim())) {
        slot.classList.add("sr-nav-icon");
        slot.setAttribute("aria-hidden", "true");
        slot.replaceChildren(icon);
      } else if (!slot) {
        slot = document.createElement("span");
        slot.className = "sr-nav-icon";
        slot.setAttribute("aria-hidden", "true");
        slot.append(icon);
        anchor.prepend(slot);
      }
      anchor.dataset.srIcon = name;
    }
  }

  function normalizeMarkedGlyphs(root = document) {
    const candidates = root.matches?.(".icon, .context-icon, [data-sr-glyph]")
      ? [root]
      : [...(root.querySelectorAll?.(".icon, .context-icon, [data-sr-glyph]") || [])];
    for (const element of candidates) {
      if (element.querySelector("svg")) continue;
      const name = glyphIcons.get(element.textContent.trim());
      if (!name) continue;
      element.classList.add("sr-icon");
      element.setAttribute("aria-hidden", "true");
      element.replaceChildren(makeIcon(name));
    }
  }

  function collect(root, selector) {
    const matches = root.matches?.(selector) ? [root] : [];
    return matches.concat([...((root.querySelectorAll && root.querySelectorAll(selector)) || [])]);
  }

  function normalizeComponents(root = document) {
    for (const element of collect(root, 'button, .button, .btn, .primary, .secondary, .action, [role="button"]')) element.classList.add("sr-button");
    for (const element of collect(root, 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="hidden"]), select, textarea')) element.classList.add("sr-field");
    for (const element of collect(root, '.card, .panel, .post, .project-card, .notification')) element.classList.add("sr-card");
    for (const element of collect(root, '.empty, [data-empty-state]')) element.classList.add("sr-empty");
    for (const element of collect(root, '.error, [role="alert"]')) element.classList.add("sr-error");
    for (const element of collect(root, '.tabs button, .filters button, [role="tab"]')) element.classList.add("sr-tab");
    for (const element of collect(root, '.toast')) element.classList.add("sr-toast");
  }

  function ensureAppShell() {
    const header = document.querySelector(".collabry-nav");
    if (!document.querySelector('script[data-bmc-category-select]')) {
      const component = document.createElement("script"); component.src = "/site/category-select.js"; component.dataset.bmcCategorySelect = "true"; document.head.append(component);
    }
    if (!header || document.body.classList.contains("sr-hero-page")) return;
    if (!header.querySelector(".bmc-global-search")) {
      const form = document.createElement("form"); form.className = "bmc-global-search"; form.setAttribute("role", "search"); form.setAttribute("aria-label", "Search Brand Media Collab");
      const input = document.createElement("input"); input.type = "search"; input.name = "q"; input.placeholder = "Search people, projects"; input.setAttribute("aria-label", "Search people or projects");
      const current = location.pathname.split("/").pop().toLowerCase(); const params = new URLSearchParams(location.search); input.value = params.get("q") || "";
      const icon = makeIcon("explore"); const iconWrap = document.createElement("span"); iconWrap.className = "bmc-global-search-icon"; iconWrap.setAttribute("aria-hidden", "true"); if (icon) iconWrap.append(icon);
      form.append(iconWrap, input); form.addEventListener("submit", (event) => { event.preventDefault(); const targetPage = current === "projects.html" ? "projects.html" : "explore.html"; const target = new URL(`/site/${targetPage}`, location.origin); const query = input.value.trim(); if (query) target.searchParams.set("q", query); location.assign(target.href); });
      const nav = header.querySelector("nav"); header.insertBefore(form, nav || header.querySelector(".collabry-account"));
    }
    const primaryNav = header.querySelector("nav");
    if (primaryNav && !primaryNav.querySelector("[data-notifications-link]")) {
      const link = document.createElement("a"); link.href = "notifications.html"; link.dataset.notificationsLink = "true"; link.innerHTML = '<span class="sr-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span><small>Notifications</small>';
      if (location.pathname.toLowerCase().endsWith("/notifications.html")) { link.classList.add("active"); link.setAttribute("aria-current", "page"); }
      const messages = primaryNav.querySelector('a[href$="messages.html"]'); if (messages) messages.after(link); else primaryNav.append(link);
    }
    if (!header.querySelector(".bmc-mobile-message")) {
      const link = document.createElement("a"); link.className = "bmc-mobile-message"; link.href = "messages.html"; link.setAttribute("aria-label", "Messages"); const icon = makeIcon("messages"); if (icon) link.append(icon); header.append(link);
    }
    if (!document.querySelector(".bmc-mobile-tabs")) {
      const mobile = document.createElement("nav"); mobile.className = "bmc-mobile-tabs"; mobile.setAttribute("aria-label", "Mobile navigation");
      const links = [["feed.html", "Home", "home"], ["projects.html", "Projects", "projects"], ["explore.html", "Explore", "explore"], ["notifications.html", "Notifications", "notifications"]];
      const currentPage = location.pathname.split("/").pop().toLowerCase();
      for (const [page, label, iconName] of links) { const anchor = document.createElement("a"); anchor.href = page; anchor.setAttribute("aria-label", label); if (currentPage === page) { anchor.setAttribute("aria-current", "page"); } const icon = makeIcon(iconName); const iconWrap = document.createElement("span"); iconWrap.className = "sr-nav-icon"; iconWrap.setAttribute("aria-hidden", "true"); if (icon) iconWrap.append(icon); const text = document.createElement("small"); text.textContent = label; anchor.append(iconWrap, text); mobile.append(anchor); }
      const more = document.createElement("details"); more.className = "bmc-mobile-more"; const summary = document.createElement("summary"); summary.setAttribute("aria-label", "More navigation options"); const moreIcon = document.createElement("span"); moreIcon.className = "sr-nav-icon"; moreIcon.setAttribute("aria-hidden", "true"); moreIcon.append(makeIcon("more")); const moreText = document.createElement("small"); moreText.textContent = "More"; summary.append(moreIcon, moreText); const menu = document.createElement("div"); menu.className = "bmc-mobile-more-menu";
      for (const [page, label] of [["dashboard.html", "Dashboard"], ["messages.html", "Messages"], ["my-profile.html", "My profile"], ["settings.html", "Settings & privacy"], ["help.html", "Help"], ["logout.html", "Log out"]]) { const anchor = document.createElement("a"); anchor.href = page; anchor.textContent = label; menu.append(anchor); }
      more.append(summary, menu); mobile.append(more); document.body.append(mobile);
    }
  }

  function update(root = document) {
    if (document.body) {
      const currentPage = location.pathname.split("/").pop().toLowerCase();
      document.body.classList.toggle("sr-hero-page", ["index.html", "landing-preview.html"].includes(currentPage));
      for (const [page, className] of Object.entries({ "feed.html": "sr-home-page", "projects.html": "sr-projects-page", "explore.html": "sr-explore-page", "dashboard.html": "sr-dashboard-page", "messages.html": "sr-messages-page", "notifications.html": "sr-notifications-page" })) {
        document.body.classList.toggle(className, currentPage === page);
      }
    }
    normalizeNavigation(root);
    normalizeMarkedGlyphs(root);
    normalizeComponents(root);
    ensureAppShell();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => update(), { once: true });
  else update();

  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) update(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
