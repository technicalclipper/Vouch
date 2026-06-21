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
// Per-cap risk_rules are encoded on chain (Stage 5, post v2 upgrade) via
// `capability::new_risk_rule`. For legacy caps that predate the upgrade and
// carry an empty vector, we fall back to defaults matching the UI copy.

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

// Envelope embedded into the on-chain `reason` bytes so the recipient
// dashboard can render structured "why" rows (rule, market data, threshold),
// not just the LLM sentence. Frontend parses the first non-empty line as
// JSON; if absent, falls back to plain text.
export interface SkipPayload {
  v: 1;
  rule: "price_drop" | "slippage_cap";
  sentence: string;
  market: MarketSnapshot;
  threshold: { pct?: number; bps?: number; windowMs?: number };
}

function encodeSkipReason(p: SkipPayload): string {
  return JSON.stringify(p);
}

// Fallback values used only when a cap was created before risk_rules were
// encoded on chain. Match the UI defaults in DESIGN.md / chain.ts mapRiskRule.
const DEFAULT_PRICE_DROP_PCT = -5; // skip if SUI fell more than 5%
const DEFAULT_PRICE_DROP_WINDOW_MS = 60 * 60 * 1000; // 1h
const DEFAULT_SLIPPAGE_CAP_BPS = 100; // 1%

// Resolve the price-drop and slippage thresholds for a single cap. Prefers
// the values encoded on chain; falls back to defaults if the cap carries no
// rule of that type (e.g. legacy caps, or recipient explicitly disabled it).
function resolveThresholds(cap: CapState): {
  priceDrop: { pct: number; windowMs: number } | null;
  slippage: { bps: number } | null;
} {
  let priceDrop: { pct: number; windowMs: number } | null = null;
  let slippage: { bps: number } | null = null;
  for (const r of cap.riskRules) {
    if (r.ruleType === 0) {
      // threshold_bps stored as magnitude; convert back to a negative pct.
      priceDrop = {
        pct: -(Number(r.thresholdBps) / 100),
        windowMs: Number(r.windowMs),
      };
    } else if (r.ruleType === 1) {
      slippage = { bps: Number(r.thresholdBps) };
    }
  }
  if (cap.riskRules.length === 0) {
    // Legacy cap (pre-v2 upgrade) — apply defaults for both rules.
    priceDrop = { pct: DEFAULT_PRICE_DROP_PCT, windowMs: DEFAULT_PRICE_DROP_WINDOW_MS };
    slippage = { bps: DEFAULT_SLIPPAGE_CAP_BPS };
  }
  return { priceDrop, slippage };
}

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
  const { priceDrop, slippage } = resolveThresholds(cap);

  // --- 1. Price drop -----------------------------------------------------
  if (priceDrop) {
    try {
      const now = await fetchPriceNow();
      const prior = await fetchPriceAtPast(priceDrop.windowMs, now);
      const change = pctChange(prior.priceUsd, now.priceUsd);
      market.suiUsdNow = round(now.priceUsd, 4);
      market.suiUsdPrior = round(prior.priceUsd, 4);
      market.pctChange = round(change, 2);

      if (change < priceDrop.pct) {
        const threshold = {
          pct: priceDrop.pct,
          windowMs: priceDrop.windowMs,
        };
        const sentence = await generateSkipReason({
          ruleType: "price_drop",
          market,
          threshold,
          originalIntent: intentSummary(cap),
        });
        const reason = encodeSkipReason({
          v: 1,
          rule: "price_drop",
          sentence,
          market,
          threshold,
        });
        return { action: "skip", reason, market };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[risk] price_drop check failed (continuing):", err);
    }
  }

  // --- 2. Slippage cap ---------------------------------------------------
  if (slippage) {
    try {
      const poolId = cap.poolScope[0]!;
      const depth = await estimatePoolSlippage(
        client,
        poolId,
        SLIPPAGE_TARGET_SUI_BASE,
      );
      market.midPrice = round(depth.midPrice, 4);
      market.estimatedSlippageBps = depth.slippageBpsAsk;

      if (!depth.enoughDepth || depth.slippageBpsAsk > slippage.bps) {
        const threshold = { bps: slippage.bps };
        const sentence = await generateSkipReason({
          ruleType: "slippage_cap",
          market,
          threshold,
          originalIntent: intentSummary(cap),
        });
        const reason = encodeSkipReason({
          v: 1,
          rule: "slippage_cap",
          sentence,
          market,
          threshold,
        });
        return { action: "skip", reason, market };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[risk] slippage_cap check failed (continuing):", err);
    }
  }

  return { action: "execute", market };
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
