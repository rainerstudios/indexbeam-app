import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { revokeGoogleTokens } from "../lib/google-oauth.server";
import { decrypt } from "../lib/encryption.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!store) {
    return Response.json({ error: "Store not found" }, { status: 404 });
  }

  // Revoke token at Google (best effort)
  if (store.googleAccessToken) {
    try {
      await revokeGoogleTokens(decrypt(store.googleAccessToken));
    } catch (err) {
      console.error("Failed to revoke Google token:", err);
    }
  }

  // Clear all Google OAuth fields
  await prisma.store.update({
    where: { id: store.id },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
      googleScopes: null,
      googleEmail: null,
    },
  });

  return Response.json({ success: true, message: "Google account disconnected." });
};
