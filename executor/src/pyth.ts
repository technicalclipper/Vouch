// SPDX-License-Identifier: Apache-2.0
//
// Pyth price reader (off-chain, HTTPS) for the risk layer.
//
// We use Hermes (the Pyth off-chain price API) rather than reading the on-chain
// PriceInfoObject because:
//   - the executor doesn't need to commit prices to the trade PTB (no Pyth
//     update is needed for a market order; the orderbook is the source of truth);
//   - the risk evaluator just needs to *read* SUI/USD for now and now-window;
//     Hermes serves both via REST.
//
// Hermes endpoints used:
//   GET /v2/updates/price/latest?ids[]=<feedId>
//   GET /v2/updates/price/<unixTsSeconds>?ids[]=<feedId>
//
// Response shape (abbreviated):
//   { parsed: [ { id, price: { price: "12345678", expo: -8, publish_time }, ... } ] }
//
// Demo-mode (CLAUDE.md §6): if forcePriceDrop is true, we synthesize a prior
// price that's 10% above the current one so the price_drop rule fires reliably.

import { CONFIG } from "../../shared/config.ts";

export interface PriceObservation {
  priceUsd: number;
  publishTimeMs: number;
}

interface HermesPriceResponse {
  parsed: Array<{
    id: string;
    price: {
      price: string;
      expo: number;
      publish_time: number; // unix seconds
    };
  }>;
}

function feedId(): string {
  // Hermes accepts both 0x-prefixed and unprefixed feed ids.
  return CONFIG.pyth.suiUsdFeedId.replace(/^0x/, "");
}

function endpoint(): string {
  return CONFIG.pyth.endpoint.replace(/\/+$/, "");
}

function demoForcePriceDrop(): boolean {
  if (CONFIG.demoMode.forcePriceDrop) return true;
  return process.env.DEMO_FORCE_PRICE_DROP === "true";
}

function demoSyntheticPriceUsd(): number | null {
  if (CONFIG.demoMode.syntheticPriceUsd != null) {
    return CONFIG.demoMode.syntheticPriceUsd;
  }
  const v = process.env.DEMO_SYNTHETIC_PRICE_USD;
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function hermesGet<T>(path: string): Promise<T> {
  const res = await fetch(`${endpoint()}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`hermes ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

function decodePrice(p: { price: string; expo: number }): number {
  // Pyth carries price as int * 10^expo (expo typically negative, e.g. -8).
  return Number(p.price) * Math.pow(10, p.expo);
}

export async function fetchPriceNow(): Promise<PriceObservation> {
  const synthetic = demoSyntheticPriceUsd();
  if (synthetic != null) {
    return { priceUsd: synthetic, publishTimeMs: Date.now() };
  }
  const r = await hermesGet<HermesPriceResponse>(
    `/v2/updates/price/latest?ids[]=${feedId()}`,
  );
  const p = r.parsed[0];
  if (!p) throw new Error("hermes returned no price");
  return {
    priceUsd: decodePrice(p.price),
    publishTimeMs: p.price.publish_time * 1000,
  };
}

/**
 * Fetch the SUI/USD price ~windowMs in the past. If demo mode is on, we
 * synthesize a prior price 10% above the current one so the price_drop rule
 * trips. Be transparent in the pitch — same code reads live Pyth otherwise.
 */
export async function fetchPriceAtPast(
  windowMs: number,
  now: PriceObservation,
): Promise<PriceObservation> {
  if (demoForcePriceDrop()) {
    return {
      priceUsd: now.priceUsd * 1.1,
      publishTimeMs: now.publishTimeMs - windowMs,
    };
  }
  const targetSec = Math.floor((Date.now() - windowMs) / 1000);
  const r = await hermesGet<HermesPriceResponse>(
    `/v2/updates/price/${targetSec}?ids[]=${feedId()}`,
  );
  const p = r.parsed[0];
  if (!p) throw new Error(`hermes returned no price at ts=${targetSec}`);
  return {
    priceUsd: decodePrice(p.price),
    publishTimeMs: p.price.publish_time * 1000,
  };
}

/** Returns the percent change from `prev` to `curr` (negative = drop). */
export function pctChange(prev: number, curr: number): number {
  if (prev <= 0) return 0;
  return ((curr - prev) / prev) * 100;
}
