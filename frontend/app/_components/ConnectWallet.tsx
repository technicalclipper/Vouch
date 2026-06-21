"use client";

// Wallet connect button + connected-state pill, styled to match our
// neobrutalist theme. Uses dapp-kit primitives for the actual connect/disconnect
// flow but renders our own button so it doesn't clash with the rest of the UI.
//
// When connected, shows the truncated address and a "Disconnect" affordance.
// When disconnected, shows a single primary button that opens dapp-kit's modal.

import {
  ConnectModal,
  useCurrentAccount,
  useDisconnectWallet,
} from "@mysten/dapp-kit";
import { useState } from "react";

import { Button } from "./Button";

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWallet() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [modalOpen, setModalOpen] = useState(false);

  if (!account) {
    return (
      <ConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        trigger={
          <Button
            size="md"
            variant="primary"
            onClick={() => setModalOpen(true)}
          >
            Connect wallet
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="nb-border rounded-[var(--radius)] bg-surface px-3 py-1.5 text-sm font-medium font-mono"
        title={account.address}
      >
        {shortAddress(account.address)}
      </span>
      <Button size="md" variant="ghost" onClick={() => disconnect()}>
        Disconnect
      </Button>
    </div>
  );
}
