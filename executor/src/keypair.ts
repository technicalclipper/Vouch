// SPDX-License-Identifier: Apache-2.0
//
// Agent keypair loader. Priority:
//   1. AGENT_PRIVATE_KEY env (bech32 `suiprivkey1...` or hex `0x...`)
//   2. ~/.sui/sui_config/sui.keystore, matching CONFIG.agent.address (dev)
//
// In production the env var path is the only valid one. The keystore fallback
// exists so we can run the executor locally against the same address that
// /scripts/lifecycle.ts uses.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64, fromHex } from "@mysten/sui/utils";

import { CONFIG } from "../../shared/config.ts";

export function loadAgentKeypair(): Ed25519Keypair {
  const env = process.env.AGENT_PRIVATE_KEY?.trim();
  if (env) {
    if (env.startsWith("suiprivkey")) {
      const { schema, secretKey } = decodeSuiPrivateKey(env);
      if (schema !== "ED25519") {
        throw new Error(`AGENT_PRIVATE_KEY schema=${schema}; expected ED25519`);
      }
      return Ed25519Keypair.fromSecretKey(secretKey);
    }
    if (env.startsWith("0x") || env.length === 64) {
      const hex = env.startsWith("0x") ? env.slice(2) : env;
      return Ed25519Keypair.fromSecretKey(fromHex(hex));
    }
    throw new Error(
      "AGENT_PRIVATE_KEY format not recognized (expected suiprivkey1… or 0x…)",
    );
  }

  // Dev fallback.
  const keystorePath = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const entries: string[] = JSON.parse(readFileSync(keystorePath, "utf8"));
  for (const entry of entries) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0x00) continue; // 0x00 = Ed25519
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (kp.toSuiAddress() === CONFIG.agent.address) return kp;
  }
  throw new Error(
    `No AGENT_PRIVATE_KEY in env, and no key for ${CONFIG.agent.address} in ${keystorePath}.`,
  );
}
