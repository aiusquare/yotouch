import { logger } from "../lib/logger";

export async function enqueueVerificationJob(applicantId: string) {
  // Placeholder for BullMQ/Temporal integration
  logger.info({ applicantId }, "Enqueued verification job");
}
