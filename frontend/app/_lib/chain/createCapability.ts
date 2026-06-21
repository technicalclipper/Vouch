// SPDX-License-Identifier: Apache-2.0
//
// Wallet-signed create PTB (CLAUDE.md §7.2). Mirrors scripts/dca-seed.ts but
// targets the dapp-kit wallet adapter instead of a server-side keypair. Returns
// the new cap_id, vault_id and the raw activation token so the share screen
// can render the link.
//
// What we encode on chain:
//   - Vault<DBUSDC> funded with intent.amount_per_execution * total_executions
//   - AgentCapability::create_pending with the full intent (interval, total
//     executions, per-execution cap, pool scope, risk rules, expiry)
//   - sha2_256(token) only — the raw token never touches chain
//
// What stays off chain (creator-side UI only):
//   - funder_name, recipient_label  → carried through share URL / localStorage
//   - risk_rules ALSO show up in the on-chain encoding here, but the executor
//     still uses the defaults from risk.ts until that read path is wired.

"use client";

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

import type { DCAIntent } from "../types";
import { CONFIG } from "../config";
import { suiClient } from "../chain";

// Narrowed shape of the `created` entry we care about — avoids depending on
// a specific named export from @mysten/sui/client across SDK versions.
type CreatedChange = {
  type: "created";
  objectId: string;
  objectType: string;
};

interface RiskRuleRaw {
  rule_type: number;
  threshold_bps: bigint;
  window_ms: bigint;
}

function encodeRiskRules(rules: DCAIntent["risk_rules"]): RiskRuleRaw[] {
  return rules.map((r) => {
    if (r.type === "price_drop") {
      return {
        rule_type: 0,
        // threshold_bps stored as the MAGNITUDE in bps (e.g. -5% → 500)
        threshold_bps: BigInt(Math.round(Math.abs(r.threshold_pct) * 100)),
        window_ms: BigInt(r.window_hours * 3_600_000),
      };
    }
    return {
      rule_type: 1,
      threshold_bps: BigInt(Math.round(r.threshold_pct * 100)),
      window_ms: 0n,
    };
  });
}

function intervalMsFor(frequency: DCAIntent["frequency"]): bigint {
  const DAY = 86_400_000n;
  switch (frequency) {
    case "daily":
      return DAY;
    case "weekly":
      return 7n * DAY;
    case "monthly":
      return 30n * DAY;
  }
}

/** sha2_256 via Web Crypto. */
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new Uint8Array(bytes);
  const buf = await crypto.subtle.digest("SHA-256", view.buffer);
  return new Uint8Array(buf);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export interface CreateInput {
  intent: DCAIntent;
  agentAddress: string; // CONFIG.agent.address — the executor's pubkey
  userAddress: string; // connected wallet address; used to pick funding coins
  // Demo-only override: when true the cap fires every 30s regardless of the
  // intent.frequency. Used by the create UI's "demo mode" toggle so live
  // demos can show multiple back-to-back buys without waiting a day.
  demoFastInterval?: boolean;
  // dapp-kit's signAndExecuteTransaction.mutateAsync — we accept a function
  // typed loosely so this module stays unaware of dapp-kit specifics.
  signAndExecute: (input: {
    transaction: Transaction;
  }) => Promise<{ digest: string }>;
}

export interface CreateOutput {
  cap_id: string;
  vault_id: string;
  token: string; // raw 32-char hex; activation link is /c/<token>
  digest: string;
}

const CLOCK = "0x6";

export async function createCapabilityOnChain(
  input: CreateInput,
): Promise<CreateOutput> {
  const { intent, agentAddress, userAddress, demoFastInterval, signAndExecute } =
    input;

  const usdcScalar = BigInt(CONFIG.deepbook.usdcScalar);
  const perExecCap =
    BigInt(Math.round(intent.amount_per_execution * 1_000_000)) *
    (usdcScalar / 1_000_000n);
  const budgetTotal = perExecCap * BigInt(intent.total_executions);
  const executionsMax = BigInt(intent.total_executions);
  const intervalMs = demoFastInterval
    ? 30_000n // 30s between buys for live demos
    : intervalMsFor(intent.frequency);
  const durationMs = BigInt(intent.expires_in_days) * 86_400_000n;
  const firstExecutionAt = BigInt(Date.now());

  const token = randomToken();
  const tokenBytes = new TextEncoder().encode(token);
  const tokenHash = await sha256(tokenBytes);

  // Resolve coins ourselves rather than relying on the `coinWithBalance`
  // transaction intent — the wallet extension may bundle its own SDK that
  // doesn't know how to resolve intents, which surfaces as an opaque
  // "Incorrect password" failure from the wallet.
  const coins = await suiClient.getCoins({
    owner: userAddress,
    coinType: CONFIG.deepbook.usdcType,
    limit: 50,
  });
  if (coins.data.length === 0) {
    throw new Error("No DBUSDC coins in this wallet");
  }
  // Largest balances first → fewer merges in the common case.
  const sorted = [...coins.data].sort((a, b) => {
    const da = BigInt(a.balance);
    const db = BigInt(b.balance);
    return db < da ? -1 : db > da ? 1 : 0;
  });
  const totalAvailable = sorted.reduce(
    (acc, c) => acc + BigInt(c.balance),
    0n,
  );
  if (totalAvailable < budgetTotal) {
    throw new Error(
      `Insufficient DBUSDC: need ${budgetTotal}, have ${totalAvailable}`,
    );
  }

  const tx = new Transaction();
  // Explicit sender + gas budget — some wallets (Suiet) dry-run before
  // prompting and surface failures as "Incorrect password" if either is
  // missing or the tx is otherwise unresolved.
  tx.setSender(userAddress);
  tx.setGasBudget(100_000_000n);
  // Use the largest coin as the primary; merge others into it if needed.
  const primary = tx.object(sorted[0].coinObjectId);
  if (sorted.length > 1) {
    tx.mergeCoins(
      primary,
      sorted.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  }
  // Split off exactly the amount we need to fund the vault.
  const [fundingCoin] = tx.splitCoins(primary, [tx.pure.u64(budgetTotal)]);

  // 1. Funded Vault.
  const vaultIdArg = tx.moveCall({
    target: `${CONFIG.vouchPackageLatest}::vault::create_and_share`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [fundingCoin],
  });

  // 2. Risk rules: build a vector<RiskRule> by calling `new_risk_rule` for
  // each rule (added in v2 upgrade) and packing the results with makeMoveVec.
  // Pure-arg vectors of Move structs are rejected (InvalidUsageOfPureArg), so
  // a constructor moveCall is the canonical path. The on-chain object now
  // carries the per-cap thresholds; the executor reads them in risk.ts.
  const encodedRules = encodeRiskRules(intent.risk_rules);
  const ruleResults = encodedRules.map((r) =>
    tx.moveCall({
      target: `${CONFIG.vouchPackageLatest}::capability::new_risk_rule`,
      arguments: [
        tx.pure.u8(r.rule_type),
        tx.pure.u64(r.threshold_bps),
        tx.pure.u64(r.window_ms),
      ],
    }),
  );
  const riskRulesArg = tx.makeMoveVec({
    type: `${CONFIG.vouchPackageId}::capability::RiskRule`,
    elements: ruleResults,
  });

  // 3. Pool scope: single pool in v1.
  const poolScopeBytes = bcs
    .vector(bcs.Address)
    .serialize([CONFIG.deepbook.usdcSuiPoolId])
    .toBytes();

  // 4. create_pending.
  tx.moveCall({
    target: `${CONFIG.vouchPackageLatest}::capability::create_pending`,
    arguments: [
      tx.pure.address(agentAddress),
      vaultIdArg,
      tx.pure.u8(0), // action_type = dca_buy
      tx.pure.u64(budgetTotal),
      tx.pure.u64(perExecCap),
      tx.pure(poolScopeBytes),
      tx.pure.u64(intervalMs),
      tx.pure.u64(firstExecutionAt),
      riskRulesArg,
      tx.pure.u64(executionsMax),
      tx.pure.u64(durationMs),
      tx.pure(bcs.vector(bcs.U8).serialize(Array.from(tokenHash)).toBytes()),
    ],
  });

  // Note: we don't need the clock for create_pending — Move computes expiry
  // off `activate(clock)` at recipient time. Same as scripts/dca-seed.ts.
  void CLOCK;

  // Pre-flight dry-run so we surface the actual Move/PTB error instead of
  // the wallet's generic "Incorrect password" catch-all.
  const builtBytes = await tx.build({ client: suiClient });
  const dry = await suiClient.dryRunTransactionBlock({
    transactionBlock: builtBytes,
  });
  if (dry.effects.status.status !== "success") {
    throw new Error(
      `pre-flight dry-run failed: ${dry.effects.status.error ?? "unknown"}`,
    );
  }

  const submitted = await signAndExecute({ transaction: tx });
  // dapp-kit's response is minimal; fetch the full tx to read objectChanges.
  const full = await suiClient.waitForTransaction({
    digest: submitted.digest,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (full.effects?.status?.status !== "success") {
    throw new Error(
      `create tx failed: ${full.effects?.status?.error ?? "unknown"} (${submitted.digest})`,
    );
  }
  // Find the new AgentCapability + Vault objects. We avoid SDK-version-
  // specific union types by inspecting the loose runtime shape directly.
  const created: CreatedChange[] = [];
  for (const c of full.objectChanges ?? []) {
    if (c.type === "created" && "objectId" in c && "objectType" in c) {
      created.push({
        type: "created",
        objectId: c.objectId,
        objectType: c.objectType,
      });
    }
  }
  const cap = created.find((c) =>
    c.objectType.endsWith("::capability::AgentCapability"),
  );
  const vault = created.find((c) => c.objectType.includes("::vault::Vault<"));
  if (!cap || !vault) {
    throw new Error("create tx ok but cap/vault not found in objectChanges");
  }

  return {
    cap_id: cap.objectId,
    vault_id: vault.objectId,
    token,
    digest: submitted.digest,
  };
}
