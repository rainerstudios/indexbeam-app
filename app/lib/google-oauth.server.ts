import crypto from "node:crypto";
import { encrypt, decrypt } from "./encryption.server";
import prisma from "../db.server";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/analytics.readonly",
  "openid",
  "email",
].join(" ");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

function getClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not configured");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) throw new Error("SHOPIFY_APP_URL not configured");
  return `${appUrl}/auth/google/callback`;
}

function getHmacKey(): string {
  const key = process.env.SHOPIFY_API_SECRET;
  if (!key) throw new Error("SHOPIFY_API_SECRET not configured");
  return key;
}

/**
 * Build the Google OAuth authorization URL with HMAC-signed state.
 */
export function buildGoogleAuthUrl(shopDomain: string): string {
  const nonce = crypto.randomUUID();
  const statePayload = JSON.stringify({ shop: shopDomain, nonce });
  const hmac = crypto
    .createHmac("sha256", getHmacKey())
    .update(statePayload)
    .digest("hex");
  const state = Buffer.from(JSON.stringify({ payload: statePayload, hmac })).toString("base64url");

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Verify HMAC signature on state param. Returns the shop domain.
 */
export function verifyState(stateParam: string): string {
  const decoded = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  const { payload, hmac } = decoded;

  const expectedHmac = crypto
    .createHmac("sha256", getHmacKey())
    .update(payload)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expectedHmac, "hex"))) {
    throw new Error("Invalid state signature");
  }

  const { shop } = JSON.parse(payload);
  return shop;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Refresh an expired access token using the encrypted refresh token.
 */
export async function refreshAccessToken(encryptedRefreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const refreshToken = decrypt(encryptedRefreshToken);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Main entry point: get a valid Google access token for a store.
 * Auto-refreshes if expired (with 5-minute buffer).
 * Returns null if no OAuth tokens are stored.
 */
export async function getGoogleAccessToken(storeId: string): Promise<string | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiresAt: true,
    },
  });

  if (!store?.googleRefreshToken) return null;

  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const expiresAt = store.googleTokenExpiresAt;

  // If token exists and not expired (with buffer), return it
  if (store.googleAccessToken && expiresAt && expiresAt.getTime() - bufferMs > now.getTime()) {
    return decrypt(store.googleAccessToken);
  }

  // Refresh the token
  try {
    const refreshed = await refreshAccessToken(store.googleRefreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await prisma.store.update({
      where: { id: storeId },
      data: {
        googleAccessToken: encrypt(refreshed.access_token),
        googleTokenExpiresAt: newExpiresAt,
      },
    });

    return refreshed.access_token;
  } catch (error) {
    console.error("Failed to refresh Google access token:", error);
    return null;
  }
}

/**
 * Fetch the authenticated user's email from Google.
 */
export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  const data: any = await response.json();
  return data.email;
}

/**
 * List all GA4 properties accessible to the authenticated user.
 * Uses the Analytics Admin API accountSummaries endpoint.
 */
export interface GA4Property {
  propertyId: string;      // e.g. "123456789"
  displayName: string;     // e.g. "My Website"
  accountName: string;     // e.g. "My Company"
}

export async function listGA4Properties(accessToken: string): Promise<GA4Property[]> {
  const properties: GA4Property[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "200" });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GA4 Admin API error: ${response.status} ${text}`);
    }

    const data: any = await response.json();

    for (const account of data.accountSummaries || []) {
      for (const prop of account.propertySummaries || []) {
        // prop.property is "properties/123456789"
        const id = prop.property?.replace("properties/", "") || "";
        if (id) {
          properties.push({
            propertyId: id,
            displayName: prop.displayName || `Property ${id}`,
            accountName: account.displayName || "Unknown Account",
          });
        }
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return properties;
}

/**
 * Revoke Google OAuth tokens.
 */
export async function revokeGoogleTokens(accessToken: string): Promise<void> {
  await fetch(`${REVOKE_ENDPOINT}?token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}
