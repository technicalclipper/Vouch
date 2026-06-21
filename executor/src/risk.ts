// SPDX-License-Identifier: Apache-2.0
//
// Risk evaluation — CLAUDE.md §6.
//
// Two independent rules, each able to block execution:
//   1. price_drop: Pyth SUI/USD now vs. now - window; trip if pct < threshold.
//   2. slippage_cap: Deepbook v3 orderbook depth → VWAP for our trade size;
//      trip if estimated slippage > threshold.
//
// On trip we ask the LLM for a one-sentence reason and return a skip decision.
//
// Note: v1 caps don't yet encode risk_rules in a parseable on-chain form
// (Stage 5 lands the create-side encoding). Until then we use a default rule
// set that matches the UI copy. Threshold values move to per-cap once encoded.

import type { SuiClient } from "@mysten/sui/client";

import type { CapState } from "./cap.ts";
import { CONFIG } from "../../shared/config.ts";
import { fetchPriceNow, fetchPriceAtPast, pctChange } from "./pyth.ts";
import { estimatePoolSlippage } from "./depth.ts";
import { generateSkipReason } from "./llm.ts";

export type RiskDecision =
  | { action: "execute"; market: MarketSnapshot }
  | { action: "skip"; reason: string; market: MarketSnapshot };

export interface MarketSnapshot {
  suiUsdNow?: number;
  suiUsdPrior?: number;
  pctChange?: number;
  midPrice?: number;
  estimatedSlippageBps?: number;
}

// Defaults that mirror DESIGN.md / chain.ts mapRiskRule until Stage 5 encodes
// the actual values on chain.
const DEFAULT_PRICE_DROP_PCT = -5; // skip if SUI fell more than 5%
const DEFAULT_PRICE_DROP_WINDOW_MS = 60 * 60 * 1000; // 1h
const DEFAULT_SLIPPAGE_CAP_BPS = 100; // 1%

// Trade size used to model slippage. Mirrors execute.ts (1 SUI buy quantity).
const SLIPPAGE_TARGET_SUI_BASE = 1_000_000_000n;

function intentSummary(cap: CapState): string {
  const usd = Number(cap.perExecutionCap) / CONFIG.deepbook.usdcScalar;
  return `Buy ~$${usd.toFixed(0)} of SUI per slot, ${cap.executionsDone}/${cap.executionsMax} done.`;
}

export async function evaluate(
  client: SuiClient,
  cap: CapState,
): Promise<RiskDecision> {
  const market: MarketSnapshot = {};

  // --- 1. Price drop -----------------------------------------------------
  try {
    const now = await fetchPriceNow();
    const prior = await fetchPriceAtPast(DEFAULT_PRICE_DROP_WINDOW_MS, now);
    const change = pctChange(prior.priceUsd, now.priceUsd);
    market.suiUsdNow = round(now.priceUsd, 4);
    market.suiUsdPrior = round(prior.priceUsd, 4);
    market.pctChange = round(change, 2);

    if (change < DEFAULT_PRICE_DROP_PCT) {
      const reason = await generateSkipReason({
        ruleType: "price_drop",
        market,
        threshold: {
          pct: DEFAULT_PRICE_DROP_PCT,
          windowMs: DEFAULT_PRICE_DROP_WINDOW_MS,
        },
        originalIntent: intentSummary(cap),
      });
      return { action: "skip", reason, market };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[risk] price_drop check failed (continuing):", err);
  }

  // --- 2. Slippage cap ---------------------------------------------------
  try {
    const poolId = cap.poolScope[0]!;
    const depth = await estimatePoolSlippage(
      client,
      poolId,
      SLIPPAGE_TARGET_SUI_BASE,
    );
    market.midPrice = round(depth.midPrice, 4);
    market.estimatedSlippageBps = depth.slippageBpsAsk;

    if (!depth.enoughDepth || depth.slippageBpsAsk > DEFAULT_SLIPPAGE_CAP_BPS) {
      const reason = await generateSkipReason({
        ruleType: "slippage_cap",
        market,
        threshold: { bps: DEFAULT_SLIPPAGE_CAP_BPS },
        originalIntent: intentSummary(cap),
      });
      return { action: "skip", reason, market };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[risk] slippage_cap check failed (continuing):", err);
  }

  return { action: "execute", market };
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
