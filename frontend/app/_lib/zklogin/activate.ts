// SPDX-License-Identifier: Apache-2.0
//
// Phase B: zkLogin-signed activation PTB submission.
//
// The recipient has just signed in via Google → derived a zkLogin address +
// ephemeral keypair + ZK proofs (see session.ts). To activate the capability
// on chain they need to send `vouch::capability::activate(cap, token, clock)`
// from that address. Two complications vs. a normal wallet tx:
//
//   1. Gas. The zkLogin address has zero SUI. The executor sponsors gas.
//   2. Signature. zkLogin signatures are constructed from the ZK proof +
//      address seed + ephemeral signature. The SDK helper `getZkLoginSignature`
//      bundles them.
//
// Flow:
//   /sponsor/activate/prepare → server returns txBytes + sponsorSig
//   sign txBytes with ephemeral key → ephemeralSig
//   wrap (proofs + addressSeed + ephemeralSig) → zkLoginSig via SDK helper
//   /sponsor/activate/submit → server executes, returns digest

"use client";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  genAddressSeed,
  getZkLoginSignature,
} from "@mysten/sui/zklogin";
import { fromBase64 } from "@mysten/sui/utils";

import { executorBaseUrl } from "../executor";
import type { ZkLoginSession } from "./storage";

interface PrepareResponse {
  txBytes: string;
  sponsorSig: string;
  sponsorAddress: string;
}

interface SubmitResponse {
  digest: string;
}

interface ErrResponse {
  error?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${executorBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & ErrResponse) : ({} as T & ErrResponse);
  if (!res.ok) {
    throw new Error(data.error ?? `sponsor ${path} ${res.status}`);
  }
  return data as T;
}

export async function activateCapability(
  session: ZkLoginSession,
  capId: string,
  tokenString: string,
): Promise<{ digest: string }> {
  // 1. Ask the sponsor backend to build + pre-sign the activation PTB.
  const prep = await postJson<PrepareResponse>(
    "/sponsor/activate/prepare",
    { capId, token: tokenString, userAddress: session.address },
  );

  // 2. Rehydrate the ephemeral keypair, sign the same tx bytes.
  const ephemeral = Ed25519Keypair.fromSecretKey(
    fromBase64(session.ephemeralSecretKey),
  );
  const txBytes = fromBase64(prep.txBytes);
  const { signature: ephemeralSig } = await ephemeral.signTransaction(txBytes);

  // 3. Combine the prover output + address seed + ephemeral sig into the
  // full zkLogin signature.
  const addressSeed = genAddressSeed(
    BigInt(session.salt),
    "sub",
    session.sub,
    session.aud,
  ).toString();

  const zkProofs = session.zkProofs as Record<string, unknown>;
  const zkLoginSig = getZkLoginSignature({
    inputs: {
      ...(zkProofs as object),
      addressSeed,
    } as Parameters<typeof getZkLoginSignature>[0]["inputs"],
    maxEpoch: session.maxEpoch,
    userSignature: ephemeralSig,
  });

  // 4. Send everything back; executor submits and returns the digest.
  const result = await postJson<SubmitResponse>(
    "/sponsor/activate/submit",
    {
      txBytes: prep.txBytes,
      userSig: zkLoginSig,
      sponsorSig: prep.sponsorSig,
    },
  );

  return result;
}
