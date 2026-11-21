import { NextResponse } from "next/server";
import { adminErrorResponse, requirePlatformAdmin, serviceFetch, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles = new Set(["creator", "brand", "agency", "celebrity", "event", "media", "community", "distributor", "freelancer"]);
const reportStatuses = new Set(["pending", "reviewing", "actioned", "dismissed"]);
const verificationStatuses = new Set(["approved", "rejected"]);
const projectStatuses = new Set(["normal", "review", "hidden", "removed"]);
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function paged(context: Awaited<ReturnType<typeof requirePlatformAdmin>>, table: string, params: URLSearchParams) {
  const page = Math.max(1, Math.min(10000, Number(params.get("page") || 1)));
  const perPage = 50;
  const query = new URLSearchParams(params);
  query.delete("page");
  query.set("limit", String(perPage + 1));
  query.set("offset", String((page - 1) * perPage));
  const rows = await serviceFetch(context, `/rest/v1/${table}?${query.toString()}`) as Array<Record<string, unknown>>;
  const hasMore = rows.length > perPage;
  return { rows: rows.slice(0, perPage), page, perPage, hasMore };
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const resource = params.get("resource") || "overview";
    if (resource === "overview") {
      const [metrics] = await serviceFetch(context, "/rest/v1/admin_dashboard_metrics?select=*&limit=1") as Array<Record<string, unknown>>;
      return json({ counts: metrics || {} });
    }
    if (resource === "users") {
      const query = new URLSearchParams({ select: "id,email,created_at,last_sign_in_at,email_confirmed_at,account_type,display_name,company_name,location,is_discoverable,onboarding_completed,is_verified,profile_completion,project_count,account_status" });
      const search = (params.get("q") || "").trim().replace(/[(),*%_\\]/g, " ").slice(0, 80);
      const type = params.get("type") || "";
      const status = params.get("status") || "";
      if (search) query.set("or", `(email.ilike.*${search}*,display_name.ilike.*${search}*,company_name.ilike.*${search}*)`);
      if (roles.has(type)) query.set("account_type", `eq.${type}`);
      if (["active", "suspended"].includes(status)) query.set("account_status", `eq.${status}`);
      query.set("order", "created_at.desc");
      return json(await paged(context, "admin_user_directory", query));
    }
    if (resource === "user") {
      const id = params.get("id") || "";
      if (!uuid.test(id)) return json({ error: "Choose a valid account." }, 400);
      const rows = await serviceFetch(context, `/rest/v1/admin_user_directory?select=id,email,created_at,last_sign_in_at,email_confirmed_at,account_type,display_name,company_name,location,is_discoverable,onboarding_completed,is_verified,profile_completion,bio,avatar_url,project_count,account_status&id=eq.${encodeURIComponent(id)}&limit=1`) as Array<Record<string, unknown>>;
      return rows[0] ? json({ user: rows[0] }) : json({ error: "Account not found." }, 404);
    }
    if (resource === "projects") {
      const rows = await serviceFetch(context, "/rest/v1/projects?select=id,owner_id,owner_type,project_type,project_name,category,location,status,moderation_status,moderation_reason,created_at&order=created_at.desc&limit=200") as Array<Record<string, unknown>>;
      const ownerIds = [...new Set(rows.map((item) => String(item.owner_id)))];
      const profiles = ownerIds.length ? await serviceFetch(context, `/rest/v1/profiles?id=in.(${ownerIds.map(encodeURIComponent).join(",")})&select=id,display_name,company_name`) as Array<Record<string, unknown>> : [];
      const names = Object.fromEntries(profiles.map((p) => [String(p.id), p.display_name || p.company_name || "Member"]));
      return json({ projects: rows.map((item) => ({ ...item, owner_name: names[String(item.owner_id)] || "Member" })) });
    }
    if (resource === "applications") {
      // Application notes can contain private conversation-like text. Admin metrics need no note body.
      const applications = await serviceFetch(context, "/rest/v1/applications?select=id,project_id,applicant_id,status,created_at&order=created_at.desc&limit=200") as Array<Record<string, unknown>>;
      const projectIds = [...new Set(applications.map((item) => String(item.project_id)))];
      const applicantIds = [...new Set(applications.map((item) => String(item.applicant_id)))];
      const [projects, profiles] = await Promise.all([
        projectIds.length ? serviceFetch(context, `/rest/v1/projects?id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=id,project_name`) as Promise<Array<Record<string, unknown>>> : [],
        applicantIds.length ? serviceFetch(context, `/rest/v1/profiles?id=in.(${applicantIds.map(encodeURIComponent).join(",")})&select=id,display_name,company_name,account_type`) as Promise<Array<Record<string, unknown>>> : [],
      ]);
      const projectById = Object.fromEntries(projects.map((p) => [String(p.id), p]));
      const profileById = Object.fromEntries(profiles.map((p) => [String(p.id), p]));
      return json({ applications: applications.map((item) => ({ id: item.id, project_id: item.project_id,
        project_name: projectById[String(item.project_id)]?.project_name || "Deleted project", status: item.status,
        applicant_name: profileById[String(item.applicant_id)]?.display_name || profileById[String(item.applicant_id)]?.company_name || "Member",
        applicant_type: profileById[String(item.applicant_id)]?.account_type || "unknown", created_at: item.created_at })) });
    }
    if (resource === "reports") {
      const page = await paged(context, "content_reports", new URLSearchParams({ page: params.get("page") || "1", select: "id,reporter_id,target_user_id,target_project_id,reason,description,status,resolution,created_at,reviewed_at", order: "created_at.desc" }));
      const userIds = [...new Set(page.rows.flatMap((item) => [item.reporter_id, item.target_user_id]).filter(Boolean).map(String))];
      const projectIds = [...new Set(page.rows.map((item) => item.target_project_id).filter(Boolean).map(String))];
      const [profiles, projects] = await Promise.all([
        userIds.length ? serviceFetch(context, `/rest/v1/profiles?id=in.(${userIds.map(encodeURIComponent).join(",")})&select=id,display_name,company_name,account_type`) as Promise<Array<Record<string, unknown>>> : [],
        projectIds.length ? serviceFetch(context, `/rest/v1/projects?id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=id,project_name`) as Promise<Array<Record<string, unknown>>> : [],
      ]);
      const profileById = Object.fromEntries(profiles.map((p) => [String(p.id), p]));
      const projectById = Object.fromEntries(projects.map((p) => [String(p.id), p]));
      return json({ ...page, reports: page.rows.map((item) => ({ ...item,
        reporter: profileById[String(item.reporter_id)] || null,
        target_user: item.target_user_id ? profileById[String(item.target_user_id)] || null : null,
        target_project: item.target_project_id ? projectById[String(item.target_project_id)] || null : null,
      })) });
    }
    if (resource === "verification") {
      const page = await paged(context, "verification_requests", new URLSearchParams({ page: params.get("page") || "1", select: "id,user_id,statement,status,review_note,created_at,reviewed_at", order: "created_at.desc" }));
      const ids = [...new Set(page.rows.map((item) => String(item.user_id)))];
      const profiles = ids.length ? await serviceFetch(context, `/rest/v1/profiles?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,display_name,company_name,account_type,is_verified`) as Array<Record<string, unknown>> : [];
      const byId = Object.fromEntries(profiles.map((p) => [String(p.id), p]));
      return json({ ...page, requests: page.rows.map((item) => ({ ...item, profile: byId[String(item.user_id)] || null })) });
    }
    if (resource === "support") {
      const requests = await serviceFetch(context, "/rest/v1/support_requests?select=id,user_id,subject,description,status,created_at,updated_at&order=created_at.desc&limit=200") as Array<Record<string, unknown>>;
      const ids = [...new Set(requests.map((item) => String(item.user_id)))];
      const profiles = ids.length ? await serviceFetch(context, `/rest/v1/profiles?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,display_name,company_name,account_type`) as Array<Record<string, unknown>> : [];
      const profileById = Object.fromEntries(profiles.map((p) => [String(p.id), p]));
      return json({ requests: requests.map((item) => ({ ...item, profile: profileById[String(item.user_id)] || null })) });
    }
    if (resource === "audit") {
      const logs = await serviceFetch(context, "/rest/v1/admin_audit_logs?select=id,admin_id,action,entity_type,entity_id,details,created_at&order=created_at.desc&limit=200");
      return json({ logs });
    }
    return json({ error: "Unknown admin data view." }, 400);
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const action = typeof body.action === "string" ? body.action : "support";
    if (!uuid.test(id)) return json({ error: "Choose a valid record." }, 400);

    if (action === "support") {
      if (!["open", "in_progress", "resolved"].includes(body.status)) return json({ error: "Choose a valid support status." }, 400);
      const rows = await serviceFetch(context, `/rest/v1/support_requests?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() }) }) as Array<Record<string, unknown>>;
      if (!rows?.length) return json({ error: "Support request not found." }, 404);
      await writeAudit(context, "support_request.status_updated", "support_request", id, { status: body.status });
      return json({ request: rows[0] });
    }

    if (action === "report") {
      if (!reportStatuses.has(body.status) || (body.resolution != null && (typeof body.resolution !== "string" || body.resolution.length > 1000))) return json({ error: "Choose a valid report decision." }, 400);
      const rows = await serviceFetch(context, `/rest/v1/content_reports?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status: body.status, resolution: body.resolution || null, reviewed_by: context.user.id, reviewed_at: new Date().toISOString() }) }) as Array<Record<string, unknown>>;
      if (!rows?.length) return json({ error: "Report not found." }, 404);
      await writeAudit(context, "content_report.reviewed", "content_report", id, { status: body.status });
      return json({ report: rows[0] });
    }

    if (action === "verification") {
      if (!verificationStatuses.has(body.status) || (body.reviewNote != null && (typeof body.reviewNote !== "string" || body.reviewNote.length > 1000))) return json({ error: "Choose a valid verification decision." }, 400);
      const rows = await serviceFetch(context, `/rest/v1/verification_requests?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status: body.status, review_note: body.reviewNote || null, reviewed_by: context.user.id, reviewed_at: new Date().toISOString() }) }) as Array<Record<string, unknown>>;
      if (!rows?.length) return json({ error: "Verification request not found." }, 404);
      const userId = String(rows[0].user_id);
      await serviceFetch(context, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ is_verified: body.status === "approved", updated_at: new Date().toISOString() }) });
      await writeAudit(context, "profile.verification_reviewed", "verification_request", id, { user_id: userId, status: body.status });
      return json({ request: rows[0] });
    }

    if (action === "project") {
      if (!projectStatuses.has(body.status) || (body.reason != null && (typeof body.reason !== "string" || body.reason.length > 1000))) return json({ error: "Choose a valid moderation status." }, 400);
      const rows = await serviceFetch(context, `/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ moderation_status: body.status, moderation_reason: body.reason || null, moderated_by: context.user.id, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }) as Array<Record<string, unknown>>;
      if (!rows?.length) return json({ error: "Project not found." }, 404);
      await writeAudit(context, "project.moderation_updated", "project", id, { status: body.status });
      return json({ project: rows[0] });
    }
    return json({ error: "Unknown admin action." }, 400);
  } catch (error) { return adminErrorResponse(error); }
}
