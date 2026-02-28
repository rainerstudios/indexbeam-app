import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getGoogleAccessToken, listGA4Properties } from "../lib/google-oauth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!store) {
    return Response.json({ error: "Store not found" }, { status: 404 });
  }

  const accessToken = await getGoogleAccessToken(store.id);
  if (!accessToken) {
    return Response.json(
      { error: "Google account not connected" },
      { status: 400 }
    );
  }

  try {
    const properties = await listGA4Properties(accessToken);
    return Response.json({
      properties,
      selectedPropertyId: store.ga4PropertyId || null,
    });
  } catch (err) {
    console.error("Failed to list GA4 properties:", err);
    return Response.json(
      { error: `Failed to fetch properties: ${(err as Error).message}` },
      { status: 500 }
    );
  }
};
