import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
  });
  if (!store) return new Response();

  const handle = (payload as any).handle;
  if (!handle) return new Response();

  const url = `https://${shop}/collections/${handle}`;
  const source = topic.toLowerCase().replace("/", "_");

  try {
    const { indexNowQueue } = await import("../jobs/queue.server");
    await indexNowQueue.add("submit", {
      storeId: store.id,
      url,
      source,
      shopDomain: shop,
      indexnowKey: store.indexnowKey,
    });
  } catch (error) {
    console.error(`Collection webhook error for ${topic}:`, error);
  }

  return new Response();
};
