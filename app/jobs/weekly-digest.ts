import type { Job } from "bullmq";
import prisma from "../db.server";
import { sendWeeklyDigest } from "../services/email.server";
import crypto from "node:crypto";

export async function processWeeklyDigestJob(job: Job) {
  const { storeId } = job.data;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store || !store.merchantEmail || !store.emailDigestEnabled || store.uninstalledAt) {
    return { skipped: true, reason: "No email, disabled, or uninstalled" };
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Collect weekly stats
  const [urlsSubmitted, indexStatuses, aiMentionResults] = await Promise.all([
    prisma.urlSubmission.count({
      where: { storeId: store.id, submittedAt: { gte: weekAgo } },
    }),
    prisma.urlIndexStatus.findMany({
      where: { storeId: store.id },
      select: { bingIndexed: true, googleIndexed: true },
    }),
    prisma.aIMentionResult.findMany({
      where: { storeId: store.id },
      orderBy: { checkedAt: "desc" },
      distinct: ["keyword"],
      select: { keyword: true, mentioned: true },
    }),
  ]);

  const urlsIndexed = indexStatuses.filter(s => s.bingIndexed || s.googleIndexed).length;
  const totalTracked = indexStatuses.length;
  const aiKeywordsChecked = aiMentionResults.length;
  const aiKeywordsMentioned = aiMentionResults.filter(r => r.mentioned).length;

  // Get AI traffic if GA4 connected
  let aiSessions = 0;
  let topAISources: { source: string; sessions: number }[] = [];

  const hasGa4 = !!store.ga4PropertyId && (!!store.ga4Credentials || !!store.googleRefreshToken);
  if (hasGa4) {
    try {
      const { getAITrafficSummary } = await import("../services/ga4.server");
      const { getGoogleAccessToken } = await import("../lib/google-oauth.server");
      const { decrypt } = await import("../lib/encryption.server");

      const oauthToken = await getGoogleAccessToken(store.id);
      const creds = oauthToken || JSON.parse(decrypt(store.ga4Credentials!));

      const aiTraffic = await getAITrafficSummary(creds, store.ga4PropertyId!, 7);
      aiSessions = aiTraffic.totalAISessions;
      topAISources = aiTraffic.sources.slice(0, 5).map(s => ({
        source: s.source,
        sessions: s.sessions,
      }));
    } catch {}
  }

  // Generate unsubscribe token (simple HMAC of storeId)
  const secret = process.env.SESSION_SECRET || "indexbeam-secret";
  const unsubscribeToken = crypto
    .createHmac("sha256", secret)
    .update(store.id)
    .digest("hex");

  const result = await sendWeeklyDigest(
    store.merchantEmail,
    store.shopDomain,
    {
      urlsSubmitted,
      urlsIndexed,
      totalTracked,
      aiKeywordsChecked,
      aiKeywordsMentioned,
      aiSessions,
      topAISources,
    },
    unsubscribeToken,
  );

  if (result.success) {
    await prisma.activityLog.create({
      data: {
        storeId: store.id,
        type: "email_digest",
        message: `Weekly digest sent to ${store.merchantEmail}`,
      },
    });
  }

  return result;
}
