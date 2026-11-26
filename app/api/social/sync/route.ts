import { requireSignedIn, userErrorResponse, UserRouteError } from "../../_user";
import { decryptToken, saveSocialAccount, serviceFetch, SocialProvider } from "../_shared";

export const dynamic = "force-dynamic";

async function readCredential(userId: string, platform: SocialProvider) {
  const response = await serviceFetch("social_oauth_credentials", `select=*&user_id=eq.${encodeURIComponent(userId)}&platform=eq.${platform}&limit=1`);
  if (!response.ok) throw new UserRouteError(500, "Could not load the private social connection.");
  const rows = await response.json();
  if (!rows?.[0]) throw new UserRouteError(404, "Connect this account first.");
  return rows[0];
}

async function youtubeAccess(credential: Record<string, string | null>) {
  let accessToken = decryptToken(String(credential.access_token_ciphertext));
  const expiry = credential.token_expires_at ? Date.parse(String(credential.token_expires_at)) : 0;
  let refreshToken = credential.refresh_token_ciphertext ? decryptToken(String(credential.refresh_token_ciphertext)) : null;
  let tokenExpiry = credential.token_expires_at;
  if (expiry && expiry < Date.now() + 60_000) {
    if (!refreshToken) throw new UserRouteError(401, "Your Google authorization expired. Reconnect YouTube to refresh the channel data.");
    const refresh = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "", client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "", grant_type: "refresh_token", refresh_token: refreshToken }), cache: "no-store" });
    const result = await refresh.json().catch(() => ({}));
    if (!refresh.ok || !result.access_token) throw new UserRouteError(401, "Google authorization needs to be renewed. Reconnect YouTube.");
    accessToken = result.access_token; tokenExpiry = result.expires_in ? new Date(Date.now() + result.expires_in * 1000).toISOString() : null;
  }
  return { accessToken, refreshToken, tokenExpiry };
}

async function snapshot(provider: SocialProvider, accessToken: string) {
  if (provider === "instagram") {
    const meUrl = new URL("https://graph.instagram.com/me"); meUrl.searchParams.set("fields", "id,user_id,username,account_type,followers_count"); meUrl.searchParams.set("access_token", accessToken);
    const meResponse = await fetch(meUrl, { cache: "no-store" }); const me = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok || !(me.user_id || me.id) || !me.username) throw new UserRouteError(401, "Instagram authorization expired or the account is no longer available. Reconnect Instagram.");
    const accountId = String(me.user_id || me.id); const insightUrl = new URL(`https://graph.instagram.com/${encodeURIComponent(accountId)}/insights`);
    insightUrl.searchParams.set("metric", "reach,total_interactions,accounts_engaged"); insightUrl.searchParams.set("period", "day"); insightUrl.searchParams.set("access_token", accessToken);
    const insightResponse = await fetch(insightUrl, { cache: "no-store" }); const insight = await insightResponse.json().catch(() => ({}));
    const insights: Record<string, number | null> = {};
    for (const item of insight.data || []) { const raw = item.values?.at?.(-1)?.value ?? item.value ?? null; insights[item.name] = Number.isFinite(Number(raw)) ? Number(raw) : null; }
    const followerCount = Number.isFinite(Number(me.followers_count)) ? Number(me.followers_count) : null;
    return { accountId, profileUrl: `https://www.instagram.com/${encodeURIComponent(me.username)}/`, followerCount, metrics: { username: me.username, account_type: me.account_type || "professional", follower_count: followerCount, insights, insights_available: insightResponse.ok, insights_updated_at: insightResponse.ok ? new Date().toISOString() : null } };
  }
  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels"); channelUrl.searchParams.set("part", "snippet,statistics"); channelUrl.searchParams.set("mine", "true");
  const channelResponse = await fetch(channelUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }); const channelJson = await channelResponse.json().catch(() => ({})); const channel = channelJson.items?.[0];
  if (!channelResponse.ok || !channel?.id) throw new UserRouteError(401, "Google authorization expired or no YouTube channel was found. Reconnect with the channel owner account.");
  const end = new Date(); end.setDate(end.getDate() - 2); const start = new Date(end); start.setDate(start.getDate() - 27); const day = (d: Date) => d.toISOString().slice(0, 10);
  const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports"); analyticsUrl.searchParams.set("ids", "channel==MINE"); analyticsUrl.searchParams.set("startDate", day(start)); analyticsUrl.searchParams.set("endDate", day(end)); analyticsUrl.searchParams.set("metrics", "views,likes,comments,subscribersGained,subscribersLost");
  const analyticsResponse = await fetch(analyticsUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }); const analyticsJson = await analyticsResponse.json().catch(() => ({})); const analytics: Record<string, unknown> = {};
  if (analyticsResponse.ok && analyticsJson.columnHeaders && analyticsJson.rows?.[0]) analyticsJson.columnHeaders.forEach((column: { name: string }, index: number) => { analytics[column.name] = analyticsJson.rows[0][index]; });
  const followers = channel.statistics?.hiddenSubscriberCount ? null : Number(channel.statistics?.subscriberCount); const followerCount = Number.isFinite(followers) ? followers : null;
  const handle = channel.snippet?.customUrl || channel.id;
  return { accountId: String(channel.id), profileUrl: `https://www.youtube.com/${String(handle).startsWith("@") ? handle : `channel/${channel.id}`}`, followerCount, metrics: { channel_id: channel.id, title: channel.snippet?.title || "YouTube channel", subscriber_count: followerCount, lifetime_views: Number.isFinite(Number(channel.statistics?.viewCount)) ? Number(channel.statistics.viewCount) : null, analytics_28_days: analytics, analytics_available: analyticsResponse.ok, analytics_updated_at: analyticsResponse.ok ? new Date().toISOString() : null } };
}

export async function POST(request: Request) {
  try {
    const { user } = await requireSignedIn(request); const body = await request.json().catch(() => ({}));
    const provider = body.provider === "instagram" || body.provider === "youtube" ? body.provider as SocialProvider : null;
    if (!provider) return Response.json({ error: "Choose Instagram or YouTube." }, { status: 400 });
    const credential = await readCredential(user.id, provider);
    if (credential.last_synced_at && Date.now() - Date.parse(credential.last_synced_at) < 60_000) return Response.json({ error: "Please wait a minute before refreshing these insights again." }, { status: 429 });
    let accessToken: string; let refreshToken: string | null; let tokenExpiry: string | null;
    if (provider === "youtube") ({ accessToken, refreshToken, tokenExpiry } = await youtubeAccess(credential));
    else { accessToken = decryptToken(credential.access_token_ciphertext); refreshToken = null; tokenExpiry = credential.token_expires_at; }
    if (provider === "instagram" && tokenExpiry && Date.parse(tokenExpiry) < Date.now() + 5 * 24 * 60 * 60 * 1000) {
      const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token"); refreshUrl.searchParams.set("grant_type", "ig_refresh_token"); refreshUrl.searchParams.set("access_token", accessToken);
      const refreshed = await fetch(refreshUrl, { cache: "no-store" }); const result = await refreshed.json().catch(() => ({}));
      if (refreshed.ok && result.access_token) { accessToken = result.access_token; tokenExpiry = result.expires_in ? new Date(Date.now() + result.expires_in * 1000).toISOString() : tokenExpiry; }
    }
    const data = await snapshot(provider, accessToken);
    await saveSocialAccount(user.id, provider, data.profileUrl, data.followerCount, data.metrics, { accessToken, refreshToken, expiresAt: tokenExpiry, providerAccountId: data.accountId, scopes: provider === "instagram" ? ["instagram_business_basic", "instagram_business_manage_insights"] : ["youtube.readonly", "yt-analytics.readonly"] });
    return Response.json({ account: { platform: provider, profile_url: data.profileUrl, follower_count: data.followerCount, metrics: data.metrics, last_synced_at: new Date().toISOString() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return userErrorResponse(error); }
}
