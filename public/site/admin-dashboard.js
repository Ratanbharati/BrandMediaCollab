(async function () {
  const $ = (selector) => document.querySelector(selector);
  const login = $("#login-panel"), panel = $("#admin-panel"), errorBox = $("#login-error"), notice = $("#setup-notice"), toastNode = $("#toast");
  let supabase, activeAdminId = "", activeView = "overview", cache = {}, pages = { users: 1, reports: 1, verification: 1 }, hasMore = {}, refreshTimer = 0, refreshBusy = false, searchTimer = 0;
  const esc = (value) => String(value ?? "");
  const date = (value) => value ? new Date(value).toLocaleString() : "—";
  const toast = (message) => { toastNode.textContent = message; toastNode.classList.add("show"); window.setTimeout(() => toastNode.classList.remove("show"), 3000); };
  const setVisible = (element, visible) => element.classList.toggle("hidden", !visible);
  function td(row, value) { const cell = document.createElement("td"); cell.textContent = esc(value); row.append(cell); return cell; }
  function emptyRow(body, message, columns) { body.replaceChildren(); const row = document.createElement("tr"); const cell = td(row, message); cell.colSpan = columns; body.append(row); }

  async function api(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in again to continue.");
    const response = await fetch(path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Admin request failed.");
    return data;
  }
  const mutate = (path, payload) => api(path, { method: "PATCH", body: JSON.stringify(payload) });
  function showError(error) {
    if (panel.classList.contains("hidden")) { errorBox.textContent = error.message || "Admin sign in could not be verified."; setVisible(login, true); return; }
    notice.textContent = error.message || "Admin data could not be loaded."; notice.classList.remove("hidden");
  }

  async function loadOverview() {
    const data = await api("/api/admin/data?resource=overview"), c = data.counts || {};
    const labels = [
      ["Total registered users", c.total_users], ["Active users · 30 days", c.active_users_30d],
      ["Creators", c.creator_accounts], ["Brands", c.brand_accounts], ["Agencies", c.agency_accounts],
      ["Celebrities", c.celebrity_accounts], ["Events", c.event_accounts], ["Media", c.media_accounts],
      ["Communities", c.community_accounts], ["Distributors", c.distributor_accounts], ["Freelancers", c.freelancer_accounts],
      ["Total projects", c.total_projects], ["Published projects", c.published_projects], ["Applications", c.applications],
      ["Collaborations", c.collaborations], ["Connections", c.connections], ["Reports", c.reports],
      ["Pending reports", c.pending_reports], ["Pending verification", c.pending_verification],
      ["Suspended accounts", c.suspended_accounts], ["Open support requests", c.open_support_requests], ["Admin actions", c.admin_actions],
    ];
    const host = $("#overview-metrics"); host.replaceChildren();
    labels.forEach(([label, value]) => { const card = document.createElement("article"); card.className = "metric"; const name = document.createElement("span"); name.textContent = label; const number = document.createElement("b"); number.textContent = String(value ?? 0); card.append(name, number); host.append(card); });
  }

  function userFilters() {
    const q = new URLSearchParams({ resource: "users", page: String(pages.users) });
    if ($("#user-search").value.trim()) q.set("q", $("#user-search").value.trim());
    if ($("#user-type").value) q.set("type", $("#user-type").value);
    if ($("#user-status").value) q.set("status", $("#user-status").value);
    return q;
  }
  async function openUserDetail(userId) {
    const data = await api(`/api/admin/data?resource=user&id=${encodeURIComponent(userId)}`), u = data.user || {};
    const host = $("#user-detail-body"); host.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = u.display_name || u.company_name || u.email || "Member"; host.append(heading);
    [["Email", u.email], ["Profile type", u.account_type], ["Created", date(u.created_at)], ["Last active", date(u.last_sign_in_at)], ["Email verified", u.email_confirmed_at ? "Yes" : "No"], ["Profile completion", `${u.profile_completion ?? 0}%`], ["Profile verification", u.is_verified ? "Verified" : "Not verified"], ["Visibility", u.is_discoverable ? "Discoverable" : "Private"], ["Status", u.account_status], ["Projects", u.project_count], ["Location", u.location], ["Public bio", u.bio]].forEach(([label, value]) => { const p = document.createElement("p"); const b = document.createElement("b"); b.textContent = `${label}: `; p.append(b, document.createTextNode(esc(value ?? "—"))); host.append(p); });
    $("#user-detail").showModal();
  }
  async function loadUsers() {
    const data = await api(`/api/admin/data?${userFilters()}`); cache.users = data.rows || []; hasMore.users = Boolean(data.hasMore);
    const body = $("#users-body"); body.replaceChildren();
    cache.users.forEach((user) => {
      const row = document.createElement("tr"); td(row, user.display_name || user.company_name || "Member"); td(row, user.email || "—"); td(row, user.account_type || "—"); td(row, date(user.created_at)); td(row, `${user.profile_completion ?? 0}%`); td(row, user.project_count || 0); td(row, user.is_verified ? "Verified" : "Not verified"); td(row, user.account_status || "active");
      const actions = document.createElement("td"); actions.className = "actions";
      const detail = document.createElement("button"); detail.className = "button secondary"; detail.textContent = "View"; detail.onclick = () => openUserDetail(user.id).catch((e) => toast(e.message)); actions.append(detail);
      const visibility = document.createElement("button"); visibility.className = "button secondary"; visibility.textContent = user.is_discoverable ? "Hide" : "Show"; visibility.onclick = async () => { visibility.disabled = true; try { await mutate("/api/admin/users", { action: "visibility", userId: user.id, isDiscoverable: !user.is_discoverable }); toast("Profile visibility updated."); await loadUsers(); } catch (e) { toast(e.message); visibility.disabled = false; } }; actions.append(visibility);
      const toggle = document.createElement("button"); toggle.className = `button ${user.account_status === "suspended" ? "secondary" : "danger"}`; toggle.textContent = user.account_status === "suspended" ? "Restore" : "Suspend";
      toggle.disabled = Boolean(user.is_platform_admin || user.id === activeAdminId);
      toggle.onclick = async () => {
        const isSuspended = user.account_status === "suspended";
        const reason = isSuspended ? "" : (prompt(`Reason for suspending ${user.email || "this account"}:`) || "").trim();
        if (!isSuspended && reason.length < 8) return toast("A suspension reason of at least 8 characters is required.");
        if (!confirm(`${isSuspended ? "Restore" : "Suspend"} ${user.email || "this account"}? ${isSuspended ? "The member will be able to sign in again." : "They will lose sign-in and database access."}`)) return;
        toggle.disabled = true;
        try { await mutate("/api/admin/users", { action: isSuspended ? "restore" : "suspend", userId: user.id, reason }); toast(isSuspended ? "Account restored." : "Account suspended."); await loadUsers(); await loadOverview(); }
        catch (e) { toast(e.message); toggle.disabled = false; }
      }; actions.append(toggle);
      const canDelete = !user.is_platform_admin && user.id !== activeAdminId;
      const remove = document.createElement("button"); remove.className = "button danger"; remove.textContent = canDelete ? "Delete" : "Protected"; remove.disabled = !canDelete;
      remove.title = canDelete ? "Permanently delete this account and its associated platform data" : "Platform administrator accounts are protected";
      remove.onclick = async () => {
        const email = String(user.email || "").trim();
        if (!email) return toast("This account has no email address to confirm.");
        if (!confirm(`Permanently delete ${email}? This cannot be undone. The account profile, projects, applications, connections, messages, notifications, and uploaded avatar files associated with the account may be deleted. The email can then be used to register again.`)) return;
        const typedEmail = prompt(`To confirm permanent deletion, type this account's email exactly:\n\n${email}`);
        if (typedEmail === null) return;
        if (typedEmail.trim().toLowerCase() !== email.toLowerCase()) return toast("Email did not match. The account was not deleted.");
        remove.disabled = true; remove.textContent = "Deleting…";
        try {
          const result = await api("/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: user.id, confirmEmail: typedEmail.trim() }) });
          toast(result.auditWarning ? "Account deleted. The audit log could not record the completion." : "Account permanently deleted. Its email can now be reused.");
          await loadUsers(); await loadOverview();
        } catch (error) { toast(error.message); remove.disabled = false; remove.textContent = "Delete"; }
      };
      actions.append(remove); row.append(actions); body.append(row);
    });
    if (!body.children.length) emptyRow(body, "No accounts match these filters.", 9);
    $("#users-page-label").textContent = `Page ${pages.users} · ${cache.users.length} accounts shown${hasMore.users ? " · more available" : ""}`; $("#users-prev").disabled = pages.users <= 1; $("#users-next").disabled = !hasMore.users;
  }

  function makeModerationControl(item) {
    const cell = document.createElement("td"), select = document.createElement("select");
    [["normal", "Normal"], ["review", "Needs review"], ["hidden", "Hidden"], ["removed", "Removed"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option); });
    select.value = item.moderation_status || "normal"; const save = document.createElement("button"); save.className = "button secondary"; save.textContent = "Save"; save.style.marginTop = "5px";
    save.onclick = async () => { if (["hidden", "removed"].includes(select.value) && !confirm(`${select.value === "removed" ? "Mark this project removed" : "Hide this project"}? The project owner will still be able to see it.`)) return; const reason = prompt("Moderation reason (optional):", item.moderation_reason || ""); if (reason === null) return; save.disabled = true; try { await mutate("/api/admin/data", { action: "project", id: item.id, status: select.value, reason }); toast("Project moderation updated."); await loadProjects(); await loadOverview(); } catch (e) { toast(e.message); save.disabled = false; } };
    cell.append(select, document.createElement("br"), save); return cell;
  }
  function renderProjects(list) {
    const body = $("#projects-body"), query = $("[data-search='projects']").value.trim().toLowerCase(); body.replaceChildren();
    list.filter((item) => `${item.project_name} ${item.owner_name} ${item.owner_type}`.toLowerCase().includes(query)).forEach((item) => { const row = document.createElement("tr"); td(row, item.project_name); td(row, item.owner_name); td(row, item.owner_type); td(row, item.category); td(row, item.status); row.append(makeModerationControl(item)); td(row, date(item.created_at)); body.append(row); });
    if (!body.children.length) emptyRow(body, "No projects match this search.", 7);
  }
  async function loadProjects() { const data = await api("/api/admin/data?resource=projects"); cache.projects = data.projects || []; renderProjects(cache.projects); }

  function renderApplications(list) {
    const body = $("#applications-body"), query = $("[data-search='applications']").value.trim().toLowerCase(); body.replaceChildren();
    list.filter((item) => `${item.project_name} ${item.applicant_name} ${item.status}`.toLowerCase().includes(query)).forEach((item) => { const row = document.createElement("tr"); td(row, item.project_name); td(row, `${item.applicant_name} · ${item.applicant_type}`); td(row, item.status); td(row, date(item.created_at)); body.append(row); });
    if (!body.children.length) emptyRow(body, "No applications match this search.", 4);
  }
  async function loadApplications() { const data = await api("/api/admin/data?resource=applications"); cache.applications = data.applications || []; renderApplications(cache.applications); }

  function pager(resource, data) {
    hasMore[resource] = Boolean(data.hasMore); $(`#${resource}-page-label`).textContent = `Page ${pages[resource]} · ${data[resource === "users" ? "rows" : resource === "reports" ? "reports" : "requests"]?.length || 0} shown${hasMore[resource] ? " · more available" : ""}`;
    $(`#${resource}-prev`).disabled = pages[resource] <= 1; $(`#${resource}-next`).disabled = !hasMore[resource];
  }
  async function loadReports() {
    const data = await api(`/api/admin/data?resource=reports&page=${pages.reports}`), body = $("#reports-body"); cache.reports = data.reports || []; body.replaceChildren();
    cache.reports.forEach((item) => {
      const row = document.createElement("tr"), target = item.target_user ? `${item.target_user.display_name || item.target_user.company_name || "Member"} (${item.target_user.account_type || "account"})` : (item.target_project?.project_name || "Deleted project");
      td(row, target); td(row, `${item.reason}: ${item.description}`); td(row, item.reporter?.display_name || item.reporter?.company_name || "Member");
      const statusCell = document.createElement("td"), select = document.createElement("select"); [["pending","Pending"],["reviewing","Reviewing"],["actioned","Actioned"],["dismissed","Dismissed"]].forEach(([value,label]) => { const o=document.createElement("option");o.value=value;o.textContent=label;select.append(o); }); select.value=item.status; statusCell.append(select); row.append(statusCell);
      const action = document.createElement("td"), save = document.createElement("button"); save.className="button secondary"; save.textContent="Save review"; save.onclick=async()=>{const resolution=prompt("Review note (optional):",item.resolution||"");if(resolution===null)return;save.disabled=true;try{await mutate("/api/admin/data",{action:"report",id:item.id,status:select.value,resolution});toast("Report review saved.");await loadReports();await loadOverview();}catch(e){toast(e.message);save.disabled=false;}};action.append(save);row.append(action);body.append(row);
    });
    if (!body.children.length) emptyRow(body,"No reports have been submitted.",5); pager("reports",data);
  }
  async function loadVerification() {
    const data = await api(`/api/admin/data?resource=verification&page=${pages.verification}`), body = $("#verification-body"); cache.verification = data.requests || []; body.replaceChildren();
    cache.verification.forEach((item) => { const row=document.createElement("tr");td(row,item.profile?.display_name||item.profile?.company_name||"Member");td(row,item.profile?.account_type||"—");td(row,item.statement);td(row,date(item.created_at));const cell=document.createElement("td");const select=document.createElement("select");[["pending","Pending"],["approved","Approve"],["rejected","Reject"]].forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;select.append(o);});select.value=item.status;const save=document.createElement("button");save.className="button secondary";save.textContent="Save";save.style.marginTop="5px";save.onclick=async()=>{if(select.value!=="pending"&&!confirm(`${select.value} this profile verification request?`))return;const reviewNote=prompt("Review note (optional):",item.review_note||"");if(reviewNote===null)return;save.disabled=true;try{await mutate("/api/admin/data",{action:"verification",id:item.id,status:select.value,reviewNote});toast("Verification decision saved.");await loadVerification();await loadOverview();}catch(e){toast(e.message);save.disabled=false;}};cell.append(select,document.createElement("br"),save);row.append(cell);body.append(row);});
    if(!body.children.length)emptyRow(body,"No profile verification requests.",5);pager("verification",data);
  }

  async function loadSupport() {
    const data = await api("/api/admin/data?resource=support"), body = $("#support-body"); body.replaceChildren();
    (data.requests || []).forEach((item) => { const row=document.createElement("tr");td(row,item.subject);td(row,item.profile?.display_name||item.profile?.company_name||"Member");const statusCell=document.createElement("td"),status=document.createElement("select");[["open","Open"],["in_progress","In progress"],["resolved","Resolved"]].forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;status.append(o);});status.value=item.status;statusCell.append(status);row.append(statusCell);td(row,item.description);td(row,date(item.created_at));status.onchange=async()=>{status.disabled=true;try{await mutate("/api/admin/data",{action:"support",id:item.id,status:status.value});toast("Support status updated.");await loadOverview();}catch(e){toast(e.message);status.value=item.status;}finally{status.disabled=false;}};body.append(row);});
    if(!body.children.length)emptyRow(body,"No support requests found.",5);
  }
  async function loadAudit() {
    const data = await api("/api/admin/data?resource=audit"), body = $("#audit-body"); body.replaceChildren();
    (data.logs || []).forEach((item) => { const row=document.createElement("tr");td(row,date(item.created_at));td(row,item.action);td(row,`${item.entity_type||"record"} · ${item.entity_id||"—"}`);td(row,JSON.stringify(item.details||{}));body.append(row);});
    if(!body.children.length)emptyRow(body,"No admin actions recorded yet.",4);
  }
  async function loadView(view) {
    activeView=view;document.querySelectorAll(".tabs button").forEach((button)=>button.classList.toggle("active",button.dataset.view===view));document.querySelectorAll("[id^='view-']").forEach((section)=>section.classList.toggle("hidden",section.id!==`view-${view}`));
    if(view==="users")await loadUsers();else if(view==="projects")await loadProjects();else if(view==="applications")await loadApplications();else if(view==="reports")await loadReports();else if(view==="verification")await loadVerification();else if(view==="support")await loadSupport();else if(view==="audit")await loadAudit();
  }
  async function refreshCurrent(showToast = false) {
    if(refreshBusy||document.visibilityState!=="visible"||panel.classList.contains("hidden"))return;refreshBusy=true;
    try{await loadOverview();await loadView(activeView);$("#last-updated").textContent=`Last updated ${new Date().toLocaleTimeString()}. Refreshes every 30 seconds while this page is open.`;notice.classList.add("hidden");if(showToast)toast("Admin data refreshed.");}catch(error){showError(error);}finally{refreshBusy=false;}
  }
  async function authorizeAndShow() {
    const { data: { session } } = await supabase.auth.getSession();
    if(!session){setVisible(login,true);setVisible(panel,false);setVisible($("#sign-out"),false);return;}
    activeAdminId=session.user.id; $("#admin-email").textContent=session.user.email||"Signed in";
    try{await loadOverview();setVisible(login,false);setVisible(panel,true);setVisible($("#sign-out"),true);errorBox.textContent="";notice.classList.add("hidden");await loadView(activeView);$("#last-updated").textContent=`Last updated ${new Date().toLocaleTimeString()}. Refreshes every 30 seconds while this page is open.`;}
    catch(error){setVisible(panel,false);setVisible(login,true);setVisible($("#sign-out"),true);showError(error);}
  }

  try {
    supabase=await window.bmcSupabaseReady;if(!supabase)throw new Error(window.bmcSupabaseError||"Supabase could not start.");
    $("#login-form").addEventListener("submit",async(event)=>{event.preventDefault();errorBox.textContent="";const button=event.currentTarget.querySelector("button[type=submit]");button.disabled=true;button.textContent="Signing in…";try{const{error}=await supabase.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)throw error;await authorizeAndShow();}catch(error){errorBox.textContent=error.message||"Sign in failed.";}finally{button.disabled=false;button.textContent="Sign in securely";}});
    $("#toggle-password").onclick=()=>{const input=$("#password"),show=input.type==="password";input.type=show?"text":"password";$("#toggle-password").textContent=show?"Hide password":"Show password";};
    $("#forgot-password").onclick=async()=>{const email=$("#email").value.trim();if(!email)return errorBox.textContent="Enter your owner email first.";$("#forgot-password").disabled=true;try{const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/site/reset-password.html`});if(error)throw error;errorBox.textContent="If the account exists, a password reset email has been sent.";}catch(error){errorBox.textContent=error.message||"Could not send a reset email.";}finally{$("#forgot-password").disabled=false;}};
    document.querySelectorAll(".tabs button").forEach((button)=>button.addEventListener("click",()=>loadView(button.dataset.view).catch(showError)));
    const userFilterChanged=()=>{pages.users=1;window.clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>loadUsers().catch(showError),220);};
    $("#user-search").addEventListener("input",userFilterChanged);$("#user-type").addEventListener("change",userFilterChanged);$("#user-status").addEventListener("change",userFilterChanged);
    $("[data-search='projects']").addEventListener("input",()=>renderProjects(cache.projects||[]));$("[data-search='applications']").addEventListener("input",()=>renderApplications(cache.applications||[]));
    ["users","reports","verification"].forEach((resource)=>{$(`#${resource}-prev`).onclick=()=>{if(pages[resource]>1){pages[resource]--;loadView(activeView).catch(showError);}};$(`#${resource}-next`).onclick=()=>{if(hasMore[resource]){pages[resource]++;loadView(activeView).catch(showError);}};});
    $("#user-detail-close").onclick=()=>$("#user-detail").close();$("#user-detail").addEventListener("click",(event)=>{if(event.target===$("#user-detail"))$("#user-detail").close();});
    $("#refresh").onclick=()=>refreshCurrent(true);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshCurrent(false);});
    $("#sign-out").onclick=async()=>{if(refreshTimer)clearInterval(refreshTimer);refreshTimer=0;await supabase.auth.signOut();activeAdminId="";cache={};setVisible(panel,false);setVisible(login,true);setVisible($("#sign-out"),false);$("#admin-email").textContent="";errorBox.textContent="";};
    supabase.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"||!session){setVisible(panel,false);setVisible(login,true);setVisible($("#sign-out"),false);}});
    await authorizeAndShow();refreshTimer=window.setInterval(()=>refreshCurrent(false),30_000);
  } catch(error) { showError(error);setVisible(login,true);setVisible(panel,false); }
})();
