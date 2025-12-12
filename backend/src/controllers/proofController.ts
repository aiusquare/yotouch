import type { NextFunction, Request, Response } from "express";
import { proofSchema } from "../schemas/proofSchema.js";
import { submitIdentityProof } from "../services/proofService.js";
import { hasCompiledValidator } from "../lib/cardano/validator.js";

export async function handleProofSubmission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!hasCompiledValidator()) {
      return res.status(503).json({
        error:
          "Identity validator not available — cannot create on-chain proof output. Compile and place the Aiken build artifact at `new_frontend/aiken-build/plutus.json` or enable an off-chain/test-mode flow.",
      });
    }

    const payload = proofSchema.parse(req.body);
    const txHash = await submitIdentityProof(payload);
    return res.status(201).json({ txHash });
  } catch (error) {
    next(error);
  }
}
