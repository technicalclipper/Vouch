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

  // Deepbook v3. Verified against the @mysten/deepbook-v3 SDK constants.
  deepbook: {
    packageId: string;
    registryId: string;
    deepTreasuryId: string;
    usdcSuiPoolId: string;
    // Shared BalanceManager the executor trades through. Created once via
    // `npm run deepbook -- init` and pasted here. "" until that runs.
    balanceManagerId: string;
    usdcType: string;       // EXACT type the pool uses (DBUSDC on testnet)
    suiType: string;
    deepType: string;
    usdcScalar: number;
    suiScalar: number;
    deepScalar: number;
  };

  // Pyth on Sui testnet. State / wormhole IDs from the SDK constants.
  pyth: {
    pythStateId: string;
    wormholeStateId: string;
    suiUsdFeedId: string;
    suiUsdPriceInfoObjectId: string;
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

  // Deepbook v3 testnet (verified against @mysten/deepbook-v3 SDK v1.5.1
  // constants — the SDK is the canonical source of truth Mysten ships).
  //
  // IMPORTANT: testnet does NOT have a real USDC. The Deepbook v3 testnet
  // "stablecoin" is `DBUSDC` (a mock Mysten ships specifically for testing).
  // The pool we'll trade against is `SUI_DBUSDC` (base=SUI, quote=DBUSDC).
  // Our delegated DCA "buy SUI with USDC" maps to: place a buy order in this
  // pool, paying DBUSDC, receiving SUI. Frontend copy still says "USDC" to
  // the recipient; the substitution is purely a Stage 0 testnet detail.
  deepbook: {
    packageId:
      "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c",
    registryId:
      "0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1",
    deepTreasuryId:
      "0x69fffdae0075f8f71f4fa793549c11079266910e8905169845af1f5d00e09dcb",

    // The pool the executor will route DCA buys through.
    usdcSuiPoolId:
      "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
    // Created 2026-06-18 via `npm run deepbook -- init`. Shared object.
    // Tx: 4dhH1NLTuqYTveQWjGonR5DGdFJck1XQatyjksSp6aho.
    balanceManagerId:
      "0xfec1aab79f151bbff6a225cb54c5299ce5821e59124f655119f7c14083abdad7",

    // EXACT Move types the pool expects (CLAUDE.md §2 gotcha).
    usdcType:
      "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    suiType: "0x2::sui::SUI",
    deepType:
      "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP",

    // Decimal scalars (units per whole token).
    usdcScalar: 1_000_000,
    suiScalar: 1_000_000_000,
    deepScalar: 1_000_000,
  },

  // Pyth on Sui testnet (also from the deepbook-v3 SDK constants — they ship
  // the canonical Pyth state IDs for both networks). Hermes-beta is the
  // testnet/beta endpoint for fetching price update VAAs.
  pyth: {
    pythStateId:
      "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c",
    wormholeStateId:
      "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",
    suiUsdFeedId:
      "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
    // PriceInfoObject for SUI/USD on testnet — the on-chain object the
    // executor's PTB will read via `pyth::price_info::get_price_unsafe`.
    suiUsdPriceInfoObjectId:
      "0x1ebb295c789cc42b3b2a1606482cd1c7124076a0f5676718501fda8c7fd075a0",
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
