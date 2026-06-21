// SPDX-License-Identifier: Apache-2.0
//
// Stage 3 chain-read layer. Reads `AgentCapability` shared objects + the
// five event types emitted by `vouch::capability`, and projects them into
// the existing `Capability` UI shape so components don't churn.
//
// Read-only for now. Write paths (zkLogin-signed activate + revoke) land in
// follow-up commits.

"use client";

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { bcs } from "@mysten/sui/bcs";

import { CONFIG } from "./config";
import type {
  ActivityEvent,
  Capability,
  CapabilityStatus,
  DCAIntent,
  RiskRule,
  SkipMeta,
} from "./types";

export const suiClient = new SuiJsonRpcClient({
  url: CONFIG.rpcUrl,
  network: CONFIG.network,
});

type EventCursor = { txDigest: string; eventSeq: string } | null | undefined;

const PKG = CONFIG.vouchPackageId;

// Event type strings as emitted by `vouch::capability` (must match Move).
const EVENT_CREATED = `${PKG}::capability::CapabilityCreated`;
const EVENT_ACTIVATED = `${PKG}::capability::CapabilityActivated`;
const EVENT_EXECUTED = `${PKG}::capability::ActionExecuted`;
const EVENT_SKIPPED = `${PKG}::capability::ExecutionSkipped`;
const EVENT_REVOKED = `${PKG}::capability::CapabilityRevoked`;

// ---------- AgentCapability on-chain shape ----------
// Mirrors `contracts/sources/capability.move`. The Sui RPC returns numeric
// fields as strings; we parse to bigint where they're u64 or u128.
interface ChainCapFields {
  id: { id: string };
  owner: string;
  funder: string;
  agent_pubkey: string;
  vault_id: string;
  action_type: number;
  budget_total: string;
  budget_remaining: string;
  per_execution_cap: string;
  pool_scope: string[];
  schedule: { fields: { interval_ms: string; next_execution_at: string } };
  risk_rules: unknown[];
  executions_done: string;
  executions_max: string;
  expires_at: string;
  revoked: boolean;
  activation_token_hash: number[];
  active: boolean;
  duration_ms: string;
}

// ---------- Public API ----------

export async function loadChainCapability(
  capId: string,
): Promise<Capability | undefined> {
  const obj = await suiClient.getObject({
    id: capId,
    options: { showContent: true },
  });
  if (
    !obj.data ||
    obj.data.content?.dataType !== "moveObject" ||
    !obj.data.content.type.endsWith("::capability::AgentCapability")
  ) {
    return undefined;
  }
  const fields = obj.data.content.fields as unknown as ChainCapFields;
  const events = await loadChainEvents(capId);
  return mapChainToCapability(fields, events);
}

// Token lookup: sha256(token bytes) == activation_token_hash on a pending
// capability. We walk CapabilityCreated events to find candidates, then
// load the matching shared object to check the hash + state.
//
// Once activated, activation_token_hash is cleared, so this only ever
// returns *pending* capabilities (which is exactly what the activation
// landing page wants).
export async function loadChainCapabilityByToken(
  token: string,
): Promise<Capability | undefined> {
  const tokenBytes = new TextEncoder().encode(token);
  const tokenHash = await sha256(tokenBytes);

  console.time("[token-lookup] total");
  const seen = new Set<string>();
  let cursor: EventCursor = null;
  for (let page = 0; page < 10; page++) {
    console.time(`[token-lookup] page ${page} queryEvents`);
    const res = await suiClient.queryEvents({
      query: { MoveEventType: EVENT_CREATED },
      cursor: cursor ?? null,
      limit: 50,
      order: "descending",
    });
    console.timeEnd(`[token-lookup] page ${page} queryEvents`);
    console.log(`[token-lookup] page ${page} returned ${res.data.length} events`);

    const candidates: string[] = [];
    for (const ev of res.data) {
      const capId = (ev.parsedJson as { cap_id?: string })?.cap_id;
      if (!capId || seen.has(capId)) continue;
      seen.add(capId);
      candidates.push(capId);
    }
    console.time(`[token-lookup] page ${page} getObject x${candidates.length}`);
    const rawObjs = await Promise.all(
      candidates.map((id) =>
        suiClient.getObject({ id, options: { showContent: true } }),
      ),
    );
    console.timeEnd(`[token-lookup] page ${page} getObject x${candidates.length}`);
    for (let i = 0; i < rawObjs.length; i++) {
      const fields = (rawObjs[i].data?.content as { fields?: ChainCapFields })
        ?.fields;
      if (!fields) continue;
      if (
        fields.activation_token_hash.length === tokenHash.length &&
        fields.activation_token_hash.every((b, j) => b === tokenHash[j])
      ) {
        console.log(`[token-lookup] MATCH cap ${candidates[i]}`);
        console.time(`[token-lookup] loadChainEvents`);
        const events = await loadChainEvents(candidates[i]);
        console.timeEnd(`[token-lookup] loadChainEvents`);
        console.timeEnd("[token-lookup] total");
        return mapChainToCapability(fields, events);
      }
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor as EventCursor;
  }
  console.timeEnd("[token-lookup] total");
  return undefined;
}

// Creator dashboard read: every capability whose `funder == address`. Walks
// `CapabilityCreated` events newest→oldest (bounded), loads each shared
// object, and projects via the same mapper used by the recipient flow.
// Returns newest-created first so the list reads top-down by recency.
export async function loadChainCapabilitiesByFunder(
  funder: string,
): Promise<Capability[]> {
  const normalized = funder.toLowerCase();
  const seen = new Set<string>();
  const matchedIds: string[] = [];
  let cursor: EventCursor = null;
  for (let page = 0; page < 10; page++) {
    const res = await suiClient.queryEvents({
      query: { MoveEventType: EVENT_CREATED },
      cursor: cursor ?? null,
      limit: 50,
      order: "descending",
    });
    for (const ev of res.data) {
      const json = ev.parsedJson as { cap_id?: string; funder?: string };
      if (!json.cap_id || seen.has(json.cap_id)) continue;
      seen.add(json.cap_id);
      if ((json.funder ?? "").toLowerCase() === normalized) {
        matchedIds.push(json.cap_id);
      }
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor as EventCursor;
  }

  // Load object + events for each match, in parallel. Drop any that fail to
  // load (e.g. shared object got deleted) rather than failing the whole list.
  const settled = await Promise.all(
    matchedIds.map(async (id) => {
      try {
        return await loadChainCapability(id);
      } catch {
        return undefined;
      }
    }),
  );
  return settled.filter((c): c is Capability => !!c);
}

// Pick the most recent PENDING and most recent ACTIVE capability on chain.
// Used by the dev landing page to point its "First-time activation" and
// "Already-active dashboard" buttons at real on-chain caps instead of the
// mock-store seeds. Walks CapabilityCreated events newest→oldest, loads
// each candidate object, and stops as soon as both slots are filled (or
// we exhaust the bounded page budget).
export async function pickSampleChainCaps(): Promise<{
  pending?: Capability;
  active?: Capability;
}> {
  const out: { pending?: Capability; active?: Capability } = {};
  const seen = new Set<string>();
  let cursor: EventCursor = null;
  for (let page = 0; page < 6; page++) {
    const res = await suiClient.queryEvents({
      query: { MoveEventType: EVENT_CREATED },
      cursor: cursor ?? null,
      limit: 50,
      order: "descending",
    });
    for (const ev of res.data) {
      const capId = (ev.parsedJson as { cap_id?: string })?.cap_id;
      if (!capId || seen.has(capId)) continue;
      seen.add(capId);
      try {
        const cap = await loadChainCapability(capId);
        if (!cap) continue;
        if (!out.pending && cap.status === "pending") out.pending = cap;
        if (!out.active && cap.status === "active") out.active = cap;
        if (out.pending && out.active) return out;
      } catch {
        // skip caps we can't load
      }
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor as EventCursor;
  }
  return out;
}

// Read every capability-scoped event ordered oldest→newest. We don't have
// a per-cap event filter in Move (events are package-scoped), so we ask
// the RPC for each type and filter by cap_id client-side. Bounded pagination.
export async function loadChainEvents(capId: string): Promise<ActivityEvent[]> {
  const types = [
    EVENT_CREATED,
    EVENT_ACTIVATED,
    EVENT_EXECUTED,
    EVENT_SKIPPED,
    EVENT_REVOKED,
  ];
  const out: ActivityEvent[] = [];
  for (const t of types) {
    let cursor: EventCursor = null;
    for (let page = 0; page < 5; page++) {
      const res = await suiClient.queryEvents({
        query: { MoveEventType: t },
        cursor: cursor ?? null,
        limit: 50,
        order: "descending",
      });
      for (const ev of res.data) {
        const json = ev.parsedJson as Record<string, unknown>;
        if (json.cap_id !== capId) continue;
        const ts = Number(ev.timestampMs ?? 0);
        const digest = ev.id?.txDigest;
        out.push(eventFromChain(t, json, ts, capId, digest));
      }
      if (!res.hasNextPage || !res.nextCursor) break;
      cursor = res.nextCursor as EventCursor;
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

// ---------- Internals ----------

function eventFromChain(
  type: string,
  json: Record<string, unknown>,
  ts: number,
  capId: string,
  digest?: string,
): ActivityEvent {
  const base = {
    id: `${type}_${ts}_${Math.random().toString(36).slice(2, 7)}`,
    cap_id: capId,
    timestamp: ts,
    digest,
  };
  if (type === EVENT_CREATED) return { ...base, kind: "created" };
  if (type === EVENT_ACTIVATED) return { ...base, kind: "activated" };
  if (type === EVENT_REVOKED) return { ...base, kind: "stopped" };
  if (type === EVENT_EXECUTED) {
    const amountIn = Number(json.amount_in ?? 0) / CONFIG.deepbook.usdcScalar;
    const amountOut = Number(json.amount_out ?? 0) / CONFIG.deepbook.suiScalar;
    // price_x18 is u128 with 18 decimals; convert to a sane USD figure if
    // present. We carry 0 in the v1 PTB (dashboard derives price from
    // amount_in / amount_out below).
    const priceUsd =
      amountOut > 0 ? round(amountIn / amountOut, 4) : undefined;
    return {
      ...base,
      kind: "bought",
      amount_in: amountIn,
      amount_out: amountOut,
      price_usd: priceUsd,
    };
  }
  if (type === EVENT_SKIPPED) {
    const reasonBytes = (json.reason as number[]) ?? [];
    const raw = new TextDecoder().decode(new Uint8Array(reasonBytes));
    // Structured envelope (see executor SkipPayload): try JSON first; fall
    // back to plain text so older skips + manual log_skip calls still render.
    if (raw.startsWith("{")) {
      try {
        const p = JSON.parse(raw) as {
          v?: number;
          rule?: "price_drop" | "slippage_cap";
          sentence?: string;
          market?: SkipMeta["market"];
          threshold?: SkipMeta["threshold"];
        };
        if (p.v === 1 && p.rule && p.sentence) {
          return {
            ...base,
            kind: "skipped",
            reason: p.sentence,
            skip_meta: {
              rule: p.rule,
              market: p.market ?? {},
              threshold: p.threshold ?? {},
            },
          };
        }
      } catch {
        // fall through
      }
    }
    return { ...base, kind: "skipped", reason: raw };
  }
  return { ...base, kind: "created" };
}

function mapChainToCapability(
  f: ChainCapFields,
  events: ActivityEvent[],
): Capability {
  const usdcScalar = CONFIG.deepbook.usdcScalar;
  const suiScalar = CONFIG.deepbook.suiScalar;

  const budgetTotal = Number(f.budget_total) / usdcScalar;
  const budgetRemaining = Number(f.budget_remaining) / usdcScalar;
  const totalSuiBought = events
    .filter((e) => e.kind === "bought")
    .reduce((acc, e) => acc + (e.amount_out ?? 0), 0);

  const status: CapabilityStatus = f.revoked
    ? "stopped"
    : !f.active
      ? "pending"
      : Number(f.executions_done) >= Number(f.executions_max)
        ? "done"
        : "active";

  const intent: DCAIntent = {
    action: "dca_buy",
    asset_in: "USDC",
    asset_out: "SUI",
    amount_per_execution: Number(f.per_execution_cap) / usdcScalar,
    // We don't have a structured frequency on chain — just interval_ms.
    // Pick the closest human label so existing copy renders.
    frequency: intervalToFrequency(BigInt(f.schedule.fields.interval_ms)),
    total_executions: Number(f.executions_max),
    risk_rules: decodeRiskRules(f.risk_rules),
    // Approximate; the chain stores absolute expires_at, not days.
    expires_in_days: Math.max(
      1,
      Math.round((Number(f.expires_at) - Date.now()) / 86_400_000),
    ),
  };

  // First created event timestamp, else fallback to expires_at - duration_ms.
  const createdEvent = events.find((e) => e.kind === "created");
  const activatedEvent = events.find((e) => e.kind === "activated");

  return {
    id: f.id.id,
    token: "", // resolved separately when navigating by token
    vault_id: f.vault_id,
    funder_name: shortAddr(f.funder),
    funder_address: f.funder,
    owner_address: f.active ? f.owner : undefined,
    recipient_label: undefined,
    status,
    intent,
    budget_total: budgetTotal,
    budget_remaining: budgetRemaining,
    executions_done: Number(f.executions_done),
    total_sui_bought: round(totalSuiBought, 4),
    created_at: createdEvent?.timestamp ?? Number(f.expires_at) - Number(f.duration_ms),
    activated_at: activatedEvent?.timestamp,
    expires_at: Number(f.expires_at),
    next_execution_at: Number(f.schedule.fields.next_execution_at),
    events,
  };
}

// Decode `vector<RiskRule>` from the AgentCapability shared object.
// Sui RPC returns struct values as either `{ type, fields: {...} }` or as a
// flat object — tolerate both. Threshold_bps is stored as magnitude (e.g. a
// -5% price-drop rule is bps=500); we restore the sign on the way back.
function decodeRiskRules(raw: unknown[]): RiskRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): RiskRule[] => {
    const inner = (entry as { fields?: unknown }).fields ?? entry;
    const r = inner as {
      rule_type?: number | string;
      threshold_bps?: number | string;
      window_ms?: number | string;
    };
    const ruleType = Number(r.rule_type);
    const bps = Number(r.threshold_bps);
    const windowMs = Number(r.window_ms);
    if (ruleType === 0) {
      return [
        {
          type: "price_drop",
          window_hours: Math.max(1, Math.round(windowMs / 3_600_000)),
          threshold_pct: -(bps / 100),
        },
      ];
    }
    if (ruleType === 1) {
      return [{ type: "slippage_cap", threshold_pct: bps / 100 }];
    }
    return [];
  });
}

function intervalToFrequency(ms: bigint): DCAIntent["frequency"] {
  const day = 86_400_000n;
  if (ms <= day) return "daily";
  if (ms <= 7n * day) return "weekly";
  return "monthly";
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

async function sha256(bytes: Uint8Array): Promise<number[]> {
  // Cast: subtle.digest types want `BufferSource` but TS narrows the
  // Uint8Array buffer to ArrayBufferLike (including SharedArrayBuffer).
  // crypto is happy with either at runtime.
  const buf = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return Array.from(new Uint8Array(buf));
}

// Quietly keep bcs in scope; future activate/revoke PTBs will use it.
void bcs;
