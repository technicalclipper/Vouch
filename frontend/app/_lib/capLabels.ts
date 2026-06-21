// SPDX-License-Identifier: Apache-2.0
//
// Creator-side label store. The chain only knows funder + intent + budget;
// the "nickname" the creator picks for the recipient is private metadata
// that never goes on chain. We persist it in localStorage keyed by cap_id
// so the creator dashboard can render "Mom" instead of "Untitled" after a
// page reload.
//
// Read on /dashboard list + drill-in; written by /create on a successful
// chain create.

"use client";

const KEY = "vouch.caplabels";

export interface CapLabel {
  label?: string;
  funderName?: string;
  // Raw activation token. The chain stores only sha2_256(token), so the
  // shareable `/c/<token>` URL is unrecoverable from chain state alone.
  // Persisting it creator-side lets the dashboard re-render the share link
  // anytime after creation (same browser/profile only — by design, since
  // the token is a creator-private bearer credential).
  token?: string;
}

type Store = Record<string, CapLabel>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // quota / private mode — silently drop, the chain is still the source of truth
  }
}

export function getCapLabel(capId: string): CapLabel | undefined {
  return read()[capId];
}

export function setCapLabel(capId: string, label: CapLabel): void {
  const store = read();
  store[capId] = { ...store[capId], ...label };
  write(store);
}
