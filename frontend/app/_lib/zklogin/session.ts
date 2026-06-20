// SPDX-License-Identifier: Apache-2.0
//
// zkLogin flow backed by Enoki for prover + salt service.
//
// Why Enoki: Mysten's open prover-dev endpoint is gated to Sui devnet's
// verifying key. Vouch runs on testnet, where devnet proofs Groth16-fail.
// Enoki produces testnet-compatible proofs and hosts the per-user salt.
//
// Three entry points:
//
//   startSignIn(returnTo)       — generate ephemeral key + nonce, redirect
//                                 the browser to Google's OAuth screen.
//   completeSignIn(idToken)     — back from Google: ask Enoki for salt +
//                                 address, ask Enoki for the zk proof,
//                                 write a session, clear pending state.
//   currentSession()/signOut()  — straightforward read + clear.

"use client";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
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

// Enoki hosted zkLogin service. Same endpoint serves testnet + mainnet;
// the network is selected per-request in the body.
const ENOKI_BASE = "https://api.enoki.mystenlabs.com/v1";

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

function enokiApiKey(): string {
  const k = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
  if (!k) {
    throw new Error(
      "NEXT_PUBLIC_ENOKI_API_KEY missing — set it in frontend/.env.local",
    );
  }
  return k;
}

async function enokiFetch<T>(
  method: "GET" | "POST",
  path: string,
  jwt: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${enokiApiKey()}`,
    "zklogin-jwt": jwt,
  };
  if (method === "POST") headers["Content-Type"] = "application/json";
  const res = await fetch(`${ENOKI_BASE}${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`enoki ${path} ${res.status}: ${text}`);
  }
  return JSON.parse(text) as T;
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

interface EnokiZkLoginResponse {
  data: { salt: string; address: string; publicKey: string };
}

interface EnokiZkpResponse {
  data: unknown; // {proofPoints, issBase64Details, headerBase64}
}

export async function completeSignIn(jwt: string): Promise<ZkLoginSession> {
  const pending = loadPending();
  if (!pending) {
    throw new Error(
      "No pending zkLogin state — start the sign-in flow again.",
    );
  }

  const claims = decodeJwtClaims(jwt);

  // 1. Salt + address from Enoki. Enoki stores a per-user salt keyed by the
  // JWT's (iss, sub) and returns it on every call, so the same Google
  // account always derives the same Sui address. GET endpoint — JWT in
  // the `zklogin-jwt` header is the only input.
  const idRes = await enokiFetch<EnokiZkLoginResponse>(
    "GET",
    "/zklogin",
    jwt,
  );
  const salt = idRes.data.salt;
  const address = idRes.data.address;

  // 2. Rehydrate the ephemeral key, get its sui-encoded public key for the
  // prover request.
  const ephemeral = Ed25519Keypair.fromSecretKey(
    fromBase64(pending.ephemeralSecretKey),
  );
  const extendedPubkey = getExtendedEphemeralPublicKey(ephemeral.getPublicKey());

  // 3. Ask Enoki for the zk proof. Network must match the fullnode the
  // executor / chain reads talk to (testnet).
  const zkpRes = await enokiFetch<EnokiZkpResponse>(
    "POST",
    "/zklogin/zkp",
    jwt,
    {
      network: "testnet",
      ephemeralPublicKey: extendedPubkey,
      maxEpoch: Number(pending.maxEpoch),
      randomness: pending.randomness,
    },
  );
  const zkProofs = zkpRes.data;

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
