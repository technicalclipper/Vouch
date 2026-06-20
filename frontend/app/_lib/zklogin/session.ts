// SPDX-License-Identifier: Apache-2.0
//
// Self-hosted zkLogin flow (deviation from CLAUDE.md §2 — we use Mysten's
// public prover, but no Enoki). Three entry points:
//
//   startSignIn(returnTo)       — generate ephemeral key + nonce, redirect
//                                 the browser to Google's OAuth screen.
//   completeSignIn(idToken)     — back from Google: derive salt + address,
//                                 call Mysten prover, write a session,
//                                 clear pending state.
//   currentSession()/signOut()  — straightforward read + clear.
//
// The salt is derived deterministically from the Google `sub` claim so the
// user gets the same Sui address across sessions without us running a
// salt service. This is a demo simplification; production should use a
// hosted salt service so the salt is private to the user.

"use client";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
} from "@mysten/sui/zklogin";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { toBase64, fromBase64 } from "@mysten/sui/utils";

import { suiClient } from "../chain";
import {
  clearPending,
  clearSession,
  loadPending,
  loadSession,
  saveSession,
  savePending,
  type PendingZkLoginState,
  type ZkLoginSession,
} from "./storage";

// Mysten's public testnet prover. Production deploys should run their own
// (mainnet uses prover.mystenlabs.com).
const PROVER_URL = "https://prover-dev.mystenlabs.com/v1";

// Epoch buffer — how many epochs in the future maxEpoch should be set.
// Sui testnet epochs are ~24h; a buffer of 2 gives the user up to ~48h
// to complete activation before re-signing.
const EPOCH_BUFFER = 2;

function googleClientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID missing — set it in frontend/.env.local",
    );
  }
  return id;
}

function callbackUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/callback`;
}

// ---------- Phase 1: start ----------

export async function startSignIn(returnTo: string): Promise<void> {
  // 1. Ephemeral keypair — lives only as long as maxEpoch is in the future.
  const ephemeral = new Ed25519Keypair();
  const ephemeralSecret = ephemeral.getSecretKey();
  // getSecretKey() returns a bech32 `suiprivkey1…` string; decode + base64
  // for stable JSON-friendly storage.
  const { secretKey } = decodeSuiPrivateKey(ephemeralSecret);
  const ephemeralPublicKey = ephemeral.getPublicKey();

  // 2. Current epoch + buffer.
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = (BigInt(epoch) + BigInt(EPOCH_BUFFER)).toString();

  // 3. Randomness + nonce.
  const randomness = generateRandomness();
  const nonce = generateNonce(ephemeralPublicKey, Number(maxEpoch), randomness);

  // 4. Persist what we need to resume after Google bounces us.
  const pending: PendingZkLoginState = {
    ephemeralSecretKey: toBase64(secretKey),
    ephemeralPublicKey: toBase64(ephemeralPublicKey.toRawBytes()),
    randomness,
    nonce,
    maxEpoch,
    returnTo,
  };
  savePending(pending);

  // 5. Build Google OAuth URL (implicit / id_token flow).
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: callbackUrl(),
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    prompt: "select_account",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------- Phase 2: complete (called from /auth/callback) ----------

interface JwtClaims {
  sub: string;
  aud: string;
  iss: string;
  email?: string;
  name?: string;
  picture?: string;
}

function decodeJwtClaims(jwt: string): JwtClaims {
  const [, payload] = jwt.split(".");
  if (!payload) throw new Error("Malformed JWT");
  // base64url → base64 → bytes → utf8 → JSON.
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  return JSON.parse(decodeURIComponent(escape(json))) as JwtClaims;
}

// Demo salt: sha256(sub) truncated to 16 bytes, interpreted as a big int.
// 16 bytes = 128 bits which fits comfortably under the field modulus the
// circuit expects. Deterministic per Google account, so the user keeps the
// same address across logins. NOT for production — should be a server-held
// secret per user.
async function deterministicSalt(sub: string): Promise<string> {
  const bytes = new TextEncoder().encode(sub);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  const view = new Uint8Array(hash).slice(0, 16);
  let n = 0n;
  for (const b of view) n = (n << 8n) | BigInt(b);
  return n.toString();
}

export async function completeSignIn(jwt: string): Promise<ZkLoginSession> {
  const pending = loadPending();
  if (!pending) {
    throw new Error(
      "No pending zkLogin state — start the sign-in flow again.",
    );
  }

  const claims = decodeJwtClaims(jwt);
  const salt = await deterministicSalt(claims.sub);

  // Address from JWT + salt — pure derivation, no network call.
  const address = jwtToAddress(jwt, salt, false);

  // Rehydrate the ephemeral key so we can compute the extended pubkey for
  // the prover and later sign txs.
  const ephemeral = Ed25519Keypair.fromSecretKey(
    fromBase64(pending.ephemeralSecretKey),
  );
  const extendedPubkey = getExtendedEphemeralPublicKey(ephemeral.getPublicKey());

  // Call Mysten's prover. Returns the ZkLoginInputs (a, b, c, header,
  // address_seed) that get embedded in zkLogin signatures.
  const proofRes = await fetch(PROVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt,
      extendedEphemeralPublicKey: extendedPubkey,
      maxEpoch: pending.maxEpoch,
      jwtRandomness: pending.randomness,
      salt,
      keyClaimName: "sub",
    }),
  });
  if (!proofRes.ok) {
    const body = await proofRes.text();
    throw new Error(`prover ${proofRes.status}: ${body}`);
  }
  const zkProofs = (await proofRes.json()) as unknown;

  const session: ZkLoginSession = {
    jwt,
    sub: claims.sub,
    aud: claims.aud,
    iss: claims.iss,
    salt,
    address,
    zkProofs,
    ephemeralSecretKey: pending.ephemeralSecretKey,
    ephemeralPublicKey: pending.ephemeralPublicKey,
    maxEpoch: pending.maxEpoch,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };

  saveSession(session);
  clearPending();
  return session;
}

// ---------- Read / clear ----------

export function currentSession(): ZkLoginSession | undefined {
  return loadSession();
}

export function signOut(): void {
  clearSession();
  clearPending();
}

export function takePendingReturnTo(): string | undefined {
  const p = loadPending();
  return p?.returnTo;
}
