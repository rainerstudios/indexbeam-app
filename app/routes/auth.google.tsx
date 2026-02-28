import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildGoogleAuthUrl } from "../lib/google-oauth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const authUrl = buildGoogleAuthUrl(session.shop);
  return Response.json({ authUrl });
};
