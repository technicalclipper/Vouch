// In-memory + localStorage-backed mock of the on-chain capability state.
// Replaced in Stage 3/5 with real Sui SDK reads/writes. Kept intentionally
// simple — same shape the chain will produce.

"use client";

import type { Capability, ActivityEvent, DCAIntent } from "./types";

const KEY = "vouch.mock.v1";

type Store = { capabilities: Capability[] };

function load(): Store {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      save(s);
      return s;
    }
    return JSON.parse(raw) as Store;
  } catch {
    const s = seed();
    save(s);
    return s;
  }
}

function save(s: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  // Notify any subscribed components in this tab.
  window.dispatchEvent(new CustomEvent("vouch:store"));
}

// ---------- Seed data ----------
function seed(): Store {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;

  const intent: DCAIntent = {
    action: "dca_buy",
    asset_in: "USDC",
    asset_out: "SUI",
    amount_per_execution: 50,
    frequency: "weekly",
    day_of_week: "monday",
    total_executions: 8,
    risk_rules: [
      { type: "price_drop", window_hours: 1, threshold_pct: -5 },
      { type: "slippage_cap", threshold_pct: 1 },
    ],
    expires_in_days: 56,
  };

  const demo: Capability = {
    id: "cap_demo_1",
    token: "demo",
    funder_name: "Alex",
    funder_address: "0xa1ex0000000000000000000000000000000000000000000000000000000000",
    recipient_label: "Mom",
    status: "active",
    intent,
    budget_total: 400,
    budget_remaining: 300,
    executions_done: 2,
    total_sui_bought: 41.6,
    created_at: now - 3 * week,
    activated_at: now - 3 * week + 2 * 60 * 60 * 1000,
    expires_at: now + 56 * 24 * 60 * 60 * 1000,
    next_execution_at: nextMonday(now),
    events: [
      ev("created", now - 3 * week, "cap_demo_1"),
      ev("activated", now - 3 * week + 2 * 60 * 60 * 1000, "cap_demo_1"),
      {
        ...ev("bought", now - 2 * week, "cap_demo_1"),
        amount_in: 50,
        amount_out: 21.3,
        price_usd: 2.35,
      },
      {
        ...ev("skipped", now - week, "cap_demo_1"),
        reason:
          "SUI dropped 6.2% in the last hour, more than the 5% you allowed — we waited.",
      },
      {
        ...ev("bought", now - 3 * 24 * 60 * 60 * 1000, "cap_demo_1"),
        amount_in: 50,
        amount_out: 20.3,
        price_usd: 2.46,
      },
    ],
  };

  // A pending one to show the recipient activation landing on `/c/pending`.
  const pending: Capability = {
    ...demo,
    id: "cap_pending_1",
    token: "pending",
    status: "pending",
    activated_at: undefined,
    owner_address: undefined,
    budget_remaining: 400,
    executions_done: 0,
    total_sui_bought: 0,
    created_at: now - 60 * 60 * 1000,
    next_execution_at: nextMonday(now),
    events: [ev("created", now - 60 * 60 * 1000, "cap_pending_1")],
  };

  return { capabilities: [demo, pending] };
}

function ev(
  kind: ActivityEvent["kind"],
  ts: number,
  capId: string
): ActivityEvent {
  return {
    id: `${kind}_${ts}_${Math.random().toString(36).slice(2, 7)}`,
    cap_id: capId,
    timestamp: ts,
    kind,
  };
}

function nextMonday(from: number): number {
  const d = new Date(from);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = (1 - day + 7) % 7 || 7; // always next Monday
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(15, 0, 0, 0);
  return d.getTime();
}

// ---------- Public API ----------

export function getAll(): Capability[] {
  return load().capabilities;
}

export function getByToken(token: string): Capability | undefined {
  return load().capabilities.find((c) => c.token === token);
}

export function getById(id: string): Capability | undefined {
  return load().capabilities.find((c) => c.id === id);
}

export function activate(token: string, ownerAddress: string) {
  const s = load();
  const c = s.capabilities.find((c) => c.token === token);
  if (!c) return;
  c.status = "active";
  c.owner_address = ownerAddress;
  c.activated_at = Date.now();
  c.events.push({ ...ev("activated", Date.now(), c.id) });
  save(s);
}

export function revoke(id: string) {
  const s = load();
  const c = s.capabilities.find((c) => c.id === id);
  if (!c) return;
  c.status = "stopped";
  c.events.push({ ...ev("stopped", Date.now(), c.id) });
  save(s);
}

// Demo affordance — simulate the executor running once.
// If `forceSkip` is true, the synthetic price-drop rule trips.
export function runNow(id: string, opts: { forceSkip?: boolean } = {}) {
  const s = load();
  const c = s.capabilities.find((c) => c.id === id);
  if (!c || c.status !== "active") return;

  const week = 7 * 24 * 60 * 60 * 1000;

  if (opts.forceSkip) {
    c.events.push({
      ...ev("skipped", Date.now(), c.id),
      reason:
        "SUI dropped 6.2% in the last hour, more than the 5% you allowed — we waited until things calmed down.",
    });
    c.next_execution_at = Date.now() + week;
    save(s);
    return;
  }

  const price = 2.4 + (Math.random() - 0.5) * 0.2;
  const amount = c.intent.amount_per_execution;
  if (amount > c.budget_remaining) return;
  const sui = amount / price;
  c.budget_remaining -= amount;
  c.executions_done += 1;
  c.total_sui_bought += sui;
  c.events.push({
    ...ev("bought", Date.now(), c.id),
    amount_in: amount,
    amount_out: round(sui, 2),
    price_usd: round(price, 3),
  });
  if (c.executions_done >= c.intent.total_executions) c.status = "done";
  c.next_execution_at = Date.now() + week;
  save(s);
}

export function createCapability(args: {
  intent: DCAIntent;
  funder_name: string;
  recipient_label?: string;
}): Capability {
  const s = load();
  const id = `cap_${Math.random().toString(36).slice(2, 9)}`;
  const token = Math.random().toString(36).slice(2, 10);
  const now = Date.now();
  const total = args.intent.amount_per_execution * args.intent.total_executions;
  const cap: Capability = {
    id,
    token,
    funder_name: args.funder_name,
    funder_address: "0xself",
    recipient_label: args.recipient_label,
    status: "pending",
    intent: args.intent,
    budget_total: total,
    budget_remaining: total,
    executions_done: 0,
    total_sui_bought: 0,
    created_at: now,
    expires_at: now + args.intent.expires_in_days * 24 * 60 * 60 * 1000,
    next_execution_at: nextMonday(now),
    events: [ev("created", now, id)],
  };
  s.capabilities.push(cap);
  save(s);
  return cap;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// Subscribe helper — components can re-read after mutations.
export function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("vouch:store", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("vouch:store", handler);
    window.removeEventListener("storage", handler);
  };
}

// Reset all mock data to seed. Useful from the dev landing page.
export function resetAll() {
  const s = seed();
  save(s);
}
