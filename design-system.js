// Small local outline icon set keeps static pages consistent without a CDN dependency.
(() => {
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

  function update(root = document) {
    if (document.body) {
      const currentPage = location.pathname.split("/").pop().toLowerCase();
      document.body.classList.toggle("sr-hero-page", ["index.html", "landing-preview.html", "explore.html"].includes(currentPage));
    }
    normalizeNavigation(root);
    normalizeMarkedGlyphs(root);
    normalizeComponents(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => update(), { once: true });
  else update();

  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) update(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
