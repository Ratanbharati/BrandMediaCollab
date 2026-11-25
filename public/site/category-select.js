// One accessible category selector shared by the account, discovery and project views.
(() => {
  if (window.bmcCategorySelectReady) return;
  window.bmcCategorySelectReady = true;
  const categories = window.BMCCategories || [];
  const byId = Object.fromEntries(categories.map((item) => [item.id, item]));
  let idSequence = 0;

  function setUrl(value) {
    const url = new URL(location.href);
    if (value && value !== "all") url.searchParams.set("category", value);
    else url.searchParams.delete("category");
    history.pushState({}, "", url);
  }
  function sourceOptions(source, allLabel, includeAll = true) {
    const options = includeAll ? [{ id: "all", label: allLabel, count: null }] : [];
    for (const category of categories) {
      const button = source?.querySelector(`[data-kind="${category.id}"],[data-type="${category.id}"],[data-feed-kind="${category.id}"],[data-filter="${category.id}"]`);
      const countNode = button?.querySelector(".count, [data-count], span:last-child");
      options.push({ id: category.id, label: category.projectLabel, count: countNode ? countNode.textContent.trim() : null });
    }
    return options;
  }
  function makeSelect(host, { label = "Category", allLabel = "All categories", options, initial = "all", description = false, onSelect, idPrefix = "bmc-category" }) {
    if (!host || host.querySelector(":scope > .bmc-category-select")) return host?.querySelector(":scope > .bmc-category-select");
    const root = document.createElement("div"); root.className = "bmc-category-select"; root.dataset.categorySelect = idPrefix;
    const uid = `${idPrefix}-${++idSequence}`;
    const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "bmc-category-trigger"; trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-controls", `${uid}-list`);
    const title = document.createElement("span"); title.className = "bmc-category-trigger-label";
    const caret = document.createElement("span"); caret.className = "bmc-category-caret"; caret.setAttribute("aria-hidden", "true"); caret.textContent = "▾"; trigger.append(title, caret);
    const backdrop = document.createElement("button"); backdrop.type = "button"; backdrop.className = "bmc-category-backdrop"; backdrop.tabIndex = -1; backdrop.setAttribute("aria-label", "Close category menu");
    const menu = document.createElement("div"); menu.className = "bmc-category-menu"; menu.id = `${uid}-list`; menu.setAttribute("role", "listbox"); menu.setAttribute("aria-label", label); menu.tabIndex = -1;
    const desc = document.createElement("div"); desc.className = "bmc-category-description"; desc.hidden = !description;
    root.append(trigger, desc, backdrop, menu); host.append(root);
    let current = initial, activeIndex = 0, typeBuffer = "", typeTimer;
    function render() {
      menu.replaceChildren();
      const selectedOption = options.find((option) => option.id === current) || options[0];
      title.textContent = `${label}: ${selectedOption?.shortLabel || selectedOption?.label || allLabel}`;
      desc.textContent = selectedOption?.id === "all" ? "Choose the profile or project type that fits your search." : (byId[selectedOption?.id]?.description || "");
      desc.hidden = !description || !desc.textContent;
      options.forEach((option, index) => {
        const row = document.createElement("button"); row.type = "button"; row.className = "bmc-category-option"; row.id = `${uid}-option-${index}`; row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(option.id === current));
        const name = document.createElement("span"); name.textContent = option.label;
        const count = document.createElement("span"); count.className = "bmc-category-count"; count.textContent = option.count == null ? "" : option.count;
        const check = document.createElement("span"); check.className = "bmc-category-check"; check.setAttribute("aria-hidden", "true"); check.textContent = option.id === current ? "✓" : "";
        row.append(name, count, check); row.addEventListener("click", () => choose(option.id)); menu.append(row);
      });
      activeIndex = Math.max(0, options.findIndex((option) => option.id === current));
    }
    function close(restoreFocus = false) { root.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); if (restoreFocus) trigger.focus(); }
    function open() { root.classList.add("open"); trigger.setAttribute("aria-expanded", "true"); activeIndex = Math.max(0, options.findIndex((option) => option.id === current)); menu.querySelectorAll('[role="option"]')[activeIndex]?.focus(); }
    function choose(value) { current = value; render(); close(true); setUrl(value); onSelect?.(value); root.dispatchEvent(new CustomEvent("bmc:category-change", { bubbles: true, detail: { value } })); }
    function setOptions(next) { if (JSON.stringify(options) === JSON.stringify(next)) return; options = next; if (!options.some((option) => option.id === current)) current = options[0]?.id || "all"; render(); }
    root.bmcSetCategory = (value) => { if (current !== value && options.some((option) => option.id === value)) { current = value; render(); } };
    root.bmcSetOptions = setOptions;
    trigger.addEventListener("click", () => root.classList.contains("open") ? close() : open());
    backdrop.addEventListener("click", () => close(true));
    menu.addEventListener("keydown", (event) => {
      const rows = [...menu.querySelectorAll('[role="option"]')];
      if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length; rows[activeIndex]?.focus(); }
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); activeIndex = event.key === "Home" ? 0 : rows.length - 1; rows[activeIndex]?.focus(); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); rows[activeIndex]?.click(); }
      else if (event.key === "Escape") { event.preventDefault(); close(true); }
      else if (event.key.length === 1 && /[\p{L}\p{N} ]/u.test(event.key)) { typeBuffer += event.key.toLowerCase(); clearTimeout(typeTimer); typeTimer = setTimeout(() => { typeBuffer = ""; }, 700); const found = options.findIndex((option) => option.label.toLowerCase().startsWith(typeBuffer)); if (found >= 0) { activeIndex = found; rows[found]?.focus(); } }
    });
    document.addEventListener("pointerdown", (event) => { if (!root.contains(event.target)) close(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && root.classList.contains("open")) close(true); });
    render(); return root;
  }
  function queryCategory(fallback = "all") { const value = new URLSearchParams(location.search).get("category"); return byId[value] || value === "all" ? value : fallback; }
  function findSourceValue(source, selector, attr, fallback) { return source?.querySelector(`${selector}.active`)?.getAttribute(attr) || fallback; }

  function home() {
    const tabs = document.querySelector("#bmc-feed-tabs"); if (!tabs) return;
    let root = tabs.parentElement.querySelector(':scope > .bmc-category-select[data-category-select="home"]');
    const opts = sourceOptions(tabs, "All categories");
    const selected = queryCategory("all");
    if (!root) root = makeSelect(tabs.parentElement, { label: "Category", allLabel: "All categories", options: opts, initial: selected, idPrefix: "home", onSelect(value) { const button = tabs.querySelector(`[data-feed-kind="${value}"]`); button?.click(); } });
    else { root.bmcSetOptions(opts); root.bmcSetCategory(selected); const active = findSourceValue(tabs, "[data-feed-kind]", "data-feed-kind", "all"); if (active !== selected) tabs.querySelector(`[data-feed-kind="${selected}"]`)?.click(); }
    if (root && selected !== findSourceValue(tabs, "[data-feed-kind]", "data-feed-kind", "all")) tabs.querySelector(`[data-feed-kind="${selected}"]`)?.click();
    if (root && root.nextElementSibling !== tabs) tabs.before(root);
  }
  function projectsPage() {
    const page = document.querySelector(".projects-content"), tabs = page?.querySelector(".segmented");
    const row = page?.querySelector(".filter-row"); if (!tabs || !row) return;
    const opts = sourceOptions(tabs, "All categories");
    const selected = queryCategory(new URLSearchParams(location.search).get("kind") || "all");
    // The control is moved from the content wrapper into the filter row below;
    // search the whole Projects page so the observer never creates duplicates.
    const existing = page.querySelector('.bmc-category-select[data-category-select="projects"]');
    const instance = existing || makeSelect(page, { label: "Category", allLabel: "All categories", options: opts, initial: selected, idPrefix: "projects", onSelect(value) { if (value === "all") window.bmcSetProjectKind?.("all"); else tabs.querySelector(`[data-kind="${value}"]`)?.click(); } });
    if (instance && existing) { instance.bmcSetOptions(opts); instance.bmcSetCategory(selected); const active = findSourceValue(tabs, "[data-kind]", "data-kind", "all"); if (active !== selected) { if (selected === "all") window.bmcSetProjectKind?.("all"); else tabs.querySelector(`[data-kind="${selected}"]`)?.click(); } }
    if (instance && !existing) { if (selected === "all") window.bmcSetProjectKind?.("all"); else tabs.querySelector(`[data-kind="${selected}"]`)?.click(); }
    if (instance && instance.parentElement !== row) {
      row.prepend(instance);
      const search = row.querySelector("#q"); if (search) row.insertBefore(search, instance);
    }
  }
  function explorePage() {
    const tabs = document.querySelector(".role-tabs"); if (!tabs) return;
    const host = tabs.parentElement, opts = [{ id: "all", label: "Everyone", shortLabel: "Everyone" }, ...categories.map((item) => ({ id: item.id, label: item.plural, count: String(document.querySelectorAll(`.profile-card[data-type="${item.id}"]`).length) }))];
    const selected = queryCategory("all");
    const existing = host.querySelector(':scope > .bmc-category-select[data-category-select="explore"]');
    const instance = existing || makeSelect(host, { label: "Type", allLabel: "Everyone", options: opts, initial: selected, idPrefix: "explore", onSelect(value) { tabs.querySelector(`[data-type="${value}"]`)?.click(); } });
    if (instance && existing) { instance.bmcSetOptions(opts); instance.bmcSetCategory(selected); const active = findSourceValue(tabs, "[data-type]", "data-type", "all"); if (active !== selected) tabs.querySelector(`[data-type="${selected}"]`)?.click(); }
    if (instance && !existing && selected !== "all") tabs.querySelector(`[data-type="${selected}"]`)?.click();
    if (instance && instance.nextElementSibling !== tabs) tabs.before(instance);
  }
  function signupPage() {
    const roleHost = document.querySelector("#role-options"); if (!roleHost) return;
    const options = categories.map((item) => ({ id: item.id, label: item.singular }));
    const selected = roleHost.querySelector(".role-chip.selected")?.dataset.role || "brand";
    const host = roleHost.parentElement, existing = host.querySelector(':scope > .bmc-category-select[data-category-select="signup"]');
    const instance = existing || makeSelect(host, { label: "I am a", allLabel: "Choose a type", options, initial: selected, description: true, idPrefix: "signup", onSelect(value) { roleHost.querySelector(`[data-role="${value}"]`)?.click(); } });
    if (instance && existing) instance.bmcSetCategory(selected);
    if (instance && instance.nextElementSibling !== roleHost) roleHost.before(instance);
  }
  function messagesPage() {
    const tabs = document.querySelector("#conversation-filters"); if (!tabs) return;
    const opts = [{ id: "all", label: "All types", shortLabel: "All types", count: String(document.querySelectorAll("#thread-list .thread").length) }, ...categories.map((item) => ({ id: item.id, label: item.plural, count: String(document.querySelectorAll(`#thread-list .thread[data-kind="${item.id}"]`).length) }))];
    const existing = tabs.parentElement.querySelector(':scope > .bmc-category-select[data-category-select="messages"]');
    const selected = queryCategory("all");
    const instance = existing || makeSelect(tabs.parentElement, { label: "Type", allLabel: "All types", options: opts, initial: selected, idPrefix: "messages", onSelect(value) { const target = value === "all" ? "all" : value; document.dispatchEvent(new CustomEvent("bmc:message-type", { detail: { value: target } })); } });
    if (instance && existing) { instance.bmcSetOptions(opts); instance.bmcSetCategory(selected); document.dispatchEvent(new CustomEvent("bmc:message-type", { detail: { value: selected } })); }
    if (instance && !existing && selected !== "all") document.dispatchEvent(new CustomEvent("bmc:message-type", { detail: { value: selected } }));
    if (instance && instance.previousElementSibling !== tabs) tabs.after(instance);
  }
  function dashboardPage() {
    const headingRow = document.querySelector(".heading-row"); if (!headingRow || !document.querySelector(".table-panel")) return;
    const opts = categories.map((item) => ({ id: item.id, label: item.projectLabel, count: String(document.querySelectorAll(`.table-panel[data-bmc-category="${item.id}"] tbody tr`).length) }));
    const initial = queryCategory(window.bmcAccountType || document.querySelector("#role")?.value || "brand"), existing = headingRow.querySelector(':scope > .bmc-category-select[data-category-select="dashboard"]');
    const apply = (value) => {
      const panels = [...document.querySelectorAll(".table-panel[data-bmc-category]")];
      panels.forEach((panel) => { panel.hidden = panel.dataset.bmcCategory !== value; });
    };
    const instance = existing || makeSelect(headingRow, { label: "Type", allLabel: "All categories", options: opts, initial, idPrefix: "dashboard", onSelect: apply });
    if (instance && existing) { instance.bmcSetOptions(opts); instance.bmcSetCategory(initial); }
    const anchor = headingRow.querySelector(".date-wrap") || headingRow.firstChild;
    if (instance && instance.nextElementSibling !== anchor) headingRow.insertBefore(instance, anchor);
    apply(initial);
  }
  function projectForm() {
    const type = document.querySelector("#kind"); if (!type) return;
    const host = type.parentElement; if (!host || host.querySelector(':scope > .bmc-category-select[data-category-select="project-form"]')) return;
    const options = categories.map((item) => ({ id: item.id, label: item.projectLabel }));
    const instance = makeSelect(host, { label: "Project type", options, initial: type.value || "brand", idPrefix: "project-form", onSelect(value) { type.value = value; type.dispatchEvent(new Event("change", { bubbles: true })); } });
    if (instance) instance.bmcSetCategory(type.value || "brand");
  }
  function setup() { home(); projectsPage(); explorePage(); signupPage(); messagesPage(); dashboardPage(); projectForm(); }
  setup();
  window.addEventListener("popstate", setup);
  let setupTimer;
  const observer = new MutationObserver(() => { clearTimeout(setupTimer); setupTimer = setTimeout(setup, 60); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
