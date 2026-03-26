import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
  });
  if (!store || !store.indexnowKey) return new Response();

  const handle = (payload as any).handle;
  if (!handle) return new Response();

  const url = `https://${shop}/products/${handle}`;
  const source = topic.toLowerCase().replace("/", "_");

  try {
    const { submitUrl } = await import("../services/indexnow.server");

    for (const engine of ["bing", "yandex"] as const) {
      const result = await submitUrl(url, shop, store.indexnowKey, engine);
      await prisma.urlSubmission.create({
        data: {
          storeId: store.id,
          url,
          status: result.success ? "sent" : "failed",
          responseCode: result.status,
          source,
          engine,
          errorMessage: result.success ? null : result.message,
        },
      });
    }

    // Also submit via Bing Webmaster API if OAuth connected
    if (store.bingRefreshToken) {
      try {
        const { getBingAccessToken } = await import("../lib/bing-oauth.server");
        const bingWebmaster = await import("../services/bing-webmaster.server");
        const bingToken = await getBingAccessToken(store.id);
        if (bingToken) {
          const bingResult = await bingWebmaster.submitUrl(
            { oauthToken: bingToken },
            `https://${shop}`,
            url
          );
          await prisma.urlSubmission.create({
            data: {
              storeId: store.id, url, status: bingResult.success ? "sent" : "failed",
              responseCode: bingResult.status, source, engine: "bing-api",
              errorMessage: bingResult.success ? null : `HTTP ${bingResult.status}`,
            },
          });
        }
      } catch {}
    }

    await prisma.activityLog.create({
      data: {
        storeId: store.id,
        type: "indexnow_submit",
        message: `Auto-submitted ${url} (${source})`,
      },
    });
  } catch (error) {
    console.error(`Webhook handler error for ${topic}:`, error);
  }

  return new Response();
};
