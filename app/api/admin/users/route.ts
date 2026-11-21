import { NextResponse } from "next/server";
import { AdminRouteError, adminErrorResponse, requirePlatformAdmin, serviceFetch, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!uuid.test(userId)) return json({ error: "Choose a valid account." }, 400);
    if (userId === context.user.id) return json({ error: "You cannot suspend, change visibility, or delete the owner account you are using." }, 400);

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

type StorageEntry = { name?: string; id?: string | null; metadata?: unknown };

async function listAvatarObjects(context: Awaited<ReturnType<typeof requirePlatformAdmin>>, userId: string) {
  const folders = [userId];
  const visited = new Set<string>();
  const objects = new Set<string>();
  while (folders.length) {
    const folder = folders.pop()!;
    if (visited.has(folder)) continue;
    visited.add(folder);
    let offset = 0;
    while (true) {
      const entries = await serviceFetch(context, "/storage/v1/object/list/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: folder, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      }) as StorageEntry[];
      if (!Array.isArray(entries)) throw new Error("Could not list this account's uploaded avatar files.");
      for (const entry of entries) {
        const name = typeof entry.name === "string" ? entry.name : "";
        if (!name || name === "." || name === "..") continue;
        const path = `${folder}/${name}`;
        if (entry.id == null && entry.metadata == null) folders.push(path);
        else if (path.startsWith(`${userId}/`)) objects.add(path);
      }
      if (entries.length < 1000) break;
      offset += entries.length;
      if (offset > 100000) throw new Error("Too many uploaded files are associated with this account to remove safely.");
    }
  }
  return [...objects];
}

async function removeAvatarObjects(context: Awaited<ReturnType<typeof requirePlatformAdmin>>, paths: string[]) {
  for (let offset = 0; offset < paths.length; offset += 1000) {
    const batch = paths.slice(offset, offset + 1000);
    await serviceFetch(context, "/storage/v1/object/avatars", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: batch }),
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const confirmEmail = typeof body.confirmEmail === "string" ? body.confirmEmail.trim() : "";
    if (!uuid.test(userId)) return json({ error: "Choose a valid account." }, 400);
    if (userId === context.user.id) return json({ error: "You cannot delete the owner account you are signed in with." }, 400);

    const admins = await serviceFetch(context, `/rest/v1/platform_admins?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`) as Array<{ user_id: string }>;
    if (admins.length) return json({ error: "Platform administrator accounts are protected and cannot be deleted here." }, 403);

    const target = await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(userId)}`) as Record<string, unknown>;
    if (!target.id) return json({ error: "Account not found." }, 404);
    const targetEmail = typeof target.email === "string" ? target.email : "";
    if (!targetEmail) return json({ error: "This account has no email address to confirm against." }, 409);
    if (confirmEmail.toLowerCase() !== targetEmail.toLowerCase()) return json({ error: "The confirmation email did not match. The account was not deleted." }, 400);

    const avatarPaths = await listAvatarObjects(context, userId);
    await writeAudit(context, "account.deletion_authorized", "auth_user", userId, { confirmed_by_email: true, avatar_files_to_remove: avatarPaths.length });
    await removeAvatarObjects(context, avatarPaths);

    try {
      await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    } catch {
      throw new AdminRouteError(502, "Uploaded avatar files were removed, but Supabase could not delete the account. The account may still exist; refresh the list and retry after resolving the Auth or Storage error.");
    }

    let auditWarning = false;
    try { await writeAudit(context, "account.deleted", "auth_user", userId, { avatar_files_removed: avatarPaths.length }); }
    catch (error) { auditWarning = true; console.error("Account deleted, but completion audit could not be written:", error); }
    return json({ ok: true, auditWarning });
  } catch (error) { return adminErrorResponse(error); }
}
