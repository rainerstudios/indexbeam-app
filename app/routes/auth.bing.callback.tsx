import type { LoaderFunctionArgs } from "react-router";
import {
  verifyState,
  exchangeCodeForTokens,
} from "../lib/bing-oauth.server";
import { encrypt } from "../lib/encryption.server";
import prisma from "../db.server";

/**
 * Bing Webmaster OAuth callback — NOT behind Shopify auth.
 * Microsoft redirects here directly after user consents.
 * Stores tokens, then posts message to opener and closes popup.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(errorPage(`Bing OAuth error: ${error}`), {
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

    // Store encrypted tokens
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.store.update({
      where: { shopDomain },
      data: {
        bingAccessToken: encrypt(tokens.access_token),
        bingRefreshToken: encrypt(tokens.refresh_token),
        bingTokenExpiresAt: expiresAt,
      },
    });

    return new Response(successPage(), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("Bing OAuth callback error:", err);
    return new Response(
      errorPage(`Authentication failed: ${(err as Error).message}`),
      { headers: { "Content-Type": "text/html" } }
    );
  }
};

function successPage(): string {
  return `<!DOCTYPE html>
<html>
<head><title>Bing Connected</title></head>
<body>
<p>Bing Webmaster account connected successfully. This window will close.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'bing-oauth-success' }, '*');
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
<head><title>Bing OAuth Error</title></head>
<body>
<p>${safeMessage}</p>
<p><a href="javascript:window.close()">Close this window</a></p>
</body>
</html>`;
}
