import { NextRequest } from "next/server";
import { userErrorResponse, UserRouteError } from "../../../_user";
import { callbackUrl, providerFrom, safeRedirect, saveSocialAccount, verifyState, oauthCookie } from "../../_shared";

export const dynamic = "force-dynamic";

type TokenResult = { access_token: string; refresh_token?: string; expires_in?: number; user_id?: number | string; scope?: string };
const expiresAt = (seconds?: number) => seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;

async function instagramSnapshot(token: string) {
  const meUrl = new URL("https://graph.instagram.com/me");
  meUrl.searchParams.set("fields", "id,user_id,username,account_type,followers_count");
  meUrl.searchParams.set("access_token", token);
  const meResponse = await fetch(meUrl, { cache: "no-store" });
  const me = await meResponse.json().catch(() => ({}));
  if (!meResponse.ok || !(me.user_id || me.id) || !me.username) throw new UserRouteError(400, "Instagram did not return the authorized professional profile. Check that this is a Creator or Business account and try again.");
  const accountId = String(me.user_id || me.id);
  const insightUrl = new URL(`https://graph.instagram.com/${encodeURIComponent(accountId)}/insights`);
  insightUrl.searchParams.set("metric", "reach,total_interactions,accounts_engaged");
  insightUrl.searchParams.set("period", "day");
  insightUrl.searchParams.set("access_token", token);
  const insightResponse = await fetch(insightUrl, { cache: "no-store" });
  const insightJson = await insightResponse.json().catch(() => ({}));
  const insights: Record<string, number | null> = {};
  for (const metric of insightJson.data || []) {
    const raw = metric.values?.at?.(-1)?.value ?? metric.value ?? null;
    insights[metric.name] = Number.isFinite(Number(raw)) ? Number(raw) : null;
  }
  return { accountId, profileUrl: `https://www.instagram.com/${encodeURIComponent(me.username)}/`, followerCount: Number.isFinite(Number(me.followers_count)) ? Number(me.followers_count) : null, metrics: { username: me.username, account_type: me.account_type || "professional", follower_count: Number.isFinite(Number(me.followers_count)) ? Number(me.followers_count) : null, insights, insights_available: insightResponse.ok, insights_updated_at: insightResponse.ok ? new Date().toISOString() : null } };
}

async function youtubeSnapshot(accessToken: string) {
  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelUrl.searchParams.set("part", "snippet,statistics"); channelUrl.searchParams.set("mine", "true");
  const channelResponse = await fetch(channelUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const channelJson = await channelResponse.json().catch(() => ({}));
  const channel = channelJson.items?.[0];
  if (!channelResponse.ok || !channel?.id) throw new UserRouteError(400, "Google did not return a YouTube channel for this account. Sign in with the Google account that owns the channel.");
  const today = new Date(); const end = new Date(today); end.setDate(end.getDate() - 2); const start = new Date(end); start.setDate(start.getDate() - 27);
  const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
  const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  analyticsUrl.searchParams.set("ids", "channel==MINE"); analyticsUrl.searchParams.set("startDate", dateOnly(start)); analyticsUrl.searchParams.set("endDate", dateOnly(end)); analyticsUrl.searchParams.set("metrics", "views,likes,comments,subscribersGained,subscribersLost");
  const analyticsResponse = await fetch(analyticsUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const analyticsJson = await analyticsResponse.json().catch(() => ({}));
  const analytics: Record<string, unknown> = {};
  if (analyticsResponse.ok && analyticsJson.columnHeaders && analyticsJson.rows?.[0]) analyticsJson.columnHeaders.forEach((column: { name: string }, index: number) => { analytics[column.name] = analyticsJson.rows[0][index]; });
  const handle = channel.snippet?.customUrl || channel.id;
  const followerCount = channel.statistics?.hiddenSubscriberCount ? null : Number(channel.statistics?.subscriberCount);
  return { accountId: String(channel.id), profileUrl: `https://www.youtube.com/${String(handle).startsWith("@") ? handle : `channel/${channel.id}`}`, followerCount: Number.isFinite(followerCount) ? followerCount : null, metrics: { channel_id: channel.id, title: channel.snippet?.title || "YouTube channel", subscriber_count: Number.isFinite(followerCount) ? followerCount : null, lifetime_views: Number.isFinite(Number(channel.statistics?.viewCount)) ? Number(channel.statistics.viewCount) : null, analytics_28_days: analytics, analytics_available: analyticsResponse.ok, analytics_updated_at: analyticsResponse.ok ? new Date().toISOString() : null } };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params;
  const provider = providerFrom(rawProvider);
  const redirect = (status: string) => {
    const response = safeRedirect(request, status);
    if (provider) response.cookies.set(oauthCookie(provider), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/api/social/callback/${provider}`, maxAge: 0 });
    return response;
  };
  if (!provider) return redirect("error");
  try {
    const url = new URL(request.url);
    if (url.searchParams.has("error")) return redirect(`${provider}_cancelled`);
    const code = url.searchParams.get("code") || ""; const state = url.searchParams.get("state") || "";
    const stateData = verifyState(state, request.cookies.get(oauthCookie(provider))?.value, provider);
    if (!code || code.length > 4096) throw new UserRouteError(400, "The social platform did not return a valid authorization code.");
    const body = new URLSearchParams();
    if (provider === "instagram") {
      body.set("client_id", process.env.META_INSTAGRAM_APP_ID || ""); body.set("client_secret", process.env.META_INSTAGRAM_APP_SECRET || "");
      body.set("grant_type", "authorization_code"); body.set("redirect_uri", callbackUrl(provider)); body.set("code", code);
    } else {
      body.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID || ""); body.set("client_secret", process.env.GOOGLE_OAUTH_CLIENT_SECRET || "");
      body.set("grant_type", "authorization_code"); body.set("redirect_uri", callbackUrl(provider)); body.set("code", code);
    }
    const tokenResponse = await fetch(provider === "instagram" ? "https://api.instagram.com/oauth/access_token" : "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const token = await tokenResponse.json().catch(() => ({})) as TokenResult;
    if (!tokenResponse.ok || !token.access_token) throw new UserRouteError(400, "The social platform could not complete account authorization. Check the app review, redirect URL, requested permissions, and account type.");

    let accessToken = token.access_token; let refreshToken = token.refresh_token || null; let expiration = expiresAt(token.expires_in); let snapshot;
    if (provider === "instagram") {
      const longUrl = new URL("https://graph.instagram.com/access_token"); longUrl.searchParams.set("grant_type", "ig_exchange");
      longUrl.searchParams.set("client_secret", process.env.META_INSTAGRAM_APP_SECRET || ""); longUrl.searchParams.set("access_token", accessToken);
      const longResponse = await fetch(longUrl, { cache: "no-store" }); const longToken = await longResponse.json().catch(() => ({}));
      if (!longResponse.ok || !longToken.access_token) throw new UserRouteError(400, "Instagram authorization succeeded, but a long-lived token could not be issued.");
      accessToken = longToken.access_token; expiration = expiresAt(longToken.expires_in); snapshot = await instagramSnapshot(accessToken);
    } else snapshot = await youtubeSnapshot(accessToken);

    await saveSocialAccount(stateData.userId, provider, snapshot.profileUrl, snapshot.followerCount, snapshot.metrics, { accessToken, refreshToken, expiresAt: expiration, providerAccountId: snapshot.accountId, scopes: provider === "instagram" ? ["instagram_business_basic", "instagram_business_manage_insights"] : ["youtube.readonly", "yt-analytics.readonly"] });
    return redirect(`connected_${provider}`);
  } catch (error) {
    console.error(`Social OAuth callback (${provider}) failed:`, error);
    const response = safeRedirect(request, `error_${provider}`); response.cookies.delete(oauthCookie(provider)); return response;
  }
}
