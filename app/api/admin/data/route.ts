import { NextResponse } from "next/server";
import { adminErrorResponse, requirePlatformAdmin, serviceFetch, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";

function uuidList(values: string[]) { return `in.(${values.map((value) => encodeURIComponent(value)).join(",")})`; }

async function exactCount(context: Awaited<ReturnType<typeof requirePlatformAdmin>>, table: string, filter = "") {
  const response = await fetch(`${context.baseUrl}/rest/v1/${table}?select=id${filter}`, {
    method: "HEAD", headers: { apikey: context.serviceKey, Authorization: `Bearer ${context.serviceKey}`, Prefer: "count=exact" }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not count ${table}.`);
  return Number(response.headers.get("content-range")?.split("/")[1] || 0);
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const url = new URL(request.url); const resource = url.searchParams.get("resource") || "overview";
    if (resource === "overview") {
      const [users, projects, applications, conversations, support, audit] = await Promise.all([
        exactCount(context, "profiles"), exactCount(context, "projects"), exactCount(context, "applications"),
        exactCount(context, "conversations"), exactCount(context, "support_requests"), exactCount(context, "admin_audit_logs"),
      ]);
      return NextResponse.json({ counts: { users, projects, applications, conversations, support, audit } }, { headers: { "Cache-Control": "no-store" } });
    }

    if (resource === "users") {
      const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page") || 1)));
      const perPage = 50;
      const userPage = await serviceFetch(context, `/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
      const authUsers = userPage.users || [];
      const ids = authUsers.map((user: { id: string }) => user.id);
      const profiles = ids.length ? await serviceFetch(context, `/rest/v1/profiles?id=${uuidList(ids)}&select=id,account_type,display_name,company_name,location,is_discoverable,created_at&order=created_at.desc`) : [];
      const counts = ids.length ? await serviceFetch(context, `/rest/v1/projects?owner_id=${uuidList(ids)}&select=owner_id`) : [];
      const projectsByOwner = (counts as Array<{ owner_id: string }>).reduce((map, row) => { map[row.owner_id] = (map[row.owner_id] || 0) + 1; return map; }, {} as Record<string, number>);
      const profileById = Object.fromEntries((profiles as Array<Record<string, unknown>>).map((profile) => [String(profile.id), profile]));
      const users = authUsers.map((authUser: Record<string, unknown>) => ({ ...authUser, profile: profileById[String(authUser.id)] || null, project_count: projectsByOwner[String(authUser.id)] || 0 }));
      return NextResponse.json({ users, page, perPage, hasMore: authUsers.length === perPage }, { headers: { "Cache-Control": "no-store" } });
    }

    if (resource === "projects") {
      const projects = await serviceFetch(context, "/rest/v1/projects?select=id,owner_id,owner_type,project_type,project_name,category,location,status,created_at&order=created_at.desc&limit=200");
      const ownerIds = [...new Set((projects as Array<{ owner_id: string }>).map((project) => project.owner_id))];
      const profiles = ownerIds.length ? await serviceFetch(context, `/rest/v1/profiles?id=${uuidList(ownerIds)}&select=id,display_name,company_name`) : [];
      const names = Object.fromEntries((profiles as Array<Record<string, unknown>>).map((profile) => [String(profile.id), profile.display_name || profile.company_name || "Member"]));
      return NextResponse.json({ projects: (projects as Array<Record<string, unknown>>).map((project) => ({ ...project, owner_name: names[String(project.owner_id)] })) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (resource === "applications") {
      const applications = await serviceFetch(context, "/rest/v1/applications?select=id,project_id,applicant_id,status,message,created_at&order=created_at.desc&limit=200");
      const projectIds = [...new Set((applications as Array<{ project_id: string }>).map((application) => application.project_id))];
      const applicantIds = [...new Set((applications as Array<{ applicant_id: string }>).map((application) => application.applicant_id))];
      const [projects, profiles] = await Promise.all([
        projectIds.length ? serviceFetch(context, `/rest/v1/projects?id=${uuidList(projectIds)}&select=id,project_name,owner_id`) : [],
        applicantIds.length ? serviceFetch(context, `/rest/v1/profiles?id=${uuidList(applicantIds)}&select=id,display_name,company_name,account_type`) : [],
      ]);
      const projectById = Object.fromEntries((projects as Array<Record<string, unknown>>).map((project) => [String(project.id), project]));
      const profileById = Object.fromEntries((profiles as Array<Record<string, unknown>>).map((profile) => [String(profile.id), profile]));
      return NextResponse.json({ applications: (applications as Array<Record<string, unknown>>).map((application) => ({
        ...application, project_name: projectById[String(application.project_id)]?.project_name || "Deleted project",
        applicant_name: profileById[String(application.applicant_id)]?.display_name || profileById[String(application.applicant_id)]?.company_name || "Member",
        applicant_type: profileById[String(application.applicant_id)]?.account_type || "unknown",
      })) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (resource === "support") {
      const requests = await serviceFetch(context, "/rest/v1/support_requests?select=id,user_id,subject,description,status,created_at,updated_at&order=created_at.desc&limit=200");
      const ids = [...new Set((requests as Array<{ user_id: string }>).map((item) => item.user_id))];
      const profiles = ids.length ? await serviceFetch(context, `/rest/v1/profiles?id=${uuidList(ids)}&select=id,display_name,company_name,account_type`) : [];
      const profileById = Object.fromEntries((profiles as Array<Record<string, unknown>>).map((profile) => [String(profile.id), profile]));
      return NextResponse.json({ requests: (requests as Array<Record<string, unknown>>).map((item) => ({ ...item, profile: profileById[String(item.user_id)] || null })) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (resource === "audit") {
      const logs = await serviceFetch(context, "/rest/v1/admin_audit_logs?select=id,admin_id,action,entity_type,entity_id,details,created_at&order=created_at.desc&limit=200");
      return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ error: "Unknown admin data view." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Choose a valid support request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (!["open", "in_progress", "resolved"].includes(status)) {
      return NextResponse.json({ error: "Choose a valid support status." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const rows = await serviceFetch(context, `/rest/v1/support_requests?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    });
    const updated = Array.isArray(rows) ? rows[0] : null;
    if (!updated) return NextResponse.json({ error: "Support request not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    await writeAudit(context, "support_request.status_updated", "support_request", id, { status });
    return NextResponse.json({ request: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

