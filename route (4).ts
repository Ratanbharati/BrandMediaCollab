import { NextResponse } from "next/server";
import { requireSignedIn, userErrorResponse } from "../_user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireSignedIn(request);
    const response = await fetch(`${context.baseUrl}/rest/v1/verification_requests?select=id,status,statement,review_note,created_at,reviewed_at&user_id=eq.${encodeURIComponent(context.user.id)}&order=created_at.desc&limit=20`, {
      headers: { apikey: context.publishableKey, Authorization: context.authorization }, cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load verification status.");
    return NextResponse.json({ requests: await response.json() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return userErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireSignedIn(request);
    const body = await request.json();
    const statement = typeof body.statement === "string" ? body.statement.trim() : "";
    if (statement.length < 20 || statement.length > 2000) return NextResponse.json({ error: "Please provide 20–2,000 characters about why your profile should be verified." }, { status: 400 });
    const response = await fetch(`${context.baseUrl}/rest/v1/verification_requests`, {
      method: "POST", headers: { apikey: context.publishableKey, Authorization: context.authorization, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: context.user.id, statement }), cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 409) return NextResponse.json({ error: "You already have a pending verification request." }, { status: 409 });
      return NextResponse.json({ error: "Could not submit this request. Please try again." }, { status: response.status === 401 ? 401 : 400 });
    }
    const rows = await response.json();
    return NextResponse.json({ request: rows?.[0] || null }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return userErrorResponse(error); }
}
