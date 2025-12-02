import { Router } from "express";
import { onboardingRouter } from "./onboarding.js";

export const router = Router();

router.use("/identities", onboardingRouter);
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
