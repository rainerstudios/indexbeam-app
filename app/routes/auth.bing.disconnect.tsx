import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!store) {
    return Response.json({ error: "Store not found" }, { status: 404 });
  }

  // Clear all Bing OAuth fields (no revoke endpoint for Microsoft)
  await prisma.store.update({
    where: { id: store.id },
    data: {
      bingAccessToken: null,
      bingRefreshToken: null,
      bingTokenExpiresAt: null,
      bingEmail: null,
    },
  });

  return Response.json({ success: true, message: "Bing Webmaster account disconnected." });
};
