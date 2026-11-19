// Shared connection requests and blocking actions for Explore and public profiles.
(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (message) => {
    const node = document.querySelector("#toast");
    if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2600); }
  };
  let supabase, user, rows = [], blocks = [], channel, loading;
  const listeners = new Set();

  async function ready() {
    if (supabase && user) return { supabase, user };
    if (!loading) loading = (async () => {
      supabase = await window.bmcSupabaseReady;
      if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Stagerang.");
      const { data: { user: current }, error } = await supabase.auth.getUser();
      if (error || !current) throw new Error("Please log in to explore Stagerang profiles.");
      user = current;
      await refresh();
      connectRealtime();
      return { supabase, user };
    })();
    return loading;
  }

  async function refresh() {
    if (!supabase || !user) return;
    const [connections, blockRows] = await Promise.all([
      supabase.from("profile_connections").select("id,requester_id,recipient_id,status,created_at,updated_at,accepted_at").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
      supabase.from("profile_blocks").select("blocker_id,blocked_id,created_at").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    ]);
    if (connections.error) throw connections.error;
    if (blockRows.error) throw blockRows.error;
    rows = connections.data || [];
    blocks = blockRows.data || [];
    listeners.forEach((listener) => listener());
    window.dispatchEvent(new CustomEvent("bmc-connections-updated"));
  }

  function connectRealtime() {
    if (channel || !supabase || !user) return;
    const refreshSafely = () => refresh().catch((error) => console.error("Connection refresh failed:", error));
    channel = supabase.channel(`profile-connections-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_connections", filter: `requester_id=eq.${user.id}` }, refreshSafely)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_connections", filter: `recipient_id=eq.${user.id}` }, refreshSafely)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_blocks", filter: `blocker_id=eq.${user.id}` }, refreshSafely)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_blocks", filter: `blocked_id=eq.${user.id}` }, refreshSafely)
      .subscribe();
  }

  function stateFor(otherId) {
    const block = blocks.find((item) => item.blocker_id === otherId || item.blocked_id === otherId);
    if (block) return { kind: block.blocker_id === user?.id ? "blocked-by-me" : "unavailable", block };
    const connection = rows.find((item) => item.requester_id === otherId || item.recipient_id === otherId);
    if (!connection) return { kind: "none", connection: null };
    if (connection.status === "accepted") return { kind: "connected", connection };
    if (connection.status === "pending") return { kind: connection.requester_id === user?.id ? "outgoing" : "incoming", connection };
    return { kind: connection.status, connection };
  }

  async function request(otherId) {
    await ready();
    if (!otherId || otherId === user.id) throw new Error("You can’t send a connection request to yourself.");
    const state = stateFor(otherId);
    if (state.kind === "blocked-by-me" || state.kind === "unavailable") throw new Error("This profile is unavailable for connection requests.");
    if (state.kind === "incoming") return respond(otherId, "accepted");
    if (state.kind === "outgoing" || state.kind === "connected") return;
    let result;
    if (state.connection) {
      result = await supabase.from("profile_connections").update({ status: "pending" }).eq("id", state.connection.id).select("id").single();
    } else {
      result = await supabase.from("profile_connections").insert({ requester_id: user.id, recipient_id: otherId, status: "pending" }).select("id").single();
    }
    if (result.error && result.error.code === "23505") { await refresh(); return; }
    if (result.error) throw result.error;
    await refresh();
  }

  async function respond(otherId, status) {
    await ready();
    if (!['accepted', 'declined'].includes(status)) throw new Error("Choose accept or decline for this request.");
    const state = stateFor(otherId);
    if (state.kind !== "incoming") throw new Error("There is no incoming request to update.");
    const { error } = await supabase.from("profile_connections").update({ status }).eq("id", state.connection.id);
    if (error) throw error;
    await refresh();
  }

  async function cancel(otherId) {
    await ready();
    const state = stateFor(otherId);
    if (state.kind !== "outgoing") throw new Error("There is no pending request to cancel.");
    const { error } = await supabase.from("profile_connections").update({ status: "canceled" }).eq("id", state.connection.id);
    if (error) throw error;
    await refresh();
  }

  async function block(otherId) {
    await ready();
    if (!otherId || otherId === user.id) throw new Error("You can’t block your own profile.");
    if (stateFor(otherId).kind === "blocked-by-me") return;
    const { error } = await supabase.from("profile_blocks").insert({ blocker_id: user.id, blocked_id: otherId });
    if (error && error.code !== "23505") throw error;
    await refresh();
  }

  async function unblock(otherId) {
    await ready();
    const { error } = await supabase.from("profile_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", otherId);
    if (error) throw error;
    await refresh();
  }

  async function listBlockedProfiles() {
    await ready();
    const ownBlocks = blocks.filter((item) => item.blocker_id === user.id);
    if (!ownBlocks.length) return [];
    const ids = ownBlocks.map((item) => item.blocked_id);
    const { data, error } = await supabase.from("profiles").select("id,display_name,company_name,account_type").in("id", ids);
    if (error) throw error;
    const byId = Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
    return ownBlocks.map((item) => ({ ...item, profile: byId[item.blocked_id] })).filter((item) => item.profile);
  }

  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

  async function renderProfileActions(profileId, isOwner) {
    const host = document.querySelector("#profile-connection-actions");
    if (!host || isOwner || !profileId) return;
    await ready();
    const draw = () => {
      const state = stateFor(profileId);
      const actionButton = (action, label, cls = "connect-action") => `<button class="${cls}" type="button" data-connection-action="${action}">${label}</button>`;
      let actions = "";
      if (state.kind === "connected") actions = '<a class="message-action" href="messages.html?profile=' + encodeURIComponent(profileId) + '">Message</a><button class="block-profile" type="button" data-connection-action="block">Block profile</button>';
      else if (state.kind === "incoming") actions = actionButton("accept", "Accept connection") + actionButton("decline", "Decline", "connect-action secondary") + '<button class="block-profile" type="button" data-connection-action="block">Block profile</button>';
      else if (state.kind === "outgoing") actions = actionButton("cancel", "Request sent · Cancel", "connect-action secondary") + '<button class="block-profile" type="button" data-connection-action="block">Block profile</button>';
      else if (state.kind === "blocked-by-me") actions = actionButton("unblock", "Unblock profile", "connect-action secondary");
      else if (state.kind === "unavailable") actions = '<button class="connect-action secondary" type="button" disabled>Unavailable</button>';
      else if (state.kind === "declined") actions = actionButton("connect", "Connect again") + '<button class="block-profile" type="button" data-connection-action="block">Block profile</button>';
      else if (state.kind === "canceled") actions = actionButton("connect", "Connect") + '<button class="block-profile" type="button" data-connection-action="block">Block profile</button>';
      else actions = actionButton("connect", "Connect") + '<button class="block-profile" type="button" data-connection-action="block">Block profile</button>';
      host.innerHTML = actions;
      host.querySelectorAll("[data-connection-action]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const action = button.dataset.connectionAction;
          if (action === "connect") await request(profileId);
          else if (action === "accept") await respond(profileId, "accepted");
          else if (action === "decline") await respond(profileId, "declined");
          else if (action === "cancel") await cancel(profileId);
          else if (action === "block") await block(profileId);
          else if (action === "unblock") await unblock(profileId);
          toast(action === "accept" ? "You’re connected. You can now message each other." : action === "block" ? "Profile blocked. You can undo this in Explore." : action === "unblock" ? "Profile unblocked." : "Connection status updated.");
          draw();
        } catch (error) { button.disabled = false; toast(error.message || "Could not update this connection."); }
      }));
      host.querySelectorAll("a.message-action").forEach((link) => link.addEventListener("click", (event) => {
        event.preventDefault(); location.href = link.href;
      }));
    };
    draw();
    subscribe(draw);
  }

  window.bmcConnections = { ready, refresh, stateFor, request, respond, cancel, block, unblock, listBlockedProfiles, subscribe, renderProfileActions };
})();
