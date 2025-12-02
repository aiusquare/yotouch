import type { Request, Response } from "express";
import { onboardingSchema } from "../schemas/onboardingSchema.js";
import { enqueueVerificationJob } from "../services/queueService.js";
import { persistApplicant } from "../services/identityService.js";

export async function createIdentity(req: Request, res: Response) {
  const parsed = onboardingSchema.parse(req.body);
  const applicant = await persistApplicant(parsed);
  await enqueueVerificationJob(applicant.id);

  return res
    .status(201)
    .json({
      userId: applicant.id,
      estimatedCompletion: applicant.estimatedCompletion,
    });
}
