// SPDX-License-Identifier: Apache-2.0
//
// Stage 3 zkLogin: tiny localStorage wrapper for the in-progress sign-in
// state and the resolved session. Two slots:
//
//   vouch.zklogin.pending  — set before redirecting to Google. Holds the
//                            ephemeral keypair + randomness + maxEpoch so
//                            we can pick up the flow after the OAuth
//                            round-trip. Cleared on completeSignIn().
//
//   vouch.zklogin.session  — set after completeSignIn(). Holds the JWT,
//                            ZK proof inputs, ephemeral keypair (still
//                            valid until maxEpoch passes), and derived
//                            Sui address. Cleared on signOut() / expiry.
//
// Everything is JSON; bigints are serialized as decimal strings.

"use client";

export interface PendingZkLoginState {
  ephemeralSecretKey: string; // base64
  ephemeralPublicKey: string; // base64
  randomness: string; // decimal string
  nonce: string;
  maxEpoch: string; // decimal string
  // Where the user was trying to go before we punted them to Google.
  // Used by /auth/callback to redirect back.
  returnTo: string;
}

export interface ZkLoginSession {
  // From OAuth + prover.
  jwt: string;
  sub: string;
  aud: string;
  iss: string;
  salt: string; // decimal string
  address: string; // 0x… Sui address
  // ZK proof inputs returned by the prover; needed to build user sigs.
  zkProofs: unknown;
  // Ephemeral keypair (valid until maxEpoch passes).
  ephemeralSecretKey: string; // base64
  ephemeralPublicKey: string; // base64
  maxEpoch: string;
  // For UI.
  email?: string;
  picture?: string;
  name?: string;
}

const PENDING_KEY = "vouch.zklogin.pending";
const SESSION_KEY = "vouch.zklogin.session";

export function savePending(p: PendingZkLoginState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

export function loadPending(): PendingZkLoginState | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(PENDING_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingZkLoginState;
  } catch {
    return undefined;
  }
}

export function clearPending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_KEY);
}

export function saveSession(s: ZkLoginSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("vouch:zklogin"));
}

export function loadSession(): ZkLoginSession | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ZkLoginSession;
  } catch {
    return undefined;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("vouch:zklogin"));
}
