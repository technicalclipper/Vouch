// SPDX-License-Identifier: Apache-2.0
//
// scripts/dca-seed.ts — create + activate a REAL DBUSDC-funded DCA capability
// pointing at the SUI_DBUSDC Deepbook pool. This is what the executor will
// trade against to prove Stage 2 end-to-end.
//
// In production the create PTB is wallet-signed by the funder and the
// activate PTB is Enoki-sponsored after zkLogin. Here we collapse them
// because we're testing the executor, not the onboarding flow.
//
// Usage:
//   cd scripts && npm run dca-seed
// Prints the new cap_id and vault_id. Pass cap_id to:
//   curl -X POST http://localhost:8787/run-now/<cap_id>

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";

import { CONFIG } from "../shared/config.ts";

const CLOCK = "0x6";

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
  const kp = loadKp();
  const me = kp.toSuiAddress();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  // Seed params. Per-exec cap of 1 DBUSDC comfortably covers a 1-SUI buy at
  // current testnet spot (~0.71 DBUSDC) + fees + slippage room.
  const BUDGET_TOTAL = 3_000_000n; // 3 DBUSDC funds 3 slots
  const PER_EXEC_CAP = 1_000_000n; // 1 DBUSDC per slot
  const EXECUTIONS_MAX = 3n;
  const INTERVAL_MS = 5_000n; // 5s between slots for quick demos
  const DURATION_MS = 24n * 60n * 60n * 1000n; // 1 day

  const token = randomBytes(16);
  const tokenHash = new Uint8Array(createHash("sha256").update(token).digest());

  console.log(`signer:        ${me}`);
  console.log(`budget_total:  ${BUDGET_TOTAL} (micro-DBUSDC)`);
  console.log(`per_exec_cap:  ${PER_EXEC_CAP}`);
  console.log(`pool:          SUI_DBUSDC ${CONFIG.deepbook.usdcSuiPoolId}`);

  // ---- 1. Create vault + capability (one PTB) ----
  const tx = new Transaction();

  // Pull BUDGET_TOTAL DBUSDC from the signer's wallet → fund vault.
  const dbusdcCoin = coinWithBalance({
    type: CONFIG.deepbook.usdcType,
    balance: BUDGET_TOTAL,
  });
  const vaultIdArg = tx.moveCall({
    target: `${CONFIG.vouchPackageId}::vault::create_and_share`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [dbusdcCoin],
  });

  const riskRules = tx.moveCall({
    target: "0x1::vector::empty",
    typeArguments: [`${CONFIG.vouchPackageId}::capability::RiskRule`],
    arguments: [],
  });

  tx.moveCall({
    target: `${CONFIG.vouchPackageId}::capability::create_pending`,
    arguments: [
      tx.pure.address(me), // agent_pubkey (us, for testing)
      vaultIdArg,
      tx.pure.u8(0), // action_type = dca_buy
      tx.pure.u64(BUDGET_TOTAL),
      tx.pure.u64(PER_EXEC_CAP),
      tx.pure(
        bcs
          .vector(bcs.Address)
          .serialize([CONFIG.deepbook.usdcSuiPoolId])
          .toBytes(),
      ),
      tx.pure.u64(INTERVAL_MS),
      tx.pure.u64(BigInt(Date.now())), // first_execution_at = NOW (immediately due)
      riskRules,
      tx.pure.u64(EXECUTIONS_MAX),
      tx.pure.u64(DURATION_MS),
      tx.pure(bcs.vector(bcs.U8).serialize(Array.from(tokenHash)).toBytes()),
    ],
  });

  const createRes = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: createRes.digest });
  if (createRes.effects?.status?.status !== "success") {
    console.error(createRes.effects?.status);
    throw new Error("seed create failed");
  }
  console.log(`\ncreate tx: ${createRes.digest}`);

  const created = (createRes.objectChanges ?? []).filter(
    (c) => c.type === "created",
  ) as Array<{ type: "created"; objectId: string; objectType: string }>;
  const cap = created.find((c) =>
    c.objectType.endsWith("::capability::AgentCapability"),
  );
  const vault = created.find((c) => c.objectType.includes("::vault::Vault<"));
  if (!cap || !vault) throw new Error("created cap/vault not found");

  // ---- 2. Activate (same signer plays the recipient here) ----
  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${CONFIG.vouchPackageId}::capability::activate`,
    arguments: [
      tx2.object(cap.objectId),
      tx2.pure(bcs.vector(bcs.U8).serialize(Array.from(token)).toBytes()),
      tx2.object(CLOCK),
    ],
  });
  const activateRes = await client.signAndExecuteTransaction({
    transaction: tx2,
    signer: kp,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: activateRes.digest });
  if (activateRes.effects?.status?.status !== "success") {
    console.error(activateRes.effects?.status);
    throw new Error("seed activate failed");
  }
  console.log(`activate tx: ${activateRes.digest}`);

  console.log(`\n--- ready ---`);
  console.log(`cap_id:   ${cap.objectId}`);
  console.log(`vault_id: ${vault.objectId}`);
  console.log(`\nTrigger from the running executor:`);
  console.log(`  curl -X POST http://localhost:8787/run-now/${cap.objectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
