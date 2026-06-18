// SPDX-License-Identifier: Apache-2.0
//
// scripts/deepbook-smoke.ts — the "kill the unknowns" Deepbook v3 throwaway tx
// CLAUDE.md §9 mandates before anything in Stage 2 ships.
//
// PTB shapes are taken verbatim from the @mysten/deepbook-v3 SDK so we know
// they match the deployed package's ABI:
//   - balance_manager::new + share
//   - balance_manager::deposit (owner path)
//   - balance_manager::generate_proof_as_owner
//   - pool::place_market_order<Base, Quote>
//   - balance_manager::withdraw / withdraw_all
//
// Two phases:
//   `npm run deepbook -- init`   → creates+shares a BalanceManager; prints ID.
//                                  Only SUI gas needed. Run this once and
//                                  copy the printed ID into shared/config.ts
//                                  (deepbook.balanceManagerId).
//
//   `npm run deepbook -- trade`  → deposits a small amount of DBUSDC + DEEP
//                                  into the existing BalanceManager and
//                                  places a market buy on SUI_DBUSDC.
//                                  REQUIRES testnet DBUSDC + DEEP in the
//                                  wallet — see progress.md blockers.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

import { CONFIG } from "../shared/config.ts";

const CLOCK_OBJECT_ID = "0x6";

function loadKeypairFromSuiKeystore(): Ed25519Keypair {
  const keystorePath = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const entries: string[] = JSON.parse(readFileSync(keystorePath, "utf8"));
  for (const entry of entries) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0x00) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (kp.toSuiAddress() === CONFIG.agent.address) return kp;
  }
  throw new Error(
    `No Ed25519 key for ${CONFIG.agent.address} in ${keystorePath}`,
  );
}

async function initBalanceManager(client: SuiClient, kp: Ed25519Keypair) {
  const tx = new Transaction();
  const bm = tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::new`,
  });
  tx.moveCall({
    target: "0x2::transfer::public_share_object",
    typeArguments: [
      `${CONFIG.deepbook.packageId}::balance_manager::BalanceManager`,
    ],
    arguments: [bm],
  });

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  console.log(`tx: ${res.digest}`);

  if (res.effects?.status?.status !== "success") {
    console.error(res.effects?.status);
    throw new Error("init failed");
  }
  const created = (res.objectChanges ?? []).filter(
    (c) => c.type === "created",
  ) as Array<{ type: "created"; objectId: string; objectType: string }>;
  const bmCreated = created.find((c) =>
    c.objectType.endsWith("::balance_manager::BalanceManager"),
  );
  if (!bmCreated) throw new Error("BalanceManager not found in objectChanges");
  console.log(`\nBalanceManager: ${bmCreated.objectId}`);
  console.log(
    `\nCopy this into shared/config.ts → deepbook.balanceManagerId.`,
  );
}

async function marketBuy(client: SuiClient, kp: Ed25519Keypair) {
  const bmId = CONFIG.deepbook.balanceManagerId;
  if (!bmId || bmId === "0x0") {
    throw new Error(
      "deepbook.balanceManagerId not set. Run `npm run deepbook -- init` first.",
    );
  }

  // Default to input-coin fees so we don't require testnet DEEP (which has
  // no public faucet). Pass `--with-deep` to force DEEP fees instead.
  const payWithDeep = process.argv.includes("--with-deep");

  // Tiny amounts so we don't fight thin testnet liquidity.
  // quantity is in BASE units (SUI) — we're buying SUI with DBUSDC.
  // 0.01 SUI = 10_000_000 MIST. Cap DBUSDC deposit at 1 DBUSDC = 1_000_000
  // micro-DBUSDC (6 dp). DEEP for fees only if payWithDeep is true.
  const SUI_BUY_QUANTITY = 10_000_000n; // 0.01 SUI worth of base, in SUI scalar
  const DBUSDC_DEPOSIT = 1_000_000n; // 1 DBUSDC
  const DEEP_DEPOSIT = 1_000_000n; // 1 DEEP — only deposited if payWithDeep

  const tx = new Transaction();

  // 1. Deposit DBUSDC (the quote we're spending — also covers the fee when
  //    payWithDeep is false).
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::deposit`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [
      tx.object(bmId),
      coinWithBalance({ type: CONFIG.deepbook.usdcType, balance: DBUSDC_DEPOSIT }),
    ],
  });

  // 2. Deposit DEEP only when paying fees in DEEP.
  if (payWithDeep) {
    tx.moveCall({
      target: `${CONFIG.deepbook.packageId}::balance_manager::deposit`,
      typeArguments: [CONFIG.deepbook.deepType],
      arguments: [
        tx.object(bmId),
        coinWithBalance({ type: CONFIG.deepbook.deepType, balance: DEEP_DEPOSIT }),
      ],
    });
  }

  // 3. Generate the trade proof.
  const proof = tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(bmId)],
  });

  // 4. Place a market BUY on SUI_DBUSDC. isBid=true means buy base with quote.
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::pool::place_market_order`,
    typeArguments: [CONFIG.deepbook.suiType, CONFIG.deepbook.usdcType],
    arguments: [
      tx.object(CONFIG.deepbook.usdcSuiPoolId),
      tx.object(bmId),
      proof,
      tx.pure.u64(1n), // client_order_id
      tx.pure.u8(0), // self_matching_option: SELF_MATCHING_ALLOWED
      tx.pure.u64(SUI_BUY_QUANTITY),
      tx.pure.bool(true), // isBid
      tx.pure.bool(payWithDeep),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // 5. Sweep any filled SUI + leftover DBUSDC (+ DEEP if used) back to us.
  const sweepTypes = [CONFIG.deepbook.suiType, CONFIG.deepbook.usdcType];
  if (payWithDeep) sweepTypes.push(CONFIG.deepbook.deepType);
  for (const t of sweepTypes) {
    const c = tx.moveCall({
      target: `${CONFIG.deepbook.packageId}::balance_manager::withdraw_all`,
      typeArguments: [t],
      arguments: [tx.object(bmId)],
    });
    tx.transferObjects([c], tx.pure.address(CONFIG.agent.address));
  }

  console.log(`payWithDeep: ${payWithDeep}`);

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  console.log(`tx: ${res.digest}`);
  if (res.effects?.status?.status !== "success") {
    console.error(res.effects?.status);
    throw new Error("market buy failed");
  }
  for (const ev of res.events ?? []) {
    console.log(`event: ${ev.type}`);
    console.log(`  ${JSON.stringify(ev.parsedJson)}`);
  }
}

async function main() {
  const mode = process.argv[2];
  if (!mode || (mode !== "init" && mode !== "trade")) {
    console.error("usage: npm run deepbook -- (init|trade)");
    process.exit(1);
  }
  const kp = loadKeypairFromSuiKeystore();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  console.log(`signer: ${kp.toSuiAddress()}`);

  if (mode === "init") await initBalanceManager(client, kp);
  else await marketBuy(client, kp);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
