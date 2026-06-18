// SPDX-License-Identifier: Apache-2.0
//
// Single source of truth for every chain-specific value in Vouch.
// CLAUDE.md §8 / §12: NEVER hardcode package/pool/token IDs anywhere else.
// Anything that touches the chain (executor, frontends, scripts) must import
// from here so a redeploy = one edit in this file.

export type VouchConfig = {
  network: "testnet" | "mainnet" | "devnet" | "localnet";
  rpcUrl: string;

  // Our Move package, published via `sui client publish` from /contracts.
  vouchPackageId: string;
  vouchUpgradeCapId: string;

  // Deepbook v3. testnet IDs to be filled in Stage 0 (see CLAUDE.md §9):
  // confirm the v3 testnet package + pool + exact coin types.
  deepbook: {
    packageId: string;
    usdcSuiPoolId: string;
    usdcType: string;       // EXACT type the pool uses
    suiType: string;
    deepType: string;
  };

  // Pyth on Sui testnet. Filled in Stage 0.
  pyth: {
    suiUsdFeedId: string;
    endpoint: string;
  };

  // Enoki hosted zkLogin + sponsored gas. Filled in Stage 3.
  enoki: {
    apiKey: string | undefined;
  };

  // The executor's identity. Address derived from AGENT_PRIVATE_KEY env.
  agent: {
    address: string;
    keypairEnv: string;
  };

  // Demo affordances. See CLAUDE.md §6 — must exist so the risk-skip path
  // is reliably demonstrable even when testnet Pyth is flat.
  demoMode: {
    forcePriceDrop: boolean;
    syntheticPriceUsd: number | null;
  };
};

export const CONFIG: VouchConfig = {
  network: "testnet",
  rpcUrl: "https://fullnode.testnet.sui.io",

  // Published 2026-06-18 via `sui client publish`
  // Tx digest: D3uqGB1iKkbDwmUFRaJF1TRRa5k9qy8DVsyu1Dd3YTV9
  // Modules: vouch::capability, vouch::vault
  vouchPackageId:
    "0xbb7d414c3f94da7efd1496f9c2c390662beca4e0eabea3831e15bc22ab2bcffd",
  vouchUpgradeCapId:
    "0x7d45468c33732c137a6d52fc34e1f58d71e1c84170986b717032970fee453e7c",

  // TODO(Stage 0): fill these in from the chosen Deepbook v3 testnet pool.
  // See CLAUDE.md §2 critical gotchas — wrong USDC type = won't compile.
  deepbook: {
    packageId: "0x0",
    usdcSuiPoolId: "0x0",
    usdcType: "0x0::usdc::USDC",
    suiType: "0x2::sui::SUI",
    deepType: "0x0::deep::DEEP",
  },

  // TODO(Stage 4): fill once we wire the Pyth client.
  pyth: {
    suiUsdFeedId: "0x0",
    endpoint: "https://hermes-beta.pyth.network",
  },

  enoki: {
    apiKey: process.env.ENOKI_API_KEY,
  },

  // The dev keypair used during Stage 1 testing. The mnemonic for this
  // address lives ONLY in the local sui keystore; never commit a private key.
  // For Stage 2 the executor will read AGENT_PRIVATE_KEY from env and
  // `agent.address` here should be updated to that key's derived address.
  agent: {
    address:
      "0xeff48ffbc87d1fbbd6d12f25297502f1758981df2f886109f171dc605533ac21",
    keypairEnv: "AGENT_PRIVATE_KEY",
  },

  demoMode: {
    forcePriceDrop: false,
    syntheticPriceUsd: null,
  },
};
