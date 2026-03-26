import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import crypto from "node:crypto";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const secret = process.env.SESSION_SECRET || "indexbeam-secret";

  // Find the store whose HMAC matches the token
  const stores = await prisma.store.findMany({
    where: { emailDigestEnabled: true, uninstalledAt: null },
    select: { id: true },
  });

  let matchedStoreId: string | null = null;
  for (const store of stores) {
    const expectedToken = crypto
      .createHmac("sha256", secret)
      .update(store.id)
      .digest("hex");
    if (expectedToken === token) {
      matchedStoreId = store.id;
      break;
    }
  }

  if (!matchedStoreId) {
    return new Response(
      "<html><body style='font-family:sans-serif;text-align:center;padding:60px'><h2>Invalid or expired link</h2><p>This unsubscribe link is no longer valid.</p></body></html>",
      { headers: { "Content-Type": "text/html" }, status: 400 },
    );
  }

  await prisma.store.update({
    where: { id: matchedStoreId },
    data: { emailDigestEnabled: false },
  });

  return new Response(
    "<html><body style='font-family:sans-serif;text-align:center;padding:60px'><h2>Unsubscribed</h2><p>You will no longer receive weekly digest emails from IndexBeam.</p><p>You can re-enable email reports in your IndexBeam settings.</p></body></html>",
    { headers: { "Content-Type": "text/html" } },
  );
};
