// SPDX-License-Identifier: Apache-2.0
//
// Sponsored-gas helpers for zkLogin-signed activation (and later: revoke).
//
// The recipient owns a zkLogin address with zero SUI. To submit anything they
// need a sponsor: the sponsor's coin pays gas, the recipient's zkLogin sig
// authorizes the call. Sui supports this natively — the same tx bytes are
// signed by both parties; both signatures get submitted.
//
// Flow (HTTP):
//   1. client POSTs /sponsor/activate/prepare {capId, token, userAddress}
//      → server builds the activate PTB with sender=user, gasOwner=sponsor,
//        signs as sponsor, returns {txBytes (b64), sponsorSig}.
//   2. client signs txBytes with zkLogin → userSig.
//   3. client POSTs /sponsor/activate/submit {txBytes, userSig, sponsorSig}
//      → server submits via executeTransactionBlock with both sigs and
//        returns the digest.
//
// We bounce through the executor for submission so we can surface a single
// digest to the UI without giving the browser a Sui WS connection. Both
// endpoints are demo-grade — production should add origin checks, rate
// limiting, and a stricter argument schema.

import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { fromBase64, toBase64 } from "@mysten/sui/utils";

import { CONFIG } from "../../shared/config.ts";

const CLOCK = "0x6";

// Conservative budget for activate(): one moveCall, one shared-object write.
// Real cost is ~3M MIST; 50M leaves headroom for network volatility.
const ACTIVATE_GAS_BUDGET = 50_000_000n;

// Revoke also touches the vault (refund coin transfer to funder). A little
// more headroom; same order of magnitude.
const REVOKE_GAS_BUDGET = 80_000_000n;

export interface PrepareActivateResult {
  txBytes: string; // base64
  sponsorSig: string;
  sponsorAddress: string;
}

export async function prepareActivate(
  client: SuiClient,
  sponsor: Ed25519Keypair,
  capId: string,
  tokenString: string,
  userAddress: string,
): Promise<PrepareActivateResult> {
  const sponsorAddress = sponsor.toSuiAddress();

  // Pick a SUI coin from the sponsor to pay gas. We just grab the first
  // available one — for the demo the agent has plenty; in prod the sponsor
  // would maintain a small pool of fresh gas coins.
  const coins = await client.getCoins({
    owner: sponsorAddress,
    coinType: "0x2::sui::SUI",
    limit: 50,
  });
  if (coins.data.length === 0) {
    throw new Error(`sponsor ${sponsorAddress} has no SUI coins for gas`);
  }
  // Prefer a coin that comfortably covers the budget. Otherwise fall through.
  const gasCoin =
    coins.data.find((c) => BigInt(c.balance) > ACTIVATE_GAS_BUDGET) ??
    coins.data[0]!;

  const tokenBytes = new TextEncoder().encode(tokenString);

  const tx = new Transaction();
  tx.setSender(userAddress);
  tx.setGasOwner(sponsorAddress);
  tx.setGasBudget(ACTIVATE_GAS_BUDGET);
  tx.setGasPayment([
    {
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest,
    },
  ]);

  tx.moveCall({
    target: `${CONFIG.vouchPackageId}::capability::activate`,
    arguments: [
      tx.object(capId),
      tx.pure(bcs.vector(bcs.U8).serialize(Array.from(tokenBytes)).toBytes()),
      tx.object(CLOCK),
    ],
  });

  const txBytes = await tx.build({ client });
  const { signature: sponsorSig } = await sponsor.signTransaction(txBytes);

  return {
    txBytes: toBase64(txBytes),
    sponsorSig,
    sponsorAddress,
  };
}

export interface SubmitActivateInput {
  txBytes: string; // base64
  userSig: string; // zkLogin signature (base64 with scheme tag)
  sponsorSig: string;
}

export async function submitActivate(
  client: SuiClient,
  input: SubmitActivateInput,
): Promise<{ digest: string }> {
  const res = await client.executeTransactionBlock({
    transactionBlock: fromBase64(input.txBytes),
    signature: [input.userSig, input.sponsorSig],
    options: { showEffects: true },
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(
      `activation failed: ${res.effects?.status?.error ?? "unknown"}`,
    );
  }
  await client.waitForTransaction({ digest: res.digest });
  return { digest: res.digest };
}

// ---------------- Revoke ----------------
// Mirrors the activate flow: build sponsored PTB calling
// `vouch::capability::revoke<USDC>(cap, vault, clock)`, pre-sign as sponsor,
// hand the bytes back to the client to add a zkLogin user-sig over.
//
// The Move call is gated on sender == owner || sender == funder. Recipient
// signs with zkLogin, so the user-sig satisfies `owner`. Funder-side revoke
// goes through the wallet adapter directly (no sponsorship needed).

export async function prepareRevoke(
  client: SuiClient,
  sponsor: Ed25519Keypair,
  capId: string,
  vaultId: string,
  userAddress: string,
): Promise<PrepareActivateResult> {
  const sponsorAddress = sponsor.toSuiAddress();

  const coins = await client.getCoins({
    owner: sponsorAddress,
    coinType: "0x2::sui::SUI",
    limit: 50,
  });
  if (coins.data.length === 0) {
    throw new Error(`sponsor ${sponsorAddress} has no SUI coins for gas`);
  }
  const gasCoin =
    coins.data.find((c) => BigInt(c.balance) > REVOKE_GAS_BUDGET) ??
    coins.data[0]!;

  const tx = new Transaction();
  tx.setSender(userAddress);
  tx.setGasOwner(sponsorAddress);
  tx.setGasBudget(REVOKE_GAS_BUDGET);
  tx.setGasPayment([
    {
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest,
    },
  ]);

  tx.moveCall({
    target: `${CONFIG.vouchPackageId}::capability::revoke`,
    typeArguments: [CONFIG.deepbook.usdcType],
    arguments: [tx.object(capId), tx.object(vaultId), tx.object(CLOCK)],
  });

  const txBytes = await tx.build({ client });
  const { signature: sponsorSig } = await sponsor.signTransaction(txBytes);

  return {
    txBytes: toBase64(txBytes),
    sponsorSig,
    sponsorAddress,
  };
}

// submit() is identical to submitActivate — same dual-sig executeTransactionBlock.
// Re-exported under a revoke-specific name for symmetry at the call site.
export async function submitRevoke(
  client: SuiClient,
  input: SubmitActivateInput,
): Promise<{ digest: string }> {
  const res = await client.executeTransactionBlock({
    transactionBlock: fromBase64(input.txBytes),
    signature: [input.userSig, input.sponsorSig],
    options: { showEffects: true },
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(
      `revoke failed: ${res.effects?.status?.error ?? "unknown"}`,
    );
  }
  await client.waitForTransaction({ digest: res.digest });
  return { digest: res.digest };
}
