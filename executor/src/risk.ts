// SPDX-License-Identifier: Apache-2.0
//
// Risk evaluation — CLAUDE.md §6.
//
// Stage 2: stub. Always returns `execute`. Stage 4 fills this with the real
// Pyth price-drop + Deepbook depth slippage-cap rules + an LLM-generated skip
// reason. The interface here is the contract those rules must satisfy.

import type { CapState } from "./cap.ts";

export type RiskDecision =
  | { action: "execute" }
  | { action: "skip"; reason: string };

export async function evaluate(_cap: CapState): Promise<RiskDecision> {
  // Stage 4 will:
  //   - fetch live SUI/USD from Pyth (or demoMode override)
  //   - read Deepbook depth on cap.poolScope[0]
  //   - evaluate cap.risk_rules (stored on chain, read off-chain per spec)
  //   - if any rule trips: return { action: "skip", reason: <LLM string> }
  return { action: "execute" };
}
