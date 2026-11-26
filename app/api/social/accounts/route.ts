import { requireSignedIn, userErrorResponse } from "../../_user";
import { serviceFetch } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user } = await requireSignedIn(request);
    const response = await serviceFetch("social_oauth_credentials", `select=platform,provider_account_id,metrics,last_synced_at,token_expires_at,social_accounts!inner(id,profile_url,follower_count)&user_id=eq.${encodeURIComponent(user.id)}&order=platform.asc`);
    if (!response.ok) return Response.json({ error: "Could not load connected accounts. Apply the social integration migration first." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const rows = await response.json();
    return Response.json({ accounts: rows.map((row: { platform: string; metrics: Record<string, unknown>; last_synced_at: string | null; token_expires_at: string | null; social_accounts: { profile_url: string; follower_count: number | null } | Array<{ profile_url: string; follower_count: number | null }> }) => {
      const account = Array.isArray(row.social_accounts) ? row.social_accounts[0] : row.social_accounts;
      return { platform: row.platform, profile_url: account?.profile_url || null, follower_count: account?.follower_count ?? null, metrics: row.metrics || {}, last_synced_at: row.last_synced_at, token_expires_at: row.token_expires_at };
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return userErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireSignedIn(request);
    const platform = new URL(request.url).searchParams.get("platform");
    if (platform !== "instagram" && platform !== "youtube") return Response.json({ error: "Choose Instagram or YouTube." }, { status: 400 });
    const lookup = await serviceFetch("social_oauth_credentials", `select=social_account_id&user_id=eq.${encodeURIComponent(user.id)}&platform=eq.${platform}&limit=1`);
    if (!lookup.ok) return Response.json({ error: "Could not disconnect the account." }, { status: 500 });
    const rows = await lookup.json(); const socialId = rows?.[0]?.social_account_id;
    const deletion = await serviceFetch("social_oauth_credentials", `user_id=eq.${encodeURIComponent(user.id)}&platform=eq.${platform}`, { method: "DELETE" });
    if (!deletion.ok) return Response.json({ error: "Could not remove the saved authorization. Please retry." }, { status: 500 });
    if (socialId) {
      const accountDeletion = await serviceFetch("social_accounts", `id=eq.${encodeURIComponent(socialId)}&user_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" });
      if (!accountDeletion.ok) return Response.json({ error: "Authorization was removed, but the profile link could not be removed." }, { status: 500 });
    }
    return Response.json({ disconnected: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return userErrorResponse(error); }
}
