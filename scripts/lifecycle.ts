// SPDX-License-Identifier: Apache-2.0
//
// scripts/lifecycle.ts — capability lifecycle smoke test against Sui testnet.
//
// What this script proves (CLAUDE.md §4 build/test requirements):
//   1. create_pending      — funder creates a Vault<SUI> + AgentCapability
//   2. activate            — "recipient" presents the one-time token
//   3. draw_for_execution  — agent executes one slot (assertions + budget reserve + vault withdraw)
//   4. log_action          — slot is accounted for
//   5. log_skip            — second slot is consumed via skip path (no budget touched)
//   6. revoke              — remaining vault balance refunded to funder
//
// All five non-negotiable invariants (CLAUDE.md §1) are exercised in this single run.
//
// SIMPLIFICATIONS vs. production:
//   - Vault is over `sui::sui::SUI` so we don't need testnet USDC yet. The Move
//     module is generic over T; Stage 2 will instantiate with the exact USDC
//     type Deepbook v3 expects (CLAUDE.md §2 critical gotchas).
//   - The same address plays creator, recipient, and agent. In production
//     these are three distinct identities (wallet, zkLogin, executor key).
//   - We don't actually trade against Deepbook here — the Coin<SUI> returned
//     by `draw_for_execution` is transferred straight back to the sender. The
//     real execution PTB (Stage 2) inserts deposit → place_market_order →
//     withdraw_all in place of that transfer.
//
// Usage:
//   cd scripts && npm install && npm run lifecycle

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";

import { CONFIG } from "../shared/config.ts";

// ---------------- Helpers ----------------

const SUI_TYPE = "0x2::sui::SUI";
const CLOCK_OBJECT_ID = "0x6";

/** Load the dev keypair from the local sui keystore. */
function loadKeypairFromSuiKeystore(): Ed25519Keypair {
  const keystorePath = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const entries: string[] = JSON.parse(readFileSync(keystorePath, "utf8"));
  // Each entry is base64( flag(1B) || privkey(32B) ). Ed25519 flag = 0x00.
  for (const entry of entries) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0x00) continue;
    const sk = bytes.slice(1);
    const kp = Ed25519Keypair.fromSecretKey(sk);
    if (kp.toSuiAddress() === CONFIG.agent.address) return kp;
  }
  throw new Error(
    `No Ed25519 key for ${CONFIG.agent.address} found in ${keystorePath}`,
  );
}

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

async function dump(client: SuiClient, label: string, digest: string) {
  console.log(`\n--- ${label} ---`);
  console.log(`tx: ${digest}`);
  const tx = await client.getTransactionBlock({
    digest,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  if (tx.effects?.status?.status !== "success") {
    console.error("status:", tx.effects?.status);
    throw new Error(`${label} failed`);
  }
  for (const ev of tx.events ?? []) {
    console.log(`event: ${ev.type}`);
    console.log(`  ${JSON.stringify(ev.parsedJson)}`);
  }
}

// ---------------- Main ----------------

async function main() {
  const kp = loadKeypairFromSuiKeystore();
  const me = kp.toSuiAddress();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const pkg = CONFIG.vouchPackageId;

  console.log(`signer: ${me}`);
  console.log(`package: ${pkg}`);

  // The token the "recipient" will present at activation. Hash is stored on chain.
  const token = new TextEncoder().encode("demo-token-lifecycle");
  const tokenHash = sha256(token);

  // Dummy pool ID in scope. The lifecycle test doesn't actually trade against
  // any pool; we just need an ID that matches what we'll pass to
  // draw_for_execution so assert_pool_in_scope passes.
  // Use a 32-byte all-1s address as a placeholder.
  const POOL_DUMMY =
    "0x1111111111111111111111111111111111111111111111111111111111111111";

  // Funding amount for the vault (SUI MIST).
  // Kept small so the lifecycle smoke test runs on a single faucet drip.
  const BUDGET_TOTAL = 100_000_000n; // 0.1 SUI
  const PER_EXEC_CAP = 40_000_000n; // 0.04 SUI
  const EXEC_AMOUNT = 25_000_000n; // 0.025 SUI

  // ---------- 1. CREATE: vault + pending capability in one PTB ----------
  let capId: string;
  let vaultId: string;
  {
    const tx = new Transaction();

    // Split BUDGET_TOTAL off the gas coin → fund the vault.
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(BUDGET_TOTAL)]);

    // vault::create_and_share<SUI>(coin) → ID
    const vaultIdArg = tx.moveCall({
      target: `${pkg}::vault::create_and_share`,
      typeArguments: [SUI_TYPE],
      arguments: [coin],
    });

    // Schedule: first execution NOW (interval 60s; only one slot we'll execute).
    const now = Date.now();
    const interval = 60_000;

    // Empty risk_rules vector — risk evaluation is off-chain (CLAUDE.md §6).
    const riskRules = tx.moveCall({
      target: `0x1::vector::empty`,
      typeArguments: [`${pkg}::capability::RiskRule`],
      arguments: [],
    });

    tx.moveCall({
      target: `${pkg}::capability::create_pending`,
      arguments: [
        tx.pure.address(me), // agent_pubkey — in the test we are the agent
        vaultIdArg, // vault_id
        tx.pure.u8(0), // action_type = dca_buy
        tx.pure.u64(BUDGET_TOTAL),
        tx.pure.u64(PER_EXEC_CAP),
        tx.pure(
          bcs.vector(bcs.Address).serialize([POOL_DUMMY]).toBytes(),
        ), // pool_scope: vector<ID>
        tx.pure.u64(interval), // interval_ms
        tx.pure.u64(now), // first_execution_at
        riskRules, // risk_rules: vector<RiskRule>
        tx.pure.u64(4), // executions_max
        tx.pure.u64(7 * 24 * 60 * 60 * 1000), // duration_ms = 1 week
        tx.pure(bcs.vector(bcs.U8).serialize(Array.from(tokenHash)).toBytes()),
      ],
    });

    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: kp,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    await dump(client, "1) create vault + capability", res.digest);

    // Pull out the shared object IDs from objectChanges.
    const created = (res.objectChanges ?? []).filter(
      (c) => c.type === "created",
    ) as Array<{
      type: "created";
      objectId: string;
      objectType: string;
      owner: unknown;
    }>;
    const capCreated = created.find((c) =>
      c.objectType.endsWith("::capability::AgentCapability"),
    );
    const vaultCreated = created.find((c) =>
      c.objectType.includes("::vault::Vault<"),
    );
    if (!capCreated || !vaultCreated) {
      throw new Error("could not locate created cap/vault in objectChanges");
    }
    capId = capCreated.objectId;
    vaultId = vaultCreated.objectId;
    console.log(`capability: ${capId}`);
    console.log(`vault:      ${vaultId}`);
  }

  // ---------- 2. ACTIVATE ----------
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${pkg}::capability::activate`,
      arguments: [
        tx.object(capId),
        tx.pure(bcs.vector(bcs.U8).serialize(Array.from(token)).toBytes()),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: kp,
      options: { showEffects: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    await dump(client, "2) activate", res.digest);
  }

  // ---------- 3. EXECUTE (draw_for_execution + log_action) ----------
  {
    const tx = new Transaction();
    const coin = tx.moveCall({
      target: `${pkg}::capability::draw_for_execution`,
      typeArguments: [SUI_TYPE],
      arguments: [
        tx.object(capId),
        tx.object(vaultId),
        tx.pure.u64(EXEC_AMOUNT),
        tx.pure.address(POOL_DUMMY),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    // In production: deepbook deposit → place_market_order → withdraw_all → transfer.
    // Here we just send the drawn coin back to ourselves to keep the PTB closed.
    tx.transferObjects([coin], tx.pure.address(me));

    tx.moveCall({
      target: `${pkg}::capability::log_action`,
      arguments: [
        tx.object(capId),
        tx.pure.u64(EXEC_AMOUNT),
        tx.pure.u64(EXEC_AMOUNT), // pretend 1:1 fill
        tx.pure.u128(1_000_000_000_000_000_000n), // price_x18 = 1.0
        tx.object(CLOCK_OBJECT_ID),
      ],
    });

    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: kp,
      options: { showEffects: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    await dump(client, "3) execute (draw + log_action)", res.digest);
  }

  // ---------- 4. SKIP (log_skip with reason) ----------
  {
    const tx = new Transaction();
    const reason = new TextEncoder().encode(
      "SUI dropped 6.2% in the last hour, exceeding your 5% threshold; deferring this week's buy.",
    );
    tx.moveCall({
      target: `${pkg}::capability::log_skip`,
      arguments: [
        tx.object(capId),
        tx.pure(bcs.vector(bcs.U8).serialize(Array.from(reason)).toBytes()),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: kp,
      options: { showEffects: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    await dump(client, "4) skip (log_skip)", res.digest);
  }

  // ---------- 5. REVOKE (funder sweeps remaining balance) ----------
  {
    const tx = new Transaction();
    tx.moveCall({
      target: `${pkg}::capability::revoke`,
      typeArguments: [SUI_TYPE],
      arguments: [
        tx.object(capId),
        tx.object(vaultId),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: kp,
      options: { showEffects: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    await dump(client, "5) revoke (refund to funder)", res.digest);
  }

  console.log("\nlifecycle complete.");
  console.log(`capability: ${capId}`);
  console.log(`vault:      ${vaultId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
