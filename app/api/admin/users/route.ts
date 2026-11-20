import { NextResponse } from "next/server";
import { adminErrorResponse, requirePlatformAdmin, serviceFetch, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!uuid.test(userId)) return json({ error: "Choose a valid account." }, 400);
    if (userId === context.user.id) return json({ error: "You cannot suspend or change the visibility of the owner account you are using." }, 400);

    if (body.action === "visibility") {
      if (typeof body.isDiscoverable !== "boolean") return json({ error: "Choose a valid visibility setting." }, 400);
      const rows = await serviceFetch(context, `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ is_discoverable: body.isDiscoverable, updated_at: new Date().toISOString() }),
      }) as Array<Record<string, unknown>>;
      if (!rows?.length) return json({ error: "Profile not found." }, 404);
      await writeAudit(context, body.isDiscoverable ? "profile.visibility_restored" : "profile.hidden", "profile", userId, { is_discoverable: body.isDiscoverable });
      return json({ ok: true });
    }

    if (body.action !== "suspend" && body.action !== "restore") return json({ error: "Choose a valid account action." }, 400);
    const admins = await serviceFetch(context, `/rest/v1/platform_admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`) as Array<{ user_id: string }>;
    if (admins.length) return json({ error: "Platform administrator accounts cannot be suspended here." }, 403);
    const target = await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(userId)}`) as Record<string, unknown>;
    if (!target.id) return json({ error: "Account not found." }, 404);

    if (body.action === "suspend") {
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
      if (reason.length < 8) return json({ error: "Enter a suspension reason of at least 8 characters." }, 400);
      // Auth ban blocks sign-in/refresh; RLS account_active_gate also blocks still-valid JWTs.
      await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ban_duration: "876000h" }),
      });
      try {
        await serviceFetch(context, "/rest/v1/admin_account_states?on_conflict=user_id", {
          method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ user_id: userId, status: "suspended", reason, changed_by: context.user.id, changed_at: new Date().toISOString() }),
        });
      } catch (error) {
        // Roll the Auth ban back if the database access gate could not be written.
        await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ban_duration: "none" }) }).catch(() => null);
        throw error;
      }
      await writeAudit(context, "account.suspended", "auth_user", userId, { reason });
    } else {
      await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ban_duration: "none" }),
      });
      await serviceFetch(context, `/rest/v1/admin_account_states?user_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ status: "active", reason: null, changed_by: context.user.id, changed_at: new Date().toISOString() }),
      });
      await writeAudit(context, "account.restored", "auth_user", userId, {});
    }
    return json({ ok: true, status: body.action === "suspend" ? "suspended" : "active" });
  } catch (error) { return adminErrorResponse(error); }
}
