import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processIndexNowJob } from "./app/jobs/submit-indexnow";
import { processIndexCheckJob } from "./app/jobs/check-index-status";
import { processVisibilityScanJob } from "./app/jobs/run-visibility-scan";
import { startScheduler } from "./app/jobs/scheduler.server";

const url = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(url, {
  maxRetriesPerRequest: null,
  family: 4,
  ...(url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {}),
});

connection.on("connect", () => console.log("[Redis] Connected"));
connection.on("error", (err) => console.error("[Redis] Error:", err.message));

const indexNowWorker = new Worker("indexnow-submit", processIndexNowJob, {
  connection,
  concurrency: 5,
});

const indexCheckWorker = new Worker("index-check", processIndexCheckJob, {
  connection,
  concurrency: 2,
});

const visibilityScanWorker = new Worker(
  "visibility-scan",
  processVisibilityScanJob,
  { connection, concurrency: 2 }
);

indexNowWorker.on("completed", (job) => {
  console.log(`[IndexNow] Job ${job.id} completed`);
});
indexNowWorker.on("failed", (job, err) => {
  console.error(`[IndexNow] Job ${job?.id} failed:`, err.message);
});

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

startScheduler();

console.log("All workers started and scheduler registered.");
