import { NextResponse } from "next/server";
import { requireSignedIn, userErrorResponse } from "../_user";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = new Set(["spam", "harassment", "impersonation", "unsafe_content", "fraud", "other"]);

export async function POST(request: Request) {
  try {
    const context = await requireSignedIn(request);
    const body = await request.json();
    const targetUserId = typeof body.targetUserId === "string" && uuid.test(body.targetUserId) ? body.targetUserId : null;
    const targetProjectId = typeof body.targetProjectId === "string" && uuid.test(body.targetProjectId) ? body.targetProjectId : null;
    const reason = typeof body.reason === "string" ? body.reason : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (Boolean(targetUserId) === Boolean(targetProjectId) || targetUserId === context.user.id) return NextResponse.json({ error: "Choose one valid profile or project to report." }, { status: 400 });
    if (!reasons.has(reason) || description.length < 10 || description.length > 2000) return NextResponse.json({ error: "Choose a reason and describe the concern in 10–2,000 characters." }, { status: 400 });
    const response = await fetch(`${context.baseUrl}/rest/v1/content_reports`, {
      method: "POST", headers: { apikey: context.publishableKey, Authorization: context.authorization, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ reporter_id: context.user.id, target_user_id: targetUserId, target_project_id: targetProjectId, reason, description }), cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "Could not submit this report. Please try again." }, { status: response.status === 401 ? 401 : 400 });
    const rows = await response.json();
    return NextResponse.json({ report: rows?.[0] || null }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return userErrorResponse(error); }
}
