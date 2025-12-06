import { Router } from "express";
import { onboardingRouter } from "./onboarding.js";
import { proofRouter } from "./proofs.js";

export const router = Router();

router.use("/identities", onboardingRouter);
router.use("/proofs", proofRouter);
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
