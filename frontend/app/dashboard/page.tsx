"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Card } from "../_components/Card";
import { Button } from "../_components/Button";
import { ConnectWallet } from "../_components/ConnectWallet";
import { StatusPill } from "../_components/StatusPill";
import { getAll, subscribe } from "../_lib/mockStore";
import { useChainCapabilitiesByFunder } from "../_lib/useChainCapability";
import { getCapLabel } from "../_lib/capLabels";
import type { Capability } from "../_lib/types";
import { formatUsd, formatNextBuy } from "../_lib/format";

// C3 (list view) in DESIGN.md §5.
// Wallet connected → list every cap whose `funder == account.address` (chain).
// Wallet disconnected → fall back to the mockStore so the dev landing flow keeps working.
export default function DashboardPage() {
  const account = useCurrentAccount();
  const chainMode = !!account;
  const { caps: chainCaps, ready: chainReady } = useChainCapabilitiesByFunder(
    account?.address,
  );

  const [mockCaps, setMockCaps] = useState<Capability[]>([]);
  useEffect(() => {
    if (chainMode) return;
    const read = () => setMockCaps(getAll());
    read();
    return subscribe(read);
  }, [chainMode]);

  const rawCaps = chainMode ? chainCaps : mockCaps;
  // Overlay creator-private labels (nickname + funder name) from localStorage.
  // No-op for mock caps because they already carry both fields.
  const caps = chainMode
    ? rawCaps.map((c) => {
        const meta = getCapLabel(c.id);
        return {
          ...c,
          recipient_label: c.recipient_label ?? meta?.label,
          funder_name: meta?.funderName ?? c.funder_name,
        };
      })
    : rawCaps;
  const showLoading = chainMode && !chainReady && caps.length === 0;

  return (
    <main
      data-flow="creator"
      className="mx-auto w-full max-w-5xl px-6 py-12"
    >
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">
            Dashboard
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight">
            Your delegations
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ConnectWallet />
          <Link href="/create">
            <Button size="md" variant="primary">
              + New delegation
            </Button>
          </Link>
        </div>
      </header>

      {!chainMode ? (
        <Card fill="soft" className="mb-4 !p-3">
          <p className="text-sm text-muted">
            Connect a wallet to see delegations you funded on chain. Showing
            local demo data below.
          </p>
        </Card>
      ) : null}

      {showLoading ? (
        <Card>
          <p className="text-base text-muted">Loading from chain…</p>
        </Card>
      ) : caps.length === 0 ? (
        <Card>
          <p className="text-base">No delegations yet.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {caps.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/${c.id}`}
                className="block nb-border nb-shadow nb-pressable rounded-[var(--radius-lg)] bg-surface p-5 nb-focus"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">
                        {c.recipient_label ?? "Untitled"}
                      </p>
                      <StatusPill status={c.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      DCA {formatUsd(c.intent.amount_per_execution)}{" "}
                      {c.intent.frequency === "weekly"
                        ? `/ ${c.intent.day_of_week ?? "week"}`
                        : `/ ${c.intent.frequency}`}{" "}
                      · {c.executions_done}/{c.intent.total_executions} done
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-2xl font-extrabold">
                      {formatUsd(c.budget_total - c.budget_remaining)}
                    </p>
                    <p className="text-sm text-muted">
                      of {formatUsd(c.budget_total)} used
                    </p>
                    {c.status === "active" ? (
                      <p className="mt-1 text-sm text-muted">
                        Next: {formatNextBuy(c.next_execution_at)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
