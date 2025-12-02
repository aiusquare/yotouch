import dotenv from "dotenv";

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 8080),
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/yotouch",
  CARDANO_WEBHOOK_URL:
    process.env.CARDANO_WEBHOOK_URL ?? "http://localhost:5050/proofs",
  AI_SERVICE_URL: process.env.AI_SERVICE_URL ?? "http://localhost:9000",
};
