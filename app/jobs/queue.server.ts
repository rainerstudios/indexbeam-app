import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

function getConnection() {
  if (!connection) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      family: 4,
      ...(url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {}),
    });
  }
  return connection;
}

export const indexNowQueue = new Queue("indexnow-submit", {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const indexCheckQueue = new Queue("index-check", {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export const visibilityScanQueue = new Queue("visibility-scan", {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
