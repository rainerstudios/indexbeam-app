import type { Job } from "bullmq";
import { submitUrl } from "../services/indexnow.server";
import { trackUrlSubmission } from "../services/ga4.server";
import { decrypt } from "../lib/encryption.server";
import { waitForToken } from "../lib/rate-limiter.server";
import prisma from "../db.server";

interface IndexNowJobData {
  storeId: string;
  url: string;
  source: string;
  shopDomain: string;
  indexnowKey: string;
}

export async function processIndexNowJob(job: Job<IndexNowJobData>) {
  const { storeId, url, source, shopDomain, indexnowKey } = job.data;

  if (!indexnowKey) {
    console.error(`No IndexNow key for store ${storeId}`);
    return;
  }

  const keyLocation = `https://${shopDomain}/apps/indexnow/${indexnowKey}.txt`;

  for (const engine of ["bing", "yandex"] as const) {
    try {
      await waitForToken("indexnow");
      const result = await submitUrl(
        url,
        shopDomain,
        indexnowKey,
        engine,
        keyLocation
      );

      await prisma.urlSubmission.create({
        data: {
          storeId,
          url,
          status: result.success ? "sent" : "failed",
          responseCode: result.status,
          source,
          engine,
          errorMessage: result.success ? null : result.message,
        },
      });

      // Fire GA4 event if configured
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (store?.ga4MeasurementId && store.ga4ApiSecret) {
        trackUrlSubmission(
          store.ga4MeasurementId,
          decrypt(store.ga4ApiSecret),
          shopDomain,
          url,
          engine,
          result.success
        ).catch(() => {}); // fire-and-forget
      }
    } catch (error) {
      await prisma.urlSubmission.create({
        data: {
          storeId,
          url,
          status: "failed",
          source,
          engine,
          errorMessage: (error as Error).message,
        },
      });
    }
  }
}
