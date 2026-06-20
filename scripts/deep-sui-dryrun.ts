// SPDX-License-Identifier: Apache-2.0
//
// scripts/deep-sui-dryrun.ts — non-destructive depth check for the DEEP_SUI
// Deepbook v3 pool. Builds the same PTB shape we'd use in production
// (deposit quote → place_market_order isBid=true → withdraw_all) and runs it
// through `sui_dryRunTransactionBlock`. No tx is submitted.
//
// Goal: answer "does DEEP_SUI have any sell-side depth right now?" without
// burning gas or DEEP.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

import { CONFIG } from "../shared/config.ts";

const CLOCK_OBJECT_ID = "0x6";

// DEEP_SUI pool: base = DEEP, quote = SUI. We BUY DEEP with SUI.
const DEEP_SUI_POOL_ID =
  "0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f";

// Pool min_size = 10 DEEP (10_000_000 base units, 6 dp).
const DEEP_BUY_QUANTITY = 10_000_000n;
// Recent on-chain prices ~0.023 SUI/DEEP → 10 DEEP ≈ 0.23 SUI.
// Deposit 0.4 SUI as headroom for slippage + fees.
const SUI_DEPOSIT = 400_000_000n;

function loadKeypair(): Ed25519Keypair {
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
  const kp = loadKeypair();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const bmId = CONFIG.deepbook.balanceManagerId;

  console.log(`signer:        ${kp.toSuiAddress()}`);
  console.log(`pool:          DEEP_SUI ${DEEP_SUI_POOL_ID}`);
  console.log(`balanceMgr:    ${bmId}`);
  console.log(`buy quantity:  ${DEEP_BUY_QUANTITY} (units of DEEP, 6dp)`);
  console.log(`SUI deposit:   ${SUI_DEPOSIT} MIST`);

  const tx = new Transaction();
  tx.setSender(kp.toSuiAddress());

  // 1. Deposit SUI as quote (covers fees too — payWithDeep=false).
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::deposit`,
    typeArguments: [CONFIG.deepbook.suiType],
    arguments: [
      tx.object(bmId),
      coinWithBalance({ type: CONFIG.deepbook.suiType, balance: SUI_DEPOSIT }),
    ],
  });

  // 2. Trade proof.
  const proof = tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(bmId)],
  });

  // 3. Market BUY DEEP.
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::pool::place_market_order`,
    typeArguments: [CONFIG.deepbook.deepType, CONFIG.deepbook.suiType],
    arguments: [
      tx.object(DEEP_SUI_POOL_ID),
      tx.object(bmId),
      proof,
      tx.pure.u64(1n),
      tx.pure.u8(0),
      tx.pure.u64(DEEP_BUY_QUANTITY),
      tx.pure.bool(true), // isBid (buy base)
      tx.pure.bool(false), // payWithDeep = false → fees come out of SUI
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // 4. Sweep both sides.
  for (const t of [CONFIG.deepbook.deepType, CONFIG.deepbook.suiType]) {
    const c = tx.moveCall({
      target: `${CONFIG.deepbook.packageId}::balance_manager::withdraw_all`,
      typeArguments: [t],
      arguments: [tx.object(bmId)],
    });
    tx.transferObjects([c], tx.pure.address(kp.toSuiAddress()));
  }

  const bytes = await tx.build({ client });
  const res = await client.dryRunTransactionBlock({ transactionBlock: bytes });

  console.log(`\nstatus: ${res.effects.status.status}`);
  if (res.effects.status.error) {
    console.log(`error:  ${res.effects.status.error}`);
  }

  console.log(`\nbalance changes:`);
  for (const bc of res.balanceChanges) {
    const owner =
      typeof bc.owner === "object" && "AddressOwner" in bc.owner
        ? (bc.owner.AddressOwner as string).slice(0, 14) + "…"
        : JSON.stringify(bc.owner);
    console.log(`  ${owner}  ${bc.amount.padStart(15)}  ${bc.coinType}`);
  }

  console.log(`\nrelevant events:`);
  for (const ev of res.events ?? []) {
    if (
      ev.type.endsWith("::OrderFilled") ||
      ev.type.endsWith("::OrderPlaced") ||
      ev.type.endsWith("::OrderCanceled")
    ) {
      console.log(`  ${ev.type.split("::").slice(-2).join("::")}`);
      console.log(`    ${JSON.stringify(ev.parsedJson).slice(0, 240)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
