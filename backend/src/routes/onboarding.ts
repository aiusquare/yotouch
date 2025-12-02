import { Router } from "express";
import { createIdentity } from "../controllers/identityController.js";

export const onboardingRouter = Router();

onboardingRouter.post("/", createIdentity);
