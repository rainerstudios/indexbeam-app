import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processIndexCheckJob } from "./app/jobs/check-index-status";
import { processVisibilityScanJob } from "./app/jobs/run-visibility-scan";
import { processWeeklyDigestJob } from "./app/jobs/weekly-digest";
import { startScheduler } from "./app/jobs/scheduler.server";

const url = process.env.REDIS_URL || "redis://localhost:6379";

async function startWorkers() {
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    family: 4,
    retryStrategy(times) {
      const delay = Math.min(times * 1000, 30000);
      console.log(`[Redis] Retry #${times} in ${delay}ms`);
      return delay;
    },
    ...(url.startsWith("rediss://")
      ? { tls: { rejectUnauthorized: false } }
      : {}),
  });

  // Wait for initial connection
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Redis connection timeout after 30s"));
    }, 30000);

    connection.once("connect", () => {
      clearTimeout(timeout);
      console.log("[Redis] Connected");
      resolve();
    });

    connection.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  connection.on("error", (err) =>
    console.error("[Redis] Error:", err.message)
  );
  connection.on("reconnecting", () =>
    console.log("[Redis] Reconnecting...")
  );

  // IndexNow submissions are now synchronous — no worker needed for that queue.
  // Only run index-check and visibility-scan workers.

  const indexCheckWorker = new Worker("index-check", processIndexCheckJob, {
    connection,
    concurrency: 2,
  });

  const visibilityScanWorker = new Worker(
    "visibility-scan",
    processVisibilityScanJob,
    { connection, concurrency: 2 }
  );

  const weeklyDigestWorker = new Worker(
    "weekly-digest",
    processWeeklyDigestJob,
    { connection, concurrency: 1 }
  );

  indexCheckWorker.on("completed", (job) => {
    console.log(`[IndexCheck] Job ${job.id} completed`);
  });
  indexCheckWorker.on("failed", (job, err) => {
    console.error(`[IndexCheck] Job ${job?.id} failed:`, err.message);
  });

  visibilityScanWorker.on("completed", (job) => {
    console.log(`[VisibilityScan] Job ${job.id} completed`);
  });
  visibilityScanWorker.on("failed", (job, err) => {
    console.error(`[VisibilityScan] Job ${job?.id} failed:`, err.message);
  });

  weeklyDigestWorker.on("completed", (job) => {
    console.log(`[WeeklyDigest] Job ${job.id} completed`);
  });
  weeklyDigestWorker.on("failed", (job, err) => {
    console.error(`[WeeklyDigest] Job ${job?.id} failed:`, err.message);
  });

  startScheduler();
  console.log("Workers started (index-check, visibility-scan, weekly-digest) and scheduler registered.");
}

startWorkers().catch((err) => {
  console.error("[Worker] Failed to start:", err.message);
  console.log("[Worker] Will idle — submissions run synchronously on the web process.");
  // Don't exit — keep the process alive so Fly doesn't restart it in a crash loop
  setInterval(() => {}, 60000);
});
