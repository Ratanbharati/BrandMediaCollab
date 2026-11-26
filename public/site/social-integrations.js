(() => {
  const services = [...document.querySelectorAll(".card")].find((card) => card.querySelector("h2")?.textContent.trim() === "Connected services");
  if (!services) return;
  const socialRow = [...services.querySelectorAll(".row")].find((row) => row.textContent.includes("Social accounts"));
  if (!socialRow) return;

  const status = new URLSearchParams(location.search).get("social");
  if (status) {
    const providerLabel = (provider) => provider === "instagram" ? "Instagram" : provider === "youtube" ? "YouTube" : "Social account";
    const label = status.startsWith("connected_") ? `${providerLabel(status.slice("connected_".length))} connected. Your account was authorized.`
      : status.endsWith("_cancelled") ? "Connection was cancelled; no account was linked."
        : status.startsWith("error_") ? "The platform could not finish connecting. Check the app settings and try again."
          : "Social account connection updated.";
    const banner = document.createElement("div"); banner.className = "social-feedback"; banner.setAttribute("role", "status"); banner.textContent = label;
    services.before(banner); history.replaceState({}, "", `${location.pathname}${location.hash}`);
  }

  socialRow.remove();
  const panel = document.createElement("div"); panel.className = "social-integrations"; panel.id = "social-connections";
  panel.innerHTML = `<div class="social-intro"><div><h3>Connect Instagram or YouTube</h3><p>Connect your own professional Instagram account or YouTube channel to fetch the audience metrics each platform makes available. BMC never asks for your social password.</p></div><span class="social-readonly">Read only</span></div><div class="social-cards"></div><p class="social-privacy-note">Your public social link and follower or subscriber count may appear on your member profile while Discoverability is on. Detailed performance insights are shown only to you. You can disconnect an account here at any time.</p>`;
  services.insertBefore(panel, services.querySelector(".row"));
  const cards = panel.querySelector(".social-cards");
  const providerNames = { instagram: "Instagram", youtube: "YouTube" };
  const connected = new Map();
  let authToken = "";
  const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-IN", { notation: Number(value) >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value)) : "Not available";
  const metricNode = (label, value) => { const item = document.createElement("div"); item.className = "social-metric"; const title = document.createElement("span"); title.textContent = label; const amount = document.createElement("b"); amount.textContent = value == null ? "Not available" : number(value); item.append(title, amount); return item; };
  const setStatus = (card, text, isError = false) => { const target = card.querySelector("[data-social-status]"); target.textContent = text; target.dataset.error = String(isError); };

  function makeCard(provider) {
    const card = document.createElement("article"); card.className = "social-connection-card"; card.dataset.provider = provider;
    const heading = document.createElement("div"); heading.className = "social-connection-heading";
    const info = document.createElement("div"); info.className = "social-connection-info";
    const title = document.createElement("h4"); title.textContent = providerNames[provider];
    const identity = document.createElement("p"); identity.dataset.identity = ""; identity.textContent = "Not connected"; info.append(title, identity);
    const actions = document.createElement("div"); actions.className = "social-connection-actions";
    const connect = document.createElement("button"); connect.type = "button"; connect.className = "secondary"; connect.dataset.connect = provider; connect.textContent = "Connect account";
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "secondary"; refresh.dataset.sync = provider; refresh.textContent = "Refresh insights"; refresh.hidden = true;
    const disconnect = document.createElement("button"); disconnect.type = "button"; disconnect.className = "social-disconnect"; disconnect.dataset.disconnect = provider; disconnect.textContent = "Disconnect"; disconnect.hidden = true;
    actions.append(connect, refresh, disconnect); heading.append(info, actions);
    const grid = document.createElement("div"); grid.className = "social-metric-grid"; grid.hidden = true; grid.dataset.metrics = "";
    const synced = document.createElement("small"); synced.className = "social-updated"; synced.dataset.updated = "";
    const message = document.createElement("p"); message.className = "social-card-status"; message.dataset.socialStatus = ""; message.setAttribute("role", "status");
    card.append(heading, grid, synced, message); cards.append(card); return card;
  }

  const cardByProvider = Object.fromEntries(["instagram", "youtube"].map((provider) => [provider, makeCard(provider)]));
  async function request(path, init = {}) {
    const response = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The request did not complete.");
    return result;
  }

  function paint(provider, account) {
    const card = cardByProvider[provider]; const identity = card.querySelector("[data-identity]"); const grid = card.querySelector("[data-metrics]");
    const connect = card.querySelector("[data-connect]"); const refresh = card.querySelector("[data-sync]"); const disconnect = card.querySelector("[data-disconnect]");
    if (!account) { identity.textContent = "Not connected"; grid.hidden = true; refresh.hidden = true; disconnect.hidden = true; connect.textContent = "Connect account"; return; }
    connected.set(provider, account); const metrics = account.metrics || {};
    identity.textContent = provider === "instagram" ? `@${metrics.username || account.profile_url?.split("/").filter(Boolean).at(-1) || "Connected"}` : metrics.title || "YouTube channel connected";
    grid.replaceChildren();
    if (provider === "instagram") {
      grid.append(metricNode("Followers", account.follower_count), metricNode("Reach", metrics.insights?.reach), metricNode("Interactions", metrics.insights?.total_interactions), metricNode("Accounts engaged", metrics.insights?.accounts_engaged));
    } else {
      const recent = metrics.analytics_28_days || {};
      grid.append(metricNode("Subscribers", account.follower_count), metricNode("Lifetime views", metrics.lifetime_views), metricNode("Views · 28 days", recent.views), metricNode("Likes · 28 days", recent.likes));
    }
    grid.hidden = false; connect.textContent = "Reconnect"; refresh.hidden = false; disconnect.hidden = false;
    const date = account.last_synced_at ? new Date(account.last_synced_at) : null;
    card.querySelector("[data-updated]").textContent = date && !Number.isNaN(date.getTime()) ? `Last refreshed ${date.toLocaleString()}` : "Metrics are not available yet.";
  }

  async function load() {
    try {
      const db = await window.bmcSupabaseReady; if (!db) throw new Error("BMC account services are unavailable.");
      const { data: { session }, error } = await db.auth.getSession(); if (error || !session?.access_token) throw new Error("Sign in again to manage connected accounts.");
      authToken = session.access_token;
      const result = await request("/api/social/accounts");
      const accounts = new Map((result.accounts || []).map((account) => [account.platform, account]));
      for (const provider of ["instagram", "youtube"]) paint(provider, accounts.get(provider) || null);
    } catch (error) {
      for (const provider of ["instagram", "youtube"]) setStatus(cardByProvider[provider], error.message || "Could not load connected accounts.", true);
    }
  }

  cards.addEventListener("click", async (event) => {
    const button = event.target.closest("button"); if (!button) return;
    const provider = button.dataset.connect || button.dataset.sync || button.dataset.disconnect; if (!provider) return;
    if (button.hasAttribute("data-disconnect") && !confirm(`Disconnect ${providerNames[provider]} and remove its saved metrics from BMC?`)) return;
    button.disabled = true; const card = cardByProvider[provider]; setStatus(card, "Working…");
    try {
      if (button.hasAttribute("data-connect")) {
        const { url } = await request("/api/social/connect", { method: "POST", body: JSON.stringify({ provider }) });
        if (!url) throw new Error("The authorization link could not be created."); location.assign(url); return;
      }
      if (button.hasAttribute("data-sync")) {
        const result = await request("/api/social/sync", { method: "POST", body: JSON.stringify({ provider }) }); paint(provider, result.account); setStatus(card, "Insights refreshed from the connected platform.");
      } else {
        await request(`/api/social/accounts?platform=${encodeURIComponent(provider)}`, { method: "DELETE" }); connected.delete(provider); paint(provider, null); setStatus(card, "Account disconnected and saved metrics removed.");
      }
    } catch (error) { setStatus(card, error.message || "The request could not be completed.", true); }
    finally { button.disabled = false; }
  });

  load();
})();
