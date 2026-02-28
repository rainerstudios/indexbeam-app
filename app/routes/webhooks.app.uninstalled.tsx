import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Mark store as uninstalled
  await db.store
    .update({
      where: { shopDomain: shop },
      data: { uninstalledAt: new Date() },
    })
    .catch(() => {
      // Store may not exist yet if auth never completed
    });

  return new Response();
};
