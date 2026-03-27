import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Privacy webhook: ${topic} for ${shop}`);

  // Delete all store data when the shop requests deletion
  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
  });

  if (store) {
    await prisma.store.delete({ where: { id: store.id } });
    console.log(`Deleted all data for shop: ${shop}`);
  }

  return new Response(null, { status: 200 });
};
