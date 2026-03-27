import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Privacy webhook: ${topic} for ${shop}`);

  // IndexBeam does not store customer PII beyond what Shopify provides
  // in the session. No additional customer data to delete.

  return new Response(null, { status: 200 });
};
