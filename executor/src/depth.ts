// SPDX-License-Identifier: Apache-2.0
//
// Deepbook v3 orderbook depth → expected slippage estimator.
//
// The CLOB exposes:
//   pool::mid_price<B,Q>(pool, clock): u64
//   pool::get_level2_ticks_from_mid<B,Q>(pool, ticks, clock):
//     (bid_prices, bid_qtys, ask_prices, ask_qtys)
//
// We devInspect both inside a single tx, decode the BCS, walk the ask ladder
// for a buy of `targetSuiBase`, and compute VWAP + slippage vs. mid.
// `get_level2_range` looks attractive but aborts on testnet for any range
// we tried — `_ticks_from_mid` is the canonical reader the SDK uses too.
//
// We avoid bringing in @mysten/deepbook-v3 as a runtime dep — the SDK is great
// but the lower-level Move calls + bcs decode is small and keeps our dep tree
// flat.

import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

import { CONFIG } from "../../shared/config.ts";

const CLOCK = "0x6";

// How many price ticks each side to read. 50 is plenty for a 1-SUI slippage
// estimate on a hackathon-scale pool.
const TICKS = 50n;

export interface DepthEstimate {
  midPrice: number; // DBUSDC per SUI (human units)
  vwapAsk: number; // average fill price for buying `targetSuiBase`
  slippageBpsAsk: number; // (vwapAsk - mid) / mid * 10_000
  filledQty: bigint; // base raw units actually fillable up to target
  enoughDepth: boolean; // false if asks couldn't cover target
}

/**
 * Estimate slippage on the given pool for a buy of `targetSuiBase` (raw 9dp SUI).
 *
 * Verified scaling on testnet pool 0x1c19…3a5: mid_price raw 708_000 ↔ $0.708/SUI
 * (matches Pyth). Conversion: human = raw / usdcScalar.
 */
export async function estimatePoolSlippage(
  client: SuiClient,
  poolId: string,
  targetSuiBase: bigint,
): Promise<DepthEstimate> {
  const tx = new Transaction();

  // [0] mid_price
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::pool::mid_price`,
    typeArguments: [CONFIG.deepbook.suiType, CONFIG.deepbook.usdcType],
    arguments: [tx.object(poolId), tx.object(CLOCK)],
  });

  // [1] both ladders centered at mid
  tx.moveCall({
    target: `${CONFIG.deepbook.packageId}::pool::get_level2_ticks_from_mid`,
    typeArguments: [CONFIG.deepbook.suiType, CONFIG.deepbook.usdcType],
    arguments: [
      tx.object(poolId),
      tx.pure.u64(TICKS),
      tx.object(CLOCK),
    ],
  });

  const res = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: CONFIG.agent.address,
  });

  const r0 = res.results?.[0]?.returnValues?.[0]?.[0];
  const ret1 = res.results?.[1]?.returnValues;
  if (!r0 || !ret1 || ret1.length < 4) {
    throw new Error(
      `devInspect returned incomplete values: ${res.effects?.status?.error ?? ""}`,
    );
  }
  // ret1 order: bid_prices, bid_qtys, ask_prices, ask_qtys.
  const askPricesRaw = ret1[2]![0];
  const askQtysRaw = ret1[3]![0];

  const u64Vec = bcs.vector(bcs.U64);
  const midRaw = BigInt(bcs.U64.parse(new Uint8Array(r0)) as string);
  const askPrices = (u64Vec.parse(new Uint8Array(askPricesRaw)) as string[]).map(BigInt);
  const askQtys = (u64Vec.parse(new Uint8Array(askQtysRaw)) as string[]).map(BigInt);

  const usdcScalar = CONFIG.deepbook.usdcScalar;
  const priceToHuman = (raw: bigint): number => Number(raw) / usdcScalar;

  const mid = priceToHuman(midRaw);

  // Asks are returned ascending; sort defensively in case the source changes.
  const sortedAsks = askPrices
    .map((p, i) => ({ price: p, qty: askQtys[i]! }))
    .sort((a, b) => (a.price < b.price ? -1 : 1));

  // Walk asks for VWAP up to targetSuiBase.
  let remaining = targetSuiBase;
  let weighted = 0n;
  let filled = 0n;
  for (const lvl of sortedAsks) {
    const take = lvl.qty < remaining ? lvl.qty : remaining;
    weighted += take * lvl.price;
    filled += take;
    remaining -= take;
    if (remaining <= 0n) break;
  }

  const enoughDepth = filled >= targetSuiBase;
  const vwapAskRaw = filled > 0n ? weighted / filled : 0n;
  const vwapAsk = priceToHuman(vwapAskRaw);
  const slippageBpsAsk =
    mid > 0 && vwapAsk > 0
      ? Math.round(((vwapAsk - mid) / mid) * 10_000)
      : Number.POSITIVE_INFINITY;

  return {
    midPrice: mid,
    vwapAsk,
    slippageBpsAsk,
    filledQty: filled,
    enoughDepth,
  };
}
