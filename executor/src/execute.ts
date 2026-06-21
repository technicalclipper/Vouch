// SPDX-License-Identifier: Apache-2.0
//
// Execution PTB builder — the "heart of the system" from CLAUDE.md §5.
//
// The PTB shape is identical to what we proved end-to-end on testnet via
// scripts/deepbook-smoke.ts (tx FL3ZZxDYN4T83gzzC1LUCbdJR4Kb2obcrTfgXwn7T5L1).
// The only addition is the capability::draw_for_execution wrapper at the top
// and capability::log_action at the bottom — these are what bind the trade
// to the on-chain permission slip.
//
// Atomic. Any failed assertion or pool abort reverts everything. The agent
// cannot half-execute.

import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { CONFIG } from "../../shared/config.ts";
import type { CapState } from "./cap.ts";

const CLOCK = "0x6";

// Pool min_size for SUI_DBUSDC (read live on chain; see progress.md).
// 1 SUI per execution is the chain-enforced minimum trade size.
const SUI_BUY_QUANTITY = 1_000_000_000n; // 1 SUI in base units (9 dp)

export interface ExecutionResult {
  digest: string;
  amountInUsed: bigint; // DBUSDC budget drawn from the vault
  amountOut: bigint; // SUI received by the recipient
}

export async function executeOne(
  client: SuiClient,
  kp: Ed25519Keypair,
  cap: CapState,
): Promise<ExecutionResult> {
  if (cap.poolScope.length === 0) {
    throw new Error(`cap ${cap.capId} has empty pool_scope`);
  }
  // For DCA we currently route through whichever pool the cap was scoped to.
  // Validated again on chain by assert_pool_in_scope inside draw_for_execution.
  const poolId = cap.poolScope[0]!;

  // Budget we'll draw from the vault. Bound by per_execution_cap on chain.
  const amountIn = cap.perExecutionCap;

  const tx = new Transaction();

  // 1. ATOMIC: assert_executable + assert_pool_in_scope + reserve_budget
  //    + vault::withdraw. Returns Coin<DBUSDC>.
  const dbusdcCoin = tx.moveCall({
    target: `${CONFIG.vouchPackageLatest}::capability::draw_for_execution`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [
      tx.object(cap.capId),
      tx.object(cap.vaultId),
      tx.pure.u64(amountIn),
      tx.pure.address(poolId),
      tx.object(CLOCK),
    ],
  });

  // 2. Deposit DBUSDC into the agent's shared BalanceManager.
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::deposit`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [tx.object(CONFIG.deepbook.balanceManagerId), dbusdcCoin],
  });

  // 3. Trade proof (sender must be the BM owner — that's the agent).
  const proof = tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(CONFIG.deepbook.balanceManagerId)],
  });

  // 4. Market BUY SUI with DBUSDC. Fees in input coin (no DEEP needed).
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::pool::place_market_order`,
    typeArguments: [CONFIG.deepbook.suiType, CONFIG.deepbook.usdcType],
    arguments: [
      tx.object(poolId),
      tx.object(CONFIG.deepbook.balanceManagerId),
      proof,
      tx.pure.u64(BigInt(Date.now())), // client_order_id (unique per tx)
      tx.pure.u8(0), // self_matching_allowed
      tx.pure.u64(SUI_BUY_QUANTITY),
      tx.pure.bool(true), // is_bid
      tx.pure.bool(false), // pay_with_deep = false
      tx.object(CLOCK),
    ],
  });

  // 5. Sweep SUI out of the BM → recipient.
  const suiCoin = tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::withdraw_all`,
    typeArguments: [CONFIG.deepbook.suiType],
    arguments: [tx.object(CONFIG.deepbook.balanceManagerId)],
  });
  tx.transferObjects([suiCoin], tx.pure.address(cap.owner));

  // 6. Sweep DBUSDC dust (unspent budget) → recipient. Small inefficiency:
  //    per_execution_cap is reserved up-front but the actual fill costs less.
  //    Sending dust to the recipient (vs. agent or funder) keeps the agent
  //    custody-free and the funder's accounting clean — recipient sees the
  //    full reserved amount as "incoming".
  const dust = tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::balance_manager::withdraw_all`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [tx.object(CONFIG.deepbook.balanceManagerId)],
  });
  tx.transferObjects([dust], tx.pure.address(cap.owner));

  // 7. log_action — advances schedule, increments executions_done, emits event.
  //    price_x18 = 0 placeholder; dashboard reads the OrderFilled event for
  //    the actual fill price. Fixing this requires either a result-passing
  //    refactor or an oracle read; tracked for Stage 4.
  tx.moveCall({
    target: `${CONFIG.vouchPackageLatest}::capability::log_action`,
    arguments: [
      tx.object(cap.capId),
      tx.pure.u64(amountIn),
      tx.pure.u64(SUI_BUY_QUANTITY),
      tx.pure.u128(0n),
      tx.object(CLOCK),
    ],
  });

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: res.digest });

  if (res.effects?.status?.status !== "success") {
    throw new Error(
      `execute PTB failed: ${res.effects?.status?.error ?? "unknown"} (digest ${res.digest})`,
    );
  }

  return {
    digest: res.digest,
    amountInUsed: amountIn,
    amountOut: SUI_BUY_QUANTITY,
  };
}
