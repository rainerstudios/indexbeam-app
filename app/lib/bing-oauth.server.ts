import crypto from "node:crypto";
import { encrypt, decrypt } from "./encryption.server";
import prisma from "../db.server";

const AUTH_ENDPOINT = "https://www.bing.com/webmasters/oauth/authorize";
const TOKEN_ENDPOINT = "https://www.bing.com/webmasters/oauth/token";

function getClientId(): string {
  const id = process.env.BING_WEBMASTER_CLIENT_ID;
  if (!id) throw new Error("BING_WEBMASTER_CLIENT_ID not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.BING_WEBMASTER_CLIENT_SECRET;
  if (!secret) throw new Error("BING_WEBMASTER_CLIENT_SECRET not configured");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) throw new Error("SHOPIFY_APP_URL not configured");
  return `${appUrl}/auth/bing/callback`;
}

function getHmacKey(): string {
  const key = process.env.SHOPIFY_API_SECRET;
  if (!key) throw new Error("SHOPIFY_API_SECRET not configured");
  return key;
}

/**
 * Build the Bing Webmaster OAuth authorization URL with HMAC-signed state.
 */
export function buildBingAuthUrl(shopDomain: string): string {
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
    scope: "webmaster.read webmaster.manage",
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
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
    throw new Error(`Bing token exchange failed: ${response.status} ${text}`);
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
    throw new Error(`Bing token refresh failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Main entry point: get a valid Bing access token for a store.
 * Auto-refreshes if expired (with 5-minute buffer).
 * Returns null if no OAuth tokens are stored.
 */
export async function getBingAccessToken(storeId: string): Promise<string | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      bingAccessToken: true,
      bingRefreshToken: true,
      bingTokenExpiresAt: true,
    },
  });

  if (!store?.bingRefreshToken) return null;

  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const expiresAt = store.bingTokenExpiresAt;

  // If token exists and not expired (with buffer), return it
  if (store.bingAccessToken && expiresAt && expiresAt.getTime() - bufferMs > now.getTime()) {
    return decrypt(store.bingAccessToken);
  }

  // Refresh the token
  try {
    const refreshed = await refreshAccessToken(store.bingRefreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await prisma.store.update({
      where: { id: storeId },
      data: {
        bingAccessToken: encrypt(refreshed.access_token),
        bingTokenExpiresAt: newExpiresAt,
      },
    });

    return refreshed.access_token;
  } catch (error) {
    console.error("Failed to refresh Bing access token:", error);
    return null;
  }
}
