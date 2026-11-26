import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSignedIn, UserRouteError } from "../_user";

export type SocialProvider = "instagram" | "youtube";
export const providers: SocialProvider[] = ["instagram", "youtube"];
export const oauthCookie = (provider: SocialProvider) => `bmc_oauth_state_${provider}`;
const scopes: Record<SocialProvider, string[]> = {
  instagram: ["instagram_business_basic", "instagram_business_manage_insights"],
  youtube: ["openid", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"]
};

export function providerFrom(value: unknown): SocialProvider | null {
  return typeof value === "string" && providers.includes(value as SocialProvider) ? value as SocialProvider : null;
}

export function callbackUrl(provider: SocialProvider) {
  const configured = process.env.SOCIAL_OAUTH_CALLBACK_BASE_URL?.replace(/\/$/, "");
  const site = process.env.BMC_SITE_URL?.replace(/\/$/, "") || "https://www.brandmediacollab.com";
  return `${configured || site}/api/social/callback/${provider}`;
}

function stateSecret() {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) throw new UserRouteError(503, "Social sign-in is not configured yet. Add the server-side OAuth state secret first.");
  return secret;
}

export async function buildAuthorization(request: Request, provider: SocialProvider) {
  const context = await requireSignedIn(request);
  const nonce = randomBytes(32).toString("base64url");
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ provider, userId: context.user.id, nonce, expires })).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const state = `${payload}.${signature}`;
  const redirectUri = callbackUrl(provider);
  let authorizeUrl: URL;
  if (provider === "instagram") {
    const clientId = process.env.META_INSTAGRAM_APP_ID;
    if (!clientId || !process.env.META_INSTAGRAM_APP_SECRET) throw new UserRouteError(503, "Instagram connection is not configured. Add the Meta app credentials in your hosting settings.");
    authorizeUrl = new URL("https://www.instagram.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", scopes.instagram.join(","));
    authorizeUrl.searchParams.set("state", state);
  } else {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw new UserRouteError(503, "YouTube connection is not configured. Add the Google OAuth credentials in your hosting settings.");
    authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", scopes.youtube.join(" "));
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
  }
  authorizeUrl.searchParams.set("state", state);
  const response = NextResponse.json({ url: authorizeUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(oauthCookie(provider), state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/api/social/callback/${provider}`, maxAge: 600 });
  return response;
}

export function verifyState(state: string, cookie: string | undefined, provider: SocialProvider) {
  if (!state || !cookie || state !== cookie) throw new UserRouteError(400, "The connection request expired or could not be verified. Please try again.");
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) throw new UserRouteError(400, "The connection request could not be verified.");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { throw new UserRouteError(400, "The connection request could not be verified."); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new UserRouteError(400, "The connection request could not be verified.");
  let decoded: { provider: string; userId: string; nonce: string; expires: number };
  try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new UserRouteError(400, "The connection request could not be verified."); }
  if (decoded.provider !== provider || !decoded.userId || decoded.expires < Date.now()) throw new UserRouteError(400, "The connection request expired. Please try again.");
  return decoded;
}

export function encryptToken(value: string) {
  const rawKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "";
  let key: Buffer;
  try { key = Buffer.from(rawKey, "base64"); } catch { key = Buffer.alloc(0); }
  if (key.length !== 32) throw new UserRouteError(503, "Social account storage is not configured. Add a 32-byte base64 encryption key in hosting settings.");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string) {
  const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "", "base64");
  const [ivText, tagText, encryptedText, extra] = value.split(".");
  if (key.length !== 32 || !ivText || !tagText || !encryptedText || extra) throw new UserRouteError(503, "Saved social authorization is unavailable. Reconnect the account or check server configuration.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new UserRouteError(503, "Saved social authorization could not be opened. Reconnect the account."); }
}

export function serviceHeaders(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new UserRouteError(503, "Secure social account storage is not configured. Add the server-only Supabase service key.");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export function databaseUrl(table: string, query = "") {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) throw new UserRouteError(503, "The database connection is not configured.");
  return `${base}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

export async function serviceFetch(table: string, query = "", init: RequestInit = {}) {
  const headers = new Headers(serviceHeaders());
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  return fetch(databaseUrl(table, query), { ...init, headers, cache: "no-store" });
}

export async function saveSocialAccount(userId: string, provider: SocialProvider, profileUrl: string, followerCount: number | null, metrics: Record<string, unknown>, tokenData: { accessToken: string; refreshToken?: string | null; expiresAt?: string | null; providerAccountId: string; scopes: string[] }) {
  const existingResponse = await serviceFetch("social_accounts", `select=id&user_id=eq.${encodeURIComponent(userId)}&platform=eq.${provider}&limit=1`);
  if (!existingResponse.ok) throw new UserRouteError(500, "Could not save the connected profile.");
  const existing = await existingResponse.json() as Array<{ id: string }>;
  let socialId = existing[0]?.id;
  const accountData = { user_id: userId, platform: provider, profile_url: profileUrl, follower_count: followerCount, engagement_rate: null, last_synced_at: new Date().toISOString() };
  const accountResponse = socialId
    ? await serviceFetch("social_accounts", `id=eq.${encodeURIComponent(socialId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(accountData) })
    : await serviceFetch("social_accounts", "", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(accountData) });
  if (!accountResponse.ok) throw new UserRouteError(500, "Could not save the connected profile.");
  const returned = await accountResponse.json().catch(() => []);
  socialId = socialId || returned?.[0]?.id;
  if (!socialId) throw new UserRouteError(500, "The connected profile was saved without an account identifier.");
  const credentialsResponse = await serviceFetch("social_oauth_credentials", "on_conflict=user_id,platform", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: userId, platform: provider, provider_account_id: tokenData.providerAccountId, social_account_id: socialId, access_token_ciphertext: encryptToken(tokenData.accessToken), refresh_token_ciphertext: tokenData.refreshToken ? encryptToken(tokenData.refreshToken) : null, token_expires_at: tokenData.expiresAt || null, granted_scopes: tokenData.scopes, metrics, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  if (!credentialsResponse.ok) throw new UserRouteError(500, "The profile was connected, but its private authorization could not be saved. Please retry the connection.");
}

export function safeRedirect(request: Request, status: string) {
  const base = process.env.BMC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const destination = new URL("/site/settings.html", base);
  destination.searchParams.set("social", status);
  return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
}
