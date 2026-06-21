// SPDX-License-Identifier: Apache-2.0
//
// Creator-side wallet-signed revoke. Mirrors the recipient zkLogin revoke
// (frontend/app/_lib/zklogin/revoke.ts) but uses dapp-kit's connected wallet
// to sign instead of the sponsored zkLogin flow.
//
// The Move function `capability::revoke<DBUSDC>` accepts either the funder
// or the owner as sender — same entrypoint, different signer.

"use client";

import { Transaction } from "@mysten/sui/transactions";

import { CONFIG } from "../config";
import { suiClient } from "../chain";

const CLOCK = "0x6";

export interface RevokeInput {
  capId: string;
  vaultId: string;
  userAddress: string; // connected funder wallet address
  signAndExecute: (input: {
    transaction: Transaction;
  }) => Promise<{ digest: string }>;
}

export interface RevokeOutput {
  digest: string;
}

export async function revokeCapabilityOnChain(
  input: RevokeInput,
): Promise<RevokeOutput> {
  const { capId, vaultId, userAddress, signAndExecute } = input;

  const tx = new Transaction();
  // Explicit sender + gas budget so Suiet's internal dry-run doesn't
  // surface a generic "Incorrect password" error (same gotcha as createCapability).
  tx.setSender(userAddress);
  tx.setGasBudget(80_000_000n);

  tx.moveCall({
    target: `${CONFIG.vouchPackageLatest}::capability::revoke`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [tx.object(capId), tx.object(vaultId), tx.object(CLOCK)],
  });

  // Pre-flight dry-run for clearer errors than the wallet's catch-all.
  const built = await tx.build({ client: suiClient });
  const dry = await suiClient.dryRunTransactionBlock({ transactionBlock: built });
  if (dry.effects.status.status !== "success") {
    throw new Error(
      `revoke pre-flight failed: ${dry.effects.status.error ?? "unknown"}`,
    );
  }

  const submitted = await signAndExecute({ transaction: tx });
  const full = await suiClient.waitForTransaction({
    digest: submitted.digest,
    options: { showEffects: true },
  });
  if (full.effects?.status?.status !== "success") {
    throw new Error(
      `revoke tx failed: ${full.effects?.status?.error ?? "unknown"} (${submitted.digest})`,
    );
  }
  return { digest: submitted.digest };
}
