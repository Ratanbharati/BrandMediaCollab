import { NextResponse } from "next/server";
import { adminErrorResponse, requirePlatformAdmin, serviceFetch, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    if (!isUuid(body.userId) || typeof body.isDiscoverable !== "boolean") return NextResponse.json({ error: "Choose a valid profile and visibility setting." }, { status: 400 });
    await writeAudit(context, body.isDiscoverable ? "profile.visibility_restored" : "profile.hidden", "profile", body.userId, { is_discoverable: body.isDiscoverable });
    await serviceFetch(context, `/rest/v1/profiles?id=eq.${encodeURIComponent(body.userId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_discoverable: body.isDiscoverable, updated_at: new Date().toISOString() }),
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json();
    if (!isUuid(body.userId) || typeof body.confirmationEmail !== "string") return NextResponse.json({ error: "A valid account ID and exact email confirmation are required." }, { status: 400 });
    if (body.userId === context.user.id) return NextResponse.json({ error: "You can’t delete the admin account you’re currently using." }, { status: 400 });
    const target = await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(body.userId)}`);
    const targetEmail = String(target.email || target.user?.email || "");
    if (!targetEmail || targetEmail.toLowerCase() !== body.confirmationEmail.trim().toLowerCase()) {
      return NextResponse.json({ error: "The confirmation email does not match this account." }, { status: 400 });
    }
    await writeAudit(context, "auth_user.delete_requested", "auth_user", body.userId, { email: targetEmail, display_name: body.displayName || null, note: "Deletion also removes linked profile and user-owned records according to database cascade rules." });
    await serviceFetch(context, `/auth/v1/admin/users/${encodeURIComponent(body.userId)}`, { method: "DELETE" });
    return NextResponse.json({ ok: true, deletedEmail: targetEmail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

