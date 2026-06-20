// SPDX-License-Identifier: Apache-2.0
//
// Frontend-local copy of `shared/config.ts`.
//
// WHY: Next.js 16's Turbopack can't follow imports outside the frontend
// project root without panicking or producing manifest-resolution errors.
// `turbopack.root` settings and symlinks all failed in testing. The simple
// thing that works: keep a copy here and the canonical file at
// `shared/config.ts` (used by executor + scripts). They MUST stay in sync.
//
// If you update one, copy the changes to the other. The values below mirror
// shared/config.ts as of 2026-06-20 (vouch package + Deepbook v3 testnet
// SUI_DBUSDC pool).

export type VouchConfig = {
  network: "testnet" | "mainnet" | "devnet" | "localnet";
  rpcUrl: string;
  vouchPackageId: string;
  vouchUpgradeCapId: string;
  deepbook: {
    packageId: string;
    registryId: string;
    deepTreasuryId: string;
    usdcSuiPoolId: string;
    balanceManagerId: string;
    usdcType: string;
    suiType: string;
    deepType: string;
    usdcScalar: number;
    suiScalar: number;
    deepScalar: number;
  };
  pyth: {
    pythStateId: string;
    wormholeStateId: string;
    suiUsdFeedId: string;
    suiUsdPriceInfoObjectId: string;
    endpoint: string;
  };
  enoki: { apiKey: string | undefined };
  agent: { address: string; keypairEnv: string };
  demoMode: { forcePriceDrop: boolean; syntheticPriceUsd: number | null };
};

export const CONFIG: VouchConfig = {
  network: "testnet",
  rpcUrl: "https://fullnode.testnet.sui.io",
  vouchPackageId:
    "0xbb7d414c3f94da7efd1496f9c2c390662beca4e0eabea3831e15bc22ab2bcffd",
  vouchUpgradeCapId:
    "0x7d45468c33732c137a6d52fc34e1f58d71e1c84170986b717032970fee453e7c",
  deepbook: {
    packageId:
      "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c",
    registryId:
      "0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1",
    deepTreasuryId:
      "0x69fffdae0075f8f71f4fa793549c11079266910e8905169845af1f5d00e09dcb",
    usdcSuiPoolId:
      "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
    balanceManagerId:
      "0xfec1aab79f151bbff6a225cb54c5299ce5821e59124f655119f7c14083abdad7",
    usdcType:
      "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    suiType: "0x2::sui::SUI",
    deepType:
      "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP",
    usdcScalar: 1_000_000,
    suiScalar: 1_000_000_000,
    deepScalar: 1_000_000,
  },
  pyth: {
    pythStateId:
      "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c",
    wormholeStateId:
      "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",
    suiUsdFeedId:
      "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
    suiUsdPriceInfoObjectId:
      "0x1ebb295c789cc42b3b2a1606482cd1c7124076a0f5676718501fda8c7fd075a0",
    endpoint: "https://hermes-beta.pyth.network",
  },
  enoki: { apiKey: process.env.ENOKI_API_KEY },
  agent: {
    address:
      "0xeff48ffbc87d1fbbd6d12f25297502f1758981df2f886109f171dc605533ac21",
    keypairEnv: "AGENT_PRIVATE_KEY",
  },
  demoMode: { forcePriceDrop: false, syntheticPriceUsd: null },
};
