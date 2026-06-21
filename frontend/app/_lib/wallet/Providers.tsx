"use client";

// dapp-kit + react-query providers. Wraps the whole app so any client
// component can call useCurrentAccount / useSignAndExecuteTransaction.
//
// We point the SuiClientProvider at the same testnet RPC URL as the rest of
// the app (CONFIG.rpcUrl, CLAUDE.md §8) and let WalletProvider auto-connect
// the last-used wallet so the creator doesn't have to re-pick after refresh.

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
} from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";

import { CONFIG } from "../config";

const { networkConfig } = createNetworkConfig({
  testnet: { url: CONFIG.rpcUrl, network: "testnet" },
});

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
