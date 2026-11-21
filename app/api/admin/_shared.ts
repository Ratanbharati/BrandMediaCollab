import { NextResponse } from "next/server";

type AdminContext = { baseUrl: string; serviceKey: string; user: { id: string; email?: string } };

export class AdminRouteError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function config() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !publishableKey || !serviceKey) {
    throw new AdminRouteError(503, "Admin access is not configured. Set the Supabase URL, publishable key, and server-only service-role key in Vercel.");
  }
  return { baseUrl, publishableKey, serviceKey };
}

export async function requirePlatformAdmin(request: Request): Promise<AdminContext> {
  const { baseUrl, publishableKey, serviceKey } = config();
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) throw new AdminRouteError(401, "Sign in with your Brand Media Collab owner account first.");

  const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization }, cache: "no-store",
  });
  const user = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok || !user.id) throw new AdminRouteError(401, "Your sign-in has expired. Sign in again.");

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const membershipResponse = await fetch(`${baseUrl}/rest/v1/platform_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`, { headers, cache: "no-store" });
  if (!membershipResponse.ok) throw new AdminRouteError(503, "Could not check the platform-admin membership table.");
  const members = await membershipResponse.json();
  if (members.length) return { baseUrl, serviceKey, user: { id: user.id, email: user.email } };

  // First-owner bootstrap: only the configured, verified owner email can be
  // added, and only while the platform-admin table has no members.
  const configuredOwner = process.env.STAGERANG_ADMIN_EMAIL?.trim().toLowerCase();
  const verified = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!configuredOwner || !verified || String(user.email || "").toLowerCase() !== configuredOwner) {
    throw new AdminRouteError(403, "This account is not a platform admin. Sign in with the owner account configured for this deployment.");
  }
  const anyAdminResponse = await fetch(`${baseUrl}/rest/v1/platform_admins?select=user_id&limit=1`, { headers, cache: "no-store" });
  if (!anyAdminResponse.ok) throw new AdminRouteError(503, "Could not check platform-admin setup.");
  const anyAdmins = await anyAdminResponse.json();
  if (anyAdmins.length) throw new AdminRouteError(403, "An admin already exists. Ask an existing platform admin to grant access.");
  const bootstrapResponse = await fetch(`${baseUrl}/rest/v1/platform_admins`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: user.id }), cache: "no-store",
  });
  if (!bootstrapResponse.ok) throw new AdminRouteError(503, "Could not initialize the first platform admin.");
  return { baseUrl, serviceKey, user: { id: user.id, email: user.email } };
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminRouteError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Admin API error:", error);
  return NextResponse.json({ error: "The admin request could not be completed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function serviceFetch(context: AdminContext, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", context.serviceKey);
  headers.set("Authorization", `Bearer ${context.serviceKey}`);
  const response = await fetch(`${context.baseUrl}${path}`, {
    ...init, cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new AdminRouteError(response.status === 404 ? 404 : 502, detail.slice(0, 500) || "Supabase returned an error.");
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function writeAudit(context: AdminContext, action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  await serviceFetch(context, "/rest/v1/admin_audit_logs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ admin_id: context.user.id, action, entity_type: entityType, entity_id: entityId, details }),
  });
}

