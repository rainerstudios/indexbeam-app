import type { Job } from "bullmq";
import { runVisibilityScan } from "../services/visibility.server";

interface VisibilityScanJobData {
  storeId: string;
}

export async function processVisibilityScanJob(
  job: Job<VisibilityScanJobData>
) {
  const { storeId } = job.data;
  await runVisibilityScan(storeId);
}
