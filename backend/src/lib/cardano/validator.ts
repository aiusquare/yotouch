import * as Cardano from "@emurgo/cardano-serialization-lib-nodejs";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../../lib/logger.js";

// Attempt to load compiled validators produced by the Aiken build at runtime.
// This avoids a hard dependency on the file at build time and lets the
// backend run in test/development mode when the on-chain artifacts are
// not present.
function loadCompiledValidatorHex(): string | null {
  try {
    const candidate = path.resolve(
      process.cwd(),
      "..",
      "frontend",
      "aiken-build",
      "plutus.json"
    );
    if (!fs.existsSync(candidate)) {
      logger.warn(`Compiled plutus.json not found at ${candidate}`);
      return null;
    }

    const raw = fs.readFileSync(candidate, { encoding: "utf-8" });
    const bundle = JSON.parse(raw) as any;
    const validators = bundle?.validators ?? [];
    const identityValidator = validators.find(
      (entry: any) =>
        typeof entry?.title === "string" &&
        entry.title.includes("identity_validator")
    );

    if (!identityValidator?.compiledCode) {
      logger.warn("Identity validator compiled code not found in plutus.json");
      return null;
    }

    return identityValidator.compiledCode as string;
  } catch (err) {
    logger.warn({ err }, "Unable to load compiled plutus.json");
    return null;
  }
}

const compiledValidatorHex = loadCompiledValidatorHex();

let validatorScript: Cardano.PlutusScript | null = null;
let validatorHash: ReturnType<Cardano.PlutusScript["hash"]> | null = null;

if (compiledValidatorHex) {
  try {
    validatorScript = Cardano.PlutusScript.from_bytes(
      Buffer.from(compiledValidatorHex, "hex")
    );
    validatorHash = validatorScript.hash();
  } catch (err) {
    logger.warn({ err }, "Failed to create Plutus script from compiled hex");
    validatorScript = null;
    validatorHash = null;
  }
} else {
  logger.info("Running without compiled identity validator (test/dev mode)");
}

export function hasCompiledValidator(): boolean {
  return validatorScript !== null && validatorHash !== null;
}

export function getValidatorScript(): Cardano.PlutusScript {
  if (!validatorScript) {
    throw new Error(
      "Compiled identity validator not available. Compile the Aiken policy or provide compiled artifact at new_frontend/aiken-build/plutus.json"
    );
  }
  return validatorScript;
}

export function getValidatorHash() {
  if (!validatorHash) {
    throw new Error(
      "Compiled identity validator not available. Compile the Aiken policy or provide compiled artifact at new_frontend/aiken-build/plutus.json"
    );
  }
  return validatorHash;
}

function createInlineDatum(applicantHash: string) {
  const normalized = applicantHash.startsWith("0x")
    ? applicantHash.slice(2)
    : applicantHash;
  const isHex = /^[0-9a-fA-F]+$/.test(normalized);
  const bytes = isHex
    ? Buffer.from(normalized, "hex")
    : Buffer.from(applicantHash, "utf-8");
  return Cardano.PlutusData.new_bytes(bytes);
}

export function createProofOutput(
  networkId: number,
  applicantHash: string,
  lovelace: bigint
) {
  if (!validatorHash) {
    throw new Error(
      "Identity validator is not available — cannot create on-chain proof output without compiled validator."
    );
  }

  const scriptCredential =
    Cardano.StakeCredential.from_scripthash(validatorHash);
  const scriptAddress = Cardano.EnterpriseAddress.new(
    networkId,
    scriptCredential
  ).to_address();
  const output = Cardano.TransactionOutput.new(
    scriptAddress,
    Cardano.Value.new(Cardano.BigNum.from_str(lovelace.toString()))
  );

  output.set_plutus_data(createInlineDatum(applicantHash));
  return output;
}
