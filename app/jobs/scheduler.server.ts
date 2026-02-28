import cron from "node-cron";
import { indexCheckQueue, visibilityScanQueue } from "./queue.server";
import prisma from "../db.server";

export function startScheduler() {
  // Daily at 2 AM UTC: check index status for all active stores
  cron.schedule("0 2 * * *", async () => {
    console.log("[Scheduler] Running daily index checks...");
    const stores = await prisma.store.findMany({
      where: { uninstalledAt: null },
    });

    for (const store of stores) {
      const jobId = `index-check-${store.id}-${new Date().toISOString().split("T")[0]}`;
      await indexCheckQueue.add("check", { storeId: store.id }, { jobId });
    }
    console.log(
      `[Scheduler] Enqueued index checks for ${stores.length} stores`
    );
  });

  // Daily at 4 AM UTC: run visibility scans for paid stores
  cron.schedule("0 4 * * *", async () => {
    console.log("[Scheduler] Running daily visibility scans...");
    const stores = await prisma.store.findMany({
      where: { uninstalledAt: null, plan: { not: "free" } },
    });

    for (const store of stores) {
      const jobId = `visibility-scan-${store.id}-${new Date().toISOString().split("T")[0]}`;
      await visibilityScanQueue.add(
        "scan",
        { storeId: store.id },
        { jobId }
      );
    }
    console.log(
      `[Scheduler] Enqueued visibility scans for ${stores.length} stores`
    );
  });

  console.log("[Scheduler] Cron jobs registered");
}
