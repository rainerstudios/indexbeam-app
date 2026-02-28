import type { LoaderFunctionArgs } from "react-router";
import {
  verifyState,
  exchangeCodeForTokens,
  getGoogleUserEmail,
} from "../lib/google-oauth.server";
import { encrypt } from "../lib/encryption.server";
import prisma from "../db.server";

/**
 * Google OAuth callback — NOT behind Shopify auth.
 * Google redirects here directly after user consents.
 * Stores tokens, then posts message to opener and closes popup.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(errorPage(`Google OAuth error: ${error}`), {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code || !state) {
    return new Response(errorPage("Missing code or state parameter."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    // Verify HMAC-signed state to get shop domain
    const shopDomain = verifyState(state);

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Fetch user email
    const email = await getGoogleUserEmail(tokens.access_token);

    // Store encrypted tokens
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.store.update({
      where: { shopDomain },
      data: {
        googleAccessToken: encrypt(tokens.access_token),
        googleRefreshToken: encrypt(tokens.refresh_token),
        googleTokenExpiresAt: expiresAt,
        googleScopes: tokens.scope,
        googleEmail: email,
      },
    });

    return new Response(successPage(), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return new Response(
      errorPage(`Authentication failed: ${(err as Error).message}`),
      { headers: { "Content-Type": "text/html" } }
    );
  }
};

function successPage(): string {
  return `<!DOCTYPE html>
<html>
<head><title>Google Connected</title></head>
<body>
<p>Google account connected successfully. This window will close.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'google-oauth-success' }, '*');
  }
  window.close();
</script>
</body>
</html>`;
}

function errorPage(message: string): string {
  const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head><title>Google OAuth Error</title></head>
<body>
<p>${safeMessage}</p>
<p><a href="javascript:window.close()">Close this window</a></p>
</body>
</html>`;
}
