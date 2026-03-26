import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildBingAuthUrl } from "../lib/bing-oauth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const authUrl = buildBingAuthUrl(session.shop);
  return Response.json({ authUrl });
};
