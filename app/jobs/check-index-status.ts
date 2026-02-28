import type { Job } from "bullmq";
import { getUrlInfo } from "../services/bing-webmaster.server";
import { inspectUrl } from "../services/gsc.server";
import { getGoogleAccessToken } from "../lib/google-oauth.server";
import { decrypt } from "../lib/encryption.server";
import { waitForToken } from "../lib/rate-limiter.server";
import prisma from "../db.server";

interface IndexCheckJobData {
  storeId: string;
}

export async function processIndexCheckJob(job: Job<IndexCheckJobData>) {
  const { storeId } = job.data;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return;

  const submittedUrls = await prisma.urlSubmission.findMany({
    where: { storeId, status: "sent" },
    distinct: ["url"],
    select: { url: true },
  });

  for (const { url } of submittedUrls) {
    const updateData: any = { lastCheckedAt: new Date() };

    if (store.bingWebmasterApiKey) {
      try {
        await waitForToken("bing_webmaster");
        const bingResult = await getUrlInfo(
          decrypt(store.bingWebmasterApiKey),
          `https://${store.shopDomain}`,
          url
        );
        updateData.bingIndexed = bingResult.indexed;
        updateData.bingLastCrawl = bingResult.lastCrawl;
      } catch (error) {
        console.error(`Bing index check error for ${url}:`, error);
      }
    }

    // Prefer OAuth token, fall back to service account
    const oauthToken = await getGoogleAccessToken(store.id);
    if (oauthToken || store.gscCredentials) {
      try {
        await waitForToken("gsc_inspection");
        const gscResult = oauthToken
          ? await inspectUrl(oauthToken, `https://${store.shopDomain}`, url, true)
          : await inspectUrl(decrypt(store.gscCredentials!), `https://${store.shopDomain}`, url);
        updateData.googleIndexed = gscResult.indexed;
        updateData.googleLastCrawl = gscResult.lastCrawl;
      } catch (error) {
        console.error(`GSC inspection error for ${url}:`, error);
      }
    }

    await prisma.urlIndexStatus.upsert({
      where: { storeId_url: { storeId, url } },
      create: { storeId, url, ...updateData },
      update: updateData,
    });
  }

  await prisma.activityLog.create({
    data: {
      storeId,
      type: "index_check",
      message: `Index status check completed for ${submittedUrls.length} URLs`,
    },
  });
}
