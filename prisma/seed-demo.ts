/**
 * Demo data seed script for IndexBeam screenshots
 * Run: npx tsx prisma/seed-demo.ts
 *
 * Seeds realistic-looking data for all dashboard pages.
 * Uses the existing store for the connected shop domain.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHOP_DOMAIN = process.env.SHOP_DOMAIN || "duka-9840.myshopify.com";

const PRODUCT_URLS = [
  "/products/premium-wireless-headphones",
  "/products/organic-cotton-t-shirt",
  "/products/stainless-steel-water-bottle",
  "/products/leather-crossbody-bag",
  "/products/smart-fitness-tracker",
  "/products/natural-soy-candle-set",
  "/products/bamboo-cutting-board",
  "/products/merino-wool-sweater",
  "/products/ceramic-coffee-mug-set",
  "/products/outdoor-adventure-backpack",
  "/products/handmade-soap-collection",
  "/products/bluetooth-portable-speaker",
  "/products/linen-throw-pillow",
  "/products/stainless-travel-tumbler",
  "/products/vitamin-c-serum",
  "/products/yoga-mat-premium",
  "/products/wooden-desk-organizer",
  "/products/silk-sleep-mask",
  "/products/cast-iron-skillet",
  "/products/recycled-tote-bag",
  "/collections/new-arrivals",
  "/collections/best-sellers",
  "/collections/summer-collection",
  "/pages/about-us",
  "/pages/sustainability",
];

const COLLECTION_URLS = [
  "/collections/wireless-audio",
  "/collections/eco-friendly",
  "/collections/fitness-gear",
  "/collections/home-kitchen",
  "/collections/skincare",
];

const KEYWORDS = [
  "best wireless headphones 2026",
  "organic cotton clothing brand",
  "eco-friendly water bottle",
  "premium leather bags online",
  "smart fitness tracker reviews",
  "natural soy candles",
  "handmade soap brand",
  "sustainable fashion store",
];

const COMPETITORS = [
  { domain: "ecostore.com", name: "EcoStore" },
  { domain: "naturalbrand.co", name: "Natural Brand" },
  { domain: "greenshop.io", name: "GreenShop" },
];

function randomDate(daysAgo: number, daysAgoEnd = 0): Date {
  const start = Date.now() - daysAgo * 86400000;
  const end = Date.now() - daysAgoEnd * 86400000;
  return new Date(start + Math.random() * (end - start));
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("🌱 Seeding demo data for IndexBeam screenshots...\n");

  // Find the store
  let store = await prisma.store.findUnique({
    where: { shopDomain: SHOP_DOMAIN },
  });

  if (!store) {
    console.log(`Store ${SHOP_DOMAIN} not found. Creating a demo store...`);
    store = await prisma.store.create({
      data: {
        shopDomain: SHOP_DOMAIN,
        accessToken: "demo",
        plan: "Growth",
        indexnowKey: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        onboardingDismissed: true,
        emailDigestEnabled: true,
        merchantEmail: "demo@indexbeam.app",
        installedAt: new Date(Date.now() - 30 * 86400000), // 30 days ago
      },
    });
  } else {
    // Update plan for screenshots
    await prisma.store.update({
      where: { id: store.id },
      data: {
        plan: "Growth",
        onboardingDismissed: true,
        indexnowKey: store.indexnowKey || "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      },
    });
  }

  const storeId = store.id;
  const baseUrl = `https://${SHOP_DOMAIN}`;

  // --- URL Submissions (mix of sent, failed, webhook + manual) ---
  console.log("📤 Creating URL submissions...");
  const submissions = [];
  for (let i = 0; i < 85; i++) {
    const url = `${baseUrl}${randomChoice(PRODUCT_URLS)}`;
    const isSent = Math.random() > 0.08; // 92% success rate
    const isWebhook = Math.random() > 0.4; // 60% from webhooks
    const daysAgo = Math.random() * 28;

    submissions.push({
      storeId,
      url,
      status: isSent ? "sent" : "error",
      responseCode: isSent ? 200 : (Math.random() > 0.5 ? 400 : 429),
      source: isWebhook ? "webhook" : "manual",
      engine: Math.random() > 0.3 ? "bing" : "yandex",
      errorMessage: isSent ? null : "Rate limit exceeded",
      submittedAt: randomDate(28),
    });
  }

  // Add some recent webhook submissions (for auto-index banner)
  for (let i = 0; i < 5; i++) {
    submissions.push({
      storeId,
      url: `${baseUrl}${PRODUCT_URLS[i]}`,
      status: "sent",
      responseCode: 200,
      source: "webhook",
      engine: "bing",
      errorMessage: null,
      submittedAt: randomDate(0.5), // last 12 hours
    });
  }

  await prisma.urlSubmission.createMany({ data: submissions });
  console.log(`  ✅ ${submissions.length} submissions created`);

  // --- URL Index Statuses ---
  console.log("📊 Creating index status records...");
  const indexStatuses = [];
  const uniqueUrls = [...new Set(PRODUCT_URLS.slice(0, 18))];
  for (const path of uniqueUrls) {
    const url = `${baseUrl}${path}`;
    const bingIndexed = Math.random() > 0.25; // 75% indexed
    indexStatuses.push({
      storeId,
      url,
      bingIndexed,
      bingLastCrawl: bingIndexed ? randomDate(7) : null,
      googleIndexed: Math.random() > 0.35, // 65% indexed
      googleLastCrawl: randomDate(14),
      lastCheckedAt: randomDate(2),
      crawlErrors: Math.random() > 0.9 ? "Temporarily unreachable" : null,
    });
  }
  // Use upsert to avoid unique constraint conflicts
  for (const status of indexStatuses) {
    await prisma.urlIndexStatus.upsert({
      where: { storeId_url: { storeId: status.storeId, url: status.url } },
      update: status,
      create: status,
    });
  }
  console.log(`  ✅ ${indexStatuses.length} index statuses created`);

  // --- Visibility Queries + Results ---
  console.log("🔍 Creating visibility queries and results...");
  for (const keyword of KEYWORDS) {
    const query = await prisma.visibilityQuery.create({
      data: {
        storeId,
        keyword,
        frequency: "daily",
      },
    });

    // Create 5-7 results per keyword over past 14 days
    const resultCount = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < resultCount; i++) {
      await prisma.visibilityResult.create({
        data: {
          queryId: query.id,
          rankPosition: Math.random() > 0.4 ? Math.floor(Math.random() * 10) + 1 : null,
          domain: Math.random() > 0.3 ? SHOP_DOMAIN : randomChoice(COMPETITORS).domain,
          mentionsBrand: Math.random() > 0.4,
          mentionsCompetitor: Math.random() > 0.6,
          snippet: Math.random() > 0.3
            ? `Based on customer reviews and product quality, ${SHOP_DOMAIN.replace(".myshopify.com", "")} offers excellent ${keyword.split(" ").slice(1, 3).join(" ")}...`
            : null,
          source: randomChoice(["bing", "bing", "duckduckgo"]),
          checkedAt: randomDate(14),
        },
      });
    }
  }
  console.log(`  ✅ ${KEYWORDS.length} keywords with results created`);

  // --- AI Mention Results ---
  console.log("🤖 Creating AI mention results...");
  const aiMentions = [];
  const aiKeywords = [
    "best eco-friendly headphones",
    "top organic cotton brands",
    "sustainable water bottles review",
    "premium leather bag brands",
    "best fitness trackers 2026",
    "natural candle brands",
    "handmade soap online stores",
    "eco-friendly fashion brands",
    "best yoga mats for beginners",
    "premium coffee accessories",
  ];
  for (const keyword of aiKeywords) {
    const mentioned = Math.random() > 0.35; // 65% mention rate
    aiMentions.push({
      storeId,
      keyword,
      mentioned,
      responseSnippet: mentioned
        ? `Among the top options, ${SHOP_DOMAIN.replace(".myshopify.com", "").replace("duka-9840", "DukaStore")} stands out for their commitment to quality and sustainability. Their ${keyword.split(" ").slice(1, 3).join(" ")} collection has received positive feedback from customers.`
        : `While there are many options available, popular choices include established brands like EcoStore and Natural Brand. Consider checking customer reviews and comparing features before making a purchase.`,
      competitorsMentioned: mentioned
        ? JSON.stringify(["EcoStore", "GreenShop"])
        : JSON.stringify(["EcoStore", "Natural Brand", "GreenShop"]),
      citations: mentioned
        ? JSON.stringify([`https://${SHOP_DOMAIN}/collections/all`, "https://ecostore.com/products"])
        : null,
      checkedAt: randomDate(14),
    });
  }
  await prisma.aIMentionResult.createMany({ data: aiMentions });
  console.log(`  ✅ ${aiMentions.length} AI mention results created`);

  // --- Competitors ---
  console.log("🏪 Creating competitors...");
  for (const comp of COMPETITORS) {
    const competitor = await prisma.competitor.upsert({
      where: { storeId_domain: { storeId, domain: comp.domain } },
      update: {},
      create: { storeId, domain: comp.domain, name: comp.name },
    });

    // Add some competitor changes
    const changes = [
      { changeType: "new_product", changeSummary: "Added 3 new products to their eco-friendly collection" },
      { changeType: "price_change", changeSummary: "Reduced prices on 5 items by 15-20%" },
      { changeType: "content_update", changeSummary: "Updated homepage with new seasonal campaign" },
    ];
    for (const change of changes.slice(0, 1 + Math.floor(Math.random() * 2))) {
      await prisma.competitorChange.create({
        data: {
          competitorId: competitor.id,
          changeType: change.changeType,
          changeSummary: change.changeSummary,
          detectedAt: randomDate(14),
        },
      });
    }
  }
  console.log(`  ✅ ${COMPETITORS.length} competitors created`);

  // --- Activity Logs ---
  console.log("📝 Creating activity logs...");
  const activities: { storeId: string; type: string; message: string; createdAt: Date }[] = [
    { storeId, type: "submission", message: "Submitted 5 product URLs via IndexNow to Bing", createdAt: randomDate(0.5) },
    { storeId, type: "submission", message: "Auto-indexed new product: Premium Wireless Headphones", createdAt: randomDate(0.5) },
    { storeId, type: "index_check", message: "Index status check: 14 of 18 URLs now indexed on Bing", createdAt: randomDate(1) },
    { storeId, type: "visibility", message: "AI visibility scan complete: Brand mentioned in 6 of 10 queries", createdAt: randomDate(1) },
    { storeId, type: "submission", message: "Auto-indexed updated product: Organic Cotton T-Shirt", createdAt: randomDate(1.5) },
    { storeId, type: "submission", message: "Bulk submitted 12 URLs to Bing and Yandex", createdAt: randomDate(2) },
    { storeId, type: "index_check", message: "New URL indexed: /products/smart-fitness-tracker", createdAt: randomDate(2) },
    { storeId, type: "visibility", message: "Keyword 'best wireless headphones 2026' — ranked #3 on Bing", createdAt: randomDate(3) },
    { storeId, type: "submission", message: "Auto-indexed new collection: Summer Collection", createdAt: randomDate(3) },
    { storeId, type: "competitor", message: "EcoStore added 3 new products to their eco-friendly collection", createdAt: randomDate(4) },
    { storeId, type: "index_check", message: "Index status check: 12 of 15 URLs indexed on Bing", createdAt: randomDate(5) },
    { storeId, type: "submission", message: "Submitted 8 product URLs via IndexNow", createdAt: randomDate(6) },
    { storeId, type: "visibility", message: "AI mention detected for 'organic cotton clothing brand'", createdAt: randomDate(7) },
    { storeId, type: "index_check", message: "3 new URLs indexed since last check", createdAt: randomDate(8) },
    { storeId, type: "submission", message: "Auto-indexed updated product: Leather Crossbody Bag", createdAt: randomDate(10) },
  ];
  await prisma.activityLog.createMany({ data: activities });
  console.log(`  ✅ ${activities.length} activity logs created`);

  // --- Summary ---
  const totalSubs = await prisma.urlSubmission.count({ where: { storeId } });
  const indexedCount = await prisma.urlIndexStatus.count({ where: { storeId, bingIndexed: true } });
  const keywordCount = await prisma.visibilityQuery.count({ where: { storeId } });
  const mentionedCount = await prisma.aIMentionResult.count({ where: { storeId, mentioned: true } });

  console.log("\n🎉 Demo data seeded successfully!\n");
  console.log("Dashboard will show:");
  console.log(`  📤 ${totalSubs} URL submissions (92% success rate)`);
  console.log(`  ✅ ${indexedCount}/18 URLs indexed`);
  console.log(`  🔍 ${keywordCount} tracked keywords`);
  console.log(`  🤖 ${mentionedCount}/10 AI mentions`);
  console.log(`  🏪 ${COMPETITORS.length} competitors tracked`);
  console.log(`  📝 ${activities.length} activity log entries`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
