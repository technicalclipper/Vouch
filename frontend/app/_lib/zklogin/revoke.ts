// SPDX-License-Identifier: Apache-2.0
//
// Recipient-side revoke. Mirrors `activate.ts`:
//
//   /sponsor/revoke/prepare → server returns txBytes + sponsorSig
//   sign txBytes with ephemeral key → ephemeralSig
//   wrap (proofs + addressSeed + ephemeralSig) → zkLoginSig
//   /sponsor/revoke/submit → server executes, returns digest
//
// The Move call (`vouch::capability::revoke<USDC>`) checks
// sender == cap.owner || sender == cap.funder. The zkLogin sig binds the
// recipient's address, satisfying the owner branch.

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

export async function revokeCapability(
  session: ZkLoginSession,
  capId: string,
  vaultId: string,
): Promise<{ digest: string }> {
  const prep = await postJson<PrepareResponse>(
    "/sponsor/revoke/prepare",
    { capId, vaultId, userAddress: session.address },
  );

  const ephemeral = Ed25519Keypair.fromSecretKey(
    fromBase64(session.ephemeralSecretKey),
  );
  const txBytes = fromBase64(prep.txBytes);
  const { signature: ephemeralSig } = await ephemeral.signTransaction(txBytes);

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

  const result = await postJson<SubmitResponse>(
    "/sponsor/revoke/submit",
    {
      txBytes: prep.txBytes,
      userSig: zkLoginSig,
      sponsorSig: prep.sponsorSig,
    },
  );

  return result;
}
