// SPDX-License-Identifier: Apache-2.0
//
// One-shot DBUSDC transfer helper. Uses the agent keystore (CONFIG.agent.address)
// to send a given amount of DBUSDC to a recipient. Mirrors the keypair-loading
// pattern from dca-seed.ts.
//
// Usage:
//   npx tsx dbusdc-transfer.ts <to_address> <amount_dbusdc>
// Example:
//   npx tsx dbusdc-transfer.ts 0x35f9… 200

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

import { CONFIG } from "../shared/config.ts";

function loadKp(): Ed25519Keypair {
  const path = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const entries: string[] = JSON.parse(readFileSync(path, "utf8"));
  for (const e of entries) {
    const bytes = fromBase64(e);
    if (bytes[0] !== 0x00) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (kp.toSuiAddress() === CONFIG.agent.address) return kp;
  }
  throw new Error(`No key for ${CONFIG.agent.address}`);
}

async function main() {
  const [, , to, amtStr] = process.argv;
  if (!to || !amtStr) {
    console.error("usage: dbusdc-transfer.ts <to_address> <amount_dbusdc>");
    process.exit(1);
  }
  const amt = Number(amtStr);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("amount must be a positive number");
  }
  const raw = BigInt(Math.round(amt * CONFIG.deepbook.usdcScalar));

  const kp = loadKp();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  const tx = new Transaction();
  const coin = coinWithBalance({
    type: CONFIG.deepbook.usdcType,
    balance: raw,
  });
  tx.transferObjects([coin], to);

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status?.status !== "success") {
    console.error(res.effects?.status);
    throw new Error("transfer failed");
  }
  console.log(`✓ sent ${amt} DBUSDC → ${to}`);
  console.log(`  tx: ${res.digest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
