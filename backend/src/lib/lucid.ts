import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

type LucidModule = typeof import("lucid-cardano");

interface CompiledValidator {
  cbor: string;
}

function loadCompiledValidatorCbor(): string | null {
  try {
    const candidate = path.resolve(
      process.cwd(),
      "..",
      "new_frontend",
      "aiken-build",
      "plutus.json"
    );
    if (!require("fs").existsSync(candidate)) {
      logger.warn(`Compiled plutus.json not found at ${candidate}`);
      return null;
    }
    const raw = require("fs").readFileSync(candidate, { encoding: "utf-8" });
    const bundle = JSON.parse(raw) as any;
    // Some bundles may expose top-level cbor or validators array; prefer cbor if present
    if (typeof bundle?.cbor === "string") return bundle.cbor;
    const first = bundle?.validators?.[0];
    if (first?.cbor) return first.cbor;
    logger.warn("No cbor found in compiled plutus.json");
    return null;
  } catch (err) {
    logger.warn({ err }, "Unable to load compiled plutus.json for Lucid");
    return null;
  }
}

const compiledCbor = loadCompiledValidatorCbor();

let lucidModulePromise: Promise<LucidModule> | null = null;
let lucidPromise: Promise<any> | null = null;

function assertBlockchainEnv() {
  if (!env.BLOCKFROST_PROJECT_ID) {
    throw new Error("BLOCKFROST_PROJECT_ID is not configured");
  }
  if (!env.CARDANO_SIGNING_KEY) {
    throw new Error("CARDANO_SIGNING_KEY is not configured");
  }
}

async function ensureLucidWasmArtifact() {
  const projectRoot = process.cwd();
  const lucidWasmPath = path.join(
    projectRoot,
    "node_modules",
    "lucid-cardano",
    "esm",
    "src",
    "core",
    "libs",
    "cardano_multiplatform_lib",
    "cardano_multiplatform_lib_bg.wasm"
  );

  try {
    await fs.access(lucidWasmPath);
    return;
  } catch {
    const sourceWasmPath = path.join(
      projectRoot,
      "node_modules",
      "@emurgo",
      "cardano-serialization-lib-nodejs",
      "cardano_serialization_lib_bg.wasm"
    );

    try {
      await fs.mkdir(path.dirname(lucidWasmPath), { recursive: true });
      await fs.copyFile(sourceWasmPath, lucidWasmPath);
    } catch (error) {
      throw new Error(
        `Lucid WASM artifact missing at ${lucidWasmPath} and could not be copied from ${sourceWasmPath}: ${String(
          error
        )}`
      );
    }
  }
}

async function loadLucidModule() {
  if (!lucidModulePromise) {
    await ensureLucidWasmArtifact();
    lucidModulePromise = import("lucid-cardano");
  }

  return lucidModulePromise;
}

export async function getLucidInstance() {
  if (!lucidPromise) {
    assertBlockchainEnv();

    lucidPromise = (async () => {
      const { Blockfrost, Lucid } = await loadLucidModule();
      const lucid = await Lucid.new(
        new Blockfrost(env.BLOCKFROST_API_URL, env.BLOCKFROST_PROJECT_ID!),
        env.CARDANO_NETWORK
      );

      // Load signing key
      await lucid.selectWalletFromPrivateKey(env.CARDANO_SIGNING_KEY!);

      return lucid;
    })();
  }

  return lucidPromise;
}

export function getValidatorScript() {
  if (!compiledCbor) {
    throw new Error(
      "Compiled validator CBOR not available. Provide new_frontend/aiken-build/plutus.json or compile the policy."
    );
  }

  return {
    type: "PlutusV2",
    script: compiledCbor,
  };
}
