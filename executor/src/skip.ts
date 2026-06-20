// SPDX-License-Identifier: Apache-2.0
//
// Skip PTB — invoked when risk evaluation blocks an execution. Consumes the
// slot (executions_done++, schedule advances) but leaves the budget intact.

import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

import { CONFIG } from "../../shared/config.ts";
import type { CapState } from "./cap.ts";

const CLOCK = "0x6";

export async function submitSkip(
  client: SuiClient,
  kp: Ed25519Keypair,
  cap: CapState,
  reason: string,
): Promise<{ digest: string }> {
  const reasonBytes = new TextEncoder().encode(reason);

  const tx = new Transaction();
  tx.moveCall({
    target: `${CONFIG.vouchPackageId}::capability::log_skip`,
    arguments: [
      tx.object(cap.capId),
      tx.pure(bcs.vector(bcs.U8).serialize(Array.from(reasonBytes)).toBytes()),
      tx.object(CLOCK),
    ],
  });

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: res.digest });

  if (res.effects?.status?.status !== "success") {
    throw new Error(
      `skip PTB failed: ${res.effects?.status?.error ?? "unknown"} (digest ${res.digest})`,
    );
  }
  return { digest: res.digest };
}
