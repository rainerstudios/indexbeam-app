import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Privacy webhook: ${topic} for ${shop}`);

  // IndexBeam does not collect or store customer personal data.
  // We only store product URLs, store domains, and API credentials.

  return new Response(null, { status: 200 });
};
