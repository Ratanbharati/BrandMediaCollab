import { NextResponse } from "next/server";

export class UserRouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireSignedIn(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get("authorization") || "";
  if (!baseUrl || !publishableKey) throw new UserRouteError(503, "Account actions are not configured.");
  if (!authorization.toLowerCase().startsWith("bearer ")) throw new UserRouteError(401, "Sign in to continue.");
  const response = await fetch(`${baseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: authorization }, cache: "no-store" });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user.id) throw new UserRouteError(401, "Your session expired. Sign in again.");
  return { baseUrl, publishableKey, authorization, user: { id: String(user.id) } };
}

export function userErrorResponse(error: unknown) {
  if (error instanceof UserRouteError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Account action error:", error);
  return NextResponse.json({ error: "The request could not be completed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
